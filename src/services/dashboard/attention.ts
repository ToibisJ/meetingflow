import "server-only";

import type { TenantDb } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { requestVisibility } from "@/services/requests/visibility";
import { slaSettings } from "@/services/settings";
import { BOOKED_STATUSES, OPEN_STATUSES } from "@/lib/workflow";

/**
 * The "needs your attention" buckets and the KPI counters.
 *
 * These numbers are computed from the database, never by a model. The AI
 * command centre is handed these exact figures and may only rephrase them.
 */

export type AttentionBucket = {
  /** Message key resolved against the `dashboard` namespace. */
  key:
    | "attentionUntouched"
    | "attentionNoReply"
    | "attentionToday"
    | "attentionMissingSummary"
    | "attentionStale";
  count: number;
  params: Record<string, number>;
  severity: "critical" | "warning" | "info" | "success";
  /** Query string that opens the matching filtered list. */
  href: string;
};

export type DashboardCounters = {
  needsCoordination: number;
  inProgress: number;
  waiting: number;
  scheduled: number;
  today: number;
  completed: number;
};

export type DashboardSnapshot = {
  counters: DashboardCounters;
  attention: AttentionBucket[];
};

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function dashboardSnapshot(
  db: TenantDb,
  session: SessionUser,
): Promise<DashboardSnapshot> {
  const visible = await requestVisibility(db, session);
  const sla = await slaSettings(db);

  const [
    needsCoordination,
    inProgress,
    waiting,
    scheduled,
    today,
    completed,
    untouched,
    noReply,
    missingSummary,
    stale,
  ] = await Promise.all([
    db.meetingRequest.count({
      where: { ...visible, status: { in: ["NEW", "NEEDS_COORDINATION"] } },
    }),
    db.meetingRequest.count({ where: { ...visible, status: "IN_PROGRESS" } }),
    db.meetingRequest.count({
      where: {
        ...visible,
        status: { in: ["WAITING_FOR_CONTACT", "WAITING_FOR_EMPLOYEE"] },
      },
    }),
    db.meetingRequest.count({
      where: { ...visible, status: { in: BOOKED_STATUSES } },
    }),
    db.meetingRequest.count({
      where: {
        ...visible,
        status: { in: BOOKED_STATUSES },
        scheduledAt: { gte: startOfToday(), lte: endOfToday() },
      },
    }),
    db.meetingRequest.count({ where: { ...visible, status: "COMPLETED" } }),

    // Nobody has picked it up within the agreed window.
    db.meetingRequest.count({
      where: {
        ...visible,
        status: { in: ["NEW", "NEEDS_COORDINATION"] },
        createdAt: { lt: hoursAgo(sla.newRequestHours) },
      },
    }),

    // The other side has been silent for too long.
    db.meetingRequest.count({
      where: {
        ...visible,
        status: "WAITING_FOR_CONTACT",
        lastActivityAt: { lt: daysAgo(sla.waitingContactDays) },
      },
    }),

    // The meeting is over and nobody wrote it up.
    db.meetingRequest.count({
      where: { ...visible, status: "SUMMARY_REQUIRED" },
    }),

    // In someone's hands, but nothing has happened.
    db.meetingRequest.count({
      where: {
        ...visible,
        status: { in: OPEN_STATUSES.filter((status) => status !== "NEW") },
        lastActivityAt: { lt: daysAgo(sla.noActivityDays) },
      },
    }),
  ]);

  const attention: AttentionBucket[] = [];

  if (untouched > 0) {
    attention.push({
      key: "attentionUntouched",
      count: untouched,
      params: { count: untouched, hours: sla.newRequestHours },
      severity: "critical",
      href: `/requests?view=untouched`,
    });
  }

  if (noReply > 0) {
    attention.push({
      key: "attentionNoReply",
      count: noReply,
      params: { count: noReply, days: sla.waitingContactDays },
      severity: "warning",
      href: `/requests?status=WAITING_FOR_CONTACT&overdue=1`,
    });
  }

  if (today > 0) {
    attention.push({
      key: "attentionToday",
      count: today,
      params: { count: today },
      severity: "info",
      href: `/requests?view=today`,
    });
  }

  if (missingSummary > 0) {
    attention.push({
      key: "attentionMissingSummary",
      count: missingSummary,
      params: { count: missingSummary },
      severity: "warning",
      href: `/requests?status=SUMMARY_REQUIRED`,
    });
  }

  if (stale > 0) {
    attention.push({
      key: "attentionStale",
      count: stale,
      params: { count: stale, days: sla.noActivityDays },
      severity: "warning",
      href: `/requests?view=stale`,
    });
  }

  return {
    counters: {
      needsCoordination,
      inProgress,
      waiting,
      scheduled,
      today,
      completed,
    },
    attention,
  };
}
