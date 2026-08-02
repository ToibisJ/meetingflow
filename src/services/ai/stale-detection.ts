import "server-only";

import { StaleRecommendationSchema, type StaleRecommendation } from "./schemas";
import { dataBlock, formatDate, systemPrompt } from "./prompts";
import { runStructured, type AiCallResult, type AiContext } from "./gateway";
import { computePriority, type PriorityResult } from "./priority";
import { requestVisibility } from "@/services/requests/visibility";
import { slaSettings } from "@/services/settings";
import { OPEN_STATUSES } from "@/lib/workflow";

/**
 * Finding requests that have quietly stopped moving, and saying what to do.
 *
 * Detection is arithmetic — a request is stale when it has had no activity for
 * longer than the organization's configured window. The model is only used for
 * the recommendation, and only on a single request at a time.
 */

const ROLE =
  "You look at one meeting request that has stopped progressing and recommend the single next action for the coordinator.";

export type StaleRequest = {
  id: string;
  requestNumber: number;
  subject: string;
  status: string;
  contactName: string;
  company: string | null;
  daysSinceActivity: number;
  contactAttempts: number;
  priority: PriorityResult;
};

/** Deterministic. No model involved. */
export async function findStaleRequests(
  ctx: AiContext,
  limit = 20,
): Promise<StaleRequest[]> {
  const visible = await requestVisibility(ctx.db, ctx.session);
  const sla = await slaSettings(ctx.db);
  const cutoff = new Date(Date.now() - sla.noActivityDays * 86_400_000);

  const rows = await ctx.db.meetingRequest.findMany({
    where: {
      ...visible,
      status: { in: OPEN_STATUSES },
      lastActivityAt: { lt: cutoff },
    },
    select: {
      id: true,
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
      activities: { where: { type: "CONTACT_ATTEMPT" }, select: { id: true } },
    },
    orderBy: { lastActivityAt: "asc" },
    take: limit,
  });

  return rows
    .map((row) => ({
      id: row.id,
      requestNumber: row.requestNumber,
      subject: row.subject,
      status: row.status,
      contactName: row.contact.fullName,
      company: row.contact.company,
      daysSinceActivity: Math.floor(
        (Date.now() - row.lastActivityAt.getTime()) / 86_400_000,
      ),
      contactAttempts: row.activities.length,
      priority: computePriority({
        priority: row.priority,
        status: row.status,
        slaState: row.slaState,
        createdAt: row.createdAt,
        lastActivityAt: row.lastActivityAt,
        preferredDate: row.preferredDate,
        scheduledAt: row.scheduledAt,
        contactAttempts: row.activities.length,
        replyReceived: false,
        companyRequestCount: 0,
      }),
    }))
    .sort((a, b) => b.priority.score - a.priority.score);
}

export async function recommendForStale(
  ctx: AiContext,
  requestId: string,
): Promise<AiCallResult<StaleRecommendation>> {
  const request = await ctx.db.meetingRequest.findUnique({
    where: { id: requestId },
    select: {
      requestNumber: true,
      subject: true,
      status: true,
      priority: true,
      createdAt: true,
      lastActivityAt: true,
      preferredDate: true,
      contact: { select: { fullName: true, company: true, email: true, phone: true } },
      activities: {
        select: {
          type: true,
          channel: true,
          outcome: true,
          body: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: "asc" },
        take: 25,
      },
    },
  });

  if (!request) {
    return { ok: false, errorType: "not_found", message: "Request not found" };
  }

  return runStructured(ctx, {
    feature: "STALE_RECOMMENDATION",
    permission: "request:logActivity",
    system: systemPrompt(ROLE, ctx.session.locale),
    prompt: [
      dataBlock("request", {
        number: request.requestNumber,
        subject: request.subject,
        status: request.status,
        priority: request.priority,
        openedAt: formatDate(request.createdAt),
        lastActivityAt: formatDate(request.lastActivityAt),
        desiredDate: formatDate(request.preferredDate),
        contactHasEmail: Boolean(request.contact.email),
        contactHasPhone: Boolean(request.contact.phone),
      }),
      dataBlock(
        "everything that has happened so far",
        request.activities.map((activity) => ({
          at: formatDate(activity.occurredAt),
          type: activity.type,
          channel: activity.channel,
          outcome: activity.outcome,
          note: activity.body,
        })),
      ),
      "",
      "Say in one sentence why this looks stuck, choose exactly one recommended action, and justify it in one sentence.",
      "Do not recommend a channel the contact has no address or number for.",
    ].join("\n\n"),
    schema: StaleRecommendationSchema,
    effort: "low",
    maxTokens: 5000,
    cacheSystem: true,
    record: { entityType: "MeetingRequest", entityId: requestId },
  });
}
