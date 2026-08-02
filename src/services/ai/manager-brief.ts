import "server-only";

import { ManagerBriefSchema, type ManagerBrief } from "./schemas";
import { dataBlock, systemPrompt } from "./prompts";
import { runStructured, type AiContext } from "./gateway";
import { requestVisibility } from "@/services/requests/visibility";
import { BOOKED_STATUSES } from "@/lib/workflow";

/**
 * The management brief.
 *
 * Every figure below is measured here and handed to the model as a fixed set of
 * numbers. The model writes sentences around them. It is told explicitly that
 * a trend it was not given data for must be reported as null rather than
 * guessed.
 */

const ROLE =
  "You write a short management brief about meeting coordination activity. You use only the figures supplied, and you never estimate.";

export type BriefMetrics = {
  windowDays: number;
  requestsOpened: number;
  meetingsScheduled: number;
  meetingsHeld: number;
  meetingsCancelled: number;
  meetingsNotHeld: number;
  followUpMeetings: number;
  completedWithSummary: number;
  stillAwaitingCoordination: number;
  openLongerThanFiveDays: number;
  endedWithoutSummary: number;
  averageHoursToSchedule: number | null;
  averageContactAttempts: number | null;
  previousAverageHoursToSchedule: number | null;
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function measure(
  ctx: AiContext,
  windowDays: number,
): Promise<BriefMetrics> {
  const visible = await requestVisibility(ctx.db, ctx.session);
  const since = daysAgo(windowDays);
  const previousSince = daysAgo(windowDays * 2);

  const scopedSince = { ...visible, createdAt: { gte: since } };

  const [
    requestsOpened,
    meetingsScheduled,
    meetingsHeld,
    meetingsCancelled,
    meetingsNotHeld,
    followUpMeetings,
    completedWithSummary,
    stillAwaitingCoordination,
    openLongerThanFiveDays,
    endedWithoutSummary,
    scheduledSample,
    previousSample,
    attemptAggregate,
  ] = await Promise.all([
    ctx.db.meetingRequest.count({ where: scopedSince }),
    ctx.db.meetingRequest.count({
      where: { ...visible, scheduledAt: { gte: since } },
    }),
    ctx.db.meeting.count({
      where: { status: "HELD", scheduledStart: { gte: since } },
    }),
    ctx.db.meetingRequest.count({
      where: { ...visible, status: "CANCELLED", closedAt: { gte: since } },
    }),
    ctx.db.meetingSummary.count({
      where: { tookPlace: false, submittedAt: { gte: since } },
    }),
    ctx.db.meetingRequest.count({
      where: { ...visible, parentRequestId: { not: null }, createdAt: { gte: since } },
    }),
    ctx.db.meetingRequest.count({
      where: { ...visible, status: "COMPLETED", closedAt: { gte: since } },
    }),
    ctx.db.meetingRequest.count({
      where: { ...visible, status: { in: ["NEW", "NEEDS_COORDINATION"] } },
    }),
    ctx.db.meetingRequest.count({
      where: { ...visible, closedAt: null, createdAt: { lt: daysAgo(5) } },
    }),
    ctx.db.meetingRequest.count({
      where: { ...visible, status: "SUMMARY_REQUIRED" },
    }),
    ctx.db.meetingRequest.findMany({
      where: {
        ...visible,
        scheduledAt: { gte: since },
        status: { in: [...BOOKED_STATUSES, "COMPLETED", "SUMMARY_REQUIRED"] },
      },
      select: { createdAt: true, scheduledAt: true },
      take: 500,
    }),
    ctx.db.meetingRequest.findMany({
      where: {
        ...visible,
        scheduledAt: { gte: previousSince, lt: since },
      },
      select: { createdAt: true, scheduledAt: true },
      take: 500,
    }),
    ctx.db.activity.groupBy({
      by: ["requestId"],
      where: { type: "CONTACT_ATTEMPT", occurredAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const averageHours = (rows: { createdAt: Date; scheduledAt: Date | null }[]) => {
    const deltas = rows
      .filter((row) => row.scheduledAt !== null)
      .map((row) => (row.scheduledAt!.getTime() - row.createdAt.getTime()) / 3_600_000)
      .filter((hours) => hours >= 0);

    if (deltas.length === 0) return null;
    return Number(
      (deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(1),
    );
  };

  const averageContactAttempts =
    attemptAggregate.length === 0
      ? null
      : Number(
          (
            attemptAggregate.reduce((sum, row) => sum + row._count._all, 0) /
            attemptAggregate.length
          ).toFixed(1),
        );

  return {
    windowDays,
    requestsOpened,
    meetingsScheduled,
    meetingsHeld,
    meetingsCancelled,
    meetingsNotHeld,
    followUpMeetings,
    completedWithSummary,
    stillAwaitingCoordination,
    openLongerThanFiveDays,
    endedWithoutSummary,
    averageHoursToSchedule: averageHours(scheduledSample),
    averageContactAttempts,
    previousAverageHoursToSchedule: averageHours(previousSample),
  };
}

export type ManagerBriefResult = {
  metrics: BriefMetrics;
  brief: ManagerBrief | null;
  unavailableReason: string | null;
};

export async function buildManagerBrief(
  ctx: AiContext,
  windowDays = 7,
): Promise<ManagerBriefResult> {
  const metrics = await measure(ctx, windowDays);

  const result = await runStructured(ctx, {
    feature: "MANAGER_BRIEF",
    permission: "analytics:full",
    system: systemPrompt(ROLE, ctx.session.locale),
    prompt: [
      dataBlock("measured figures", metrics),
      "",
      "Write the brief in four parts: what happened, what needs attention, the trend, and one recommendation.",
      "Use only the figures above. Where a figure is null, do not mention that measure at all.",
      "Report the trend only by comparing averageHoursToSchedule with previousAverageHoursToSchedule. If either is null, set trend to null.",
      "The recommendation must be a single concrete action a manager can take tomorrow morning.",
    ].join("\n\n"),
    schema: ManagerBriefSchema,
    effort: "medium",
    maxTokens: 8000,
    cacheSystem: true,
  });

  if (!result.ok) {
    return { metrics, brief: null, unavailableReason: result.message };
  }

  return { metrics, brief: result.value, unavailableReason: null };
}
