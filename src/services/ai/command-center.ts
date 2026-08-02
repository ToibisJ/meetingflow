import "server-only";

import { CommandCenterSchema, type CommandCenter } from "./schemas";
import { dataBlock, systemPrompt } from "./prompts";
import { runStructured, type AiCallResult, type AiContext } from "./gateway";
import { computePriority, factorSummary } from "./priority";
import { dashboardSnapshot, type DashboardSnapshot } from "@/services/dashboard/attention";
import { requestVisibility } from "@/services/requests/visibility";
import { OPEN_STATUSES } from "@/lib/workflow";

/**
 * The morning briefing at the top of the coordinator dashboard.
 *
 * The counters and the shortlist are computed here from the database. The model
 * receives those exact values and does two things: phrase them, and order the
 * recommended actions. It cannot change a number, and every action it proposes
 * must point at a request number that appears in the data it was given.
 */

export type CommandCenterResult = {
  snapshot: DashboardSnapshot;
  /** Present only when a model is configured and the call succeeded. */
  brief: CommandCenter | null;
  /** Set when the model was unavailable or refused, for the UI to show quietly. */
  unavailableReason: string | null;
  suggestionId: string | null;
};

const ROLE =
  "You write the daily briefing for a meeting coordinator. You summarise their workload and tell them what to do first.";

export async function buildCommandCenter(
  ctx: AiContext,
): Promise<CommandCenterResult> {
  const snapshot = await dashboardSnapshot(ctx.db, ctx.session);
  const visible = await requestVisibility(ctx.db, ctx.session);

  // The shortlist the model is allowed to talk about: open requests the user
  // can see, ranked by the deterministic priority engine.
  const open = await ctx.db.meetingRequest.findMany({
    where: { ...visible, status: { in: OPEN_STATUSES } },
    select: {
      requestNumber: true,
      subject: true,
      status: true,
      priority: true,
      slaState: true,
      createdAt: true,
      lastActivityAt: true,
      preferredDate: true,
      scheduledAt: true,
      contact: { select: { fullName: true, company: true } },
      requester: { select: { fullName: true } },
      coordinator: { select: { fullName: true } },
      _count: { select: { activities: true } },
    },
    orderBy: { lastActivityAt: "asc" },
    take: 40,
  });

  const ranked = open
    .map((request) => {
      const scored = computePriority({
        priority: request.priority,
        status: request.status,
        slaState: request.slaState,
        createdAt: request.createdAt,
        lastActivityAt: request.lastActivityAt,
        preferredDate: request.preferredDate,
        scheduledAt: request.scheduledAt,
        contactAttempts: request._count.activities,
        replyReceived: false,
        companyRequestCount: 0,
      });

      return {
        requestNumber: request.requestNumber,
        subject: request.subject,
        status: request.status,
        contact: request.contact.fullName,
        company: request.contact.company,
        requester: request.requester.fullName,
        coordinator: request.coordinator?.fullName ?? null,
        daysSinceActivity: Math.floor(
          (Date.now() - request.lastActivityAt.getTime()) / 86_400_000,
        ),
        priorityScore: scored.score,
        why: factorSummary(scored),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 10);

  const prompt = [
    `The signed-in coordinator is ${ctx.session.fullName}.`,
    dataBlock("counters", snapshot.counters),
    dataBlock(
      "attention",
      snapshot.attention.map((bucket) => ({
        kind: bucket.key,
        count: bucket.count,
        params: bucket.params,
      })),
    ),
    dataBlock("top open requests by computed priority", ranked),
    "",
    "Write a greeting, a one-sentence headline built only from the counters, and up to five recommended actions.",
    "Every action must reference a requestNumber from the shortlist, or use null when it is a general action such as clearing a backlog.",
    "Order the actions so the most time-critical is first. Do not repeat the same request twice.",
  ].join("\n\n");

  const result: AiCallResult<CommandCenter> = await runStructured(ctx, {
    feature: "COMMAND_CENTER",
    permission: "request:read:all",
    system: systemPrompt(ROLE, ctx.session.locale),
    prompt,
    schema: CommandCenterSchema,
    effort: "low",
    maxTokens: 6000,
    cacheSystem: true,
  });

  if (!result.ok) {
    return {
      snapshot,
      brief: null,
      unavailableReason: result.message,
      suggestionId: null,
    };
  }

  // Guard rail: drop any action pointing at a request the model was not shown.
  const allowed = new Set(ranked.map((row) => row.requestNumber));
  const brief: CommandCenter = {
    ...result.value,
    actions: result.value.actions.filter(
      (action) =>
        action.requestNumber === null || allowed.has(action.requestNumber),
    ),
  };

  return {
    snapshot,
    brief,
    unavailableReason: null,
    suggestionId: result.suggestionId,
  };
}
