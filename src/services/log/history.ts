import "server-only";

import type { SessionUser } from "@/lib/session";
import type { TenantDb } from "@/lib/tenant";
import { visibilityScope } from "@/lib/rbac";
import { requestVisibility } from "@/services/requests/visibility";

/**
 * The meeting log — what already happened.
 *
 * The question it exists to answer is "have I sat with this person before, and
 * what came out of it". So the same rows are offered two ways: by person, which
 * is how you ask that question, and by date, which is how you review a period.
 *
 * Scope follows the same rule as everywhere else: a coordinator and a manager
 * see the organization's history from the first meeting ever recorded, and an
 * employee sees the meetings that are his own. Nothing here widens a view that
 * the request visibility filter does not already grant.
 */

/** A meeting counts as history once its time has passed and it was not called off. */
const NEVER_HAPPENED = ["CANCELLED", "DECLINED"] as const;

export type LoggedMeeting = {
  id: string;
  requestNumber: number;
  subject: string;
  purpose: string | null;
  type: string;
  status: string;
  scheduledAt: Date;
  contact: {
    id: string;
    fullName: string;
    company: string | null;
    jobTitle: string | null;
    email: string | null;
    phone: string | null;
  };
  requesterName: string;
  coordinatorName: string | null;
  participants: string[];
  summary: { text: string; outcome: string; tookPlace: boolean } | null;
  /** Details put right after the fact, newest first. */
  corrections: { at: Date; by: string | null; body: string | null }[];
};

export type ContactHistory = {
  contactId: string;
  contactName: string;
  company: string | null;
  meetings: LoggedMeeting[];
  lastMeetingAt: Date;
  firstMeetingAt: Date;
};

export type HistoryScope = "ALL" | "REPORTS" | "OWN";

function textFilter(term: string) {
  const contains = { contains: term, mode: "insensitive" as const };
  return {
    OR: [
      { subject: contains },
      { purpose: contains },
      { description: contains },
      { contact: { fullName: contains } },
      { contact: { company: contains } },
      { contact: { email: contains } },
      { contact: { phone: { contains: term } } },
      { requester: { fullName: contains } },
      { coordinator: { fullName: contains } },
      { summaries: { some: { summary: contains } } },
    ],
  };
}

export async function meetingHistory(
  db: TenantDb,
  session: SessionUser,
  options: { q?: string; limit?: number } = {},
): Promise<{ meetings: LoggedMeeting[]; scope: HistoryScope }> {
  const visibility = await requestVisibility(db, session);
  const term = options.q?.trim();

  const rows = await db.meetingRequest.findMany({
    where: {
      AND: [
        visibility,
        { scheduledAt: { not: null, lt: new Date() } },
        { status: { notIn: [...NEVER_HAPPENED] } },
        ...(term ? [textFilter(term)] : []),
      ],
    },
    orderBy: { scheduledAt: "desc" },
    take: options.limit ?? 400,
    select: {
      id: true,
      requestNumber: true,
      subject: true,
      purpose: true,
      type: true,
      status: true,
      scheduledAt: true,
      contact: {
        select: {
          id: true,
          fullName: true,
          company: true,
          jobTitle: true,
          email: true,
          phone: true,
        },
      },
      requester: { select: { fullName: true } },
      coordinator: { select: { fullName: true } },
      participants: { select: { user: { select: { fullName: true } } } },
      summaries: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { summary: true, outcome: true, tookPlace: true },
      },
      // The log is where a correction becomes visible: the meeting keeps its
      // place in history and carries the note about what was put right.
      activities: {
        where: { type: "CORRECTED" },
        orderBy: { occurredAt: "desc" },
        select: {
          occurredAt: true,
          body: true,
          actor: { select: { fullName: true } },
        },
      },
    },
  });

  const meetings: LoggedMeeting[] = rows.map((row) => ({
    id: row.id,
    requestNumber: row.requestNumber,
    subject: row.subject,
    purpose: row.purpose,
    type: row.type,
    status: row.status,
    // Narrowed by the query above; the filter guarantees it is set.
    scheduledAt: row.scheduledAt as Date,
    contact: row.contact,
    requesterName: row.requester.fullName,
    coordinatorName: row.coordinator?.fullName ?? null,
    participants: row.participants.map((p) => p.user.fullName),
    summary: row.summaries[0]
      ? {
          text: row.summaries[0].summary,
          outcome: row.summaries[0].outcome,
          tookPlace: row.summaries[0].tookPlace,
        }
      : null,
    corrections: row.activities.map((activity) => ({
      at: activity.occurredAt,
      by: activity.actor?.fullName ?? null,
      body: activity.body,
    })),
  }));

  return { meetings, scope: visibilityScope(session.role) };
}

/** The same meetings, folded into one entry per person you met. */
export function groupByContact(meetings: LoggedMeeting[]): ContactHistory[] {
  const map = new Map<string, ContactHistory>();

  for (const meeting of meetings) {
    const existing = map.get(meeting.contact.id);

    if (existing) {
      existing.meetings.push(meeting);
      if (meeting.scheduledAt < existing.firstMeetingAt) {
        existing.firstMeetingAt = meeting.scheduledAt;
      }
      continue;
    }

    map.set(meeting.contact.id, {
      contactId: meeting.contact.id,
      contactName: meeting.contact.fullName,
      company: meeting.contact.company,
      meetings: [meeting],
      // The source list is newest first, so the first one seen is the latest.
      lastMeetingAt: meeting.scheduledAt,
      firstMeetingAt: meeting.scheduledAt,
    });
  }

  return [...map.values()].sort(
    (a, b) => b.lastMeetingAt.getTime() - a.lastMeetingAt.getTime(),
  );
}
