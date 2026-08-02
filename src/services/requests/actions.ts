import "server-only";

import type {
  ActivityChannel,
  ActivityOutcome,
  MeetingType,
  Priority,
  RequestStatus,
  SummaryOutcome,
} from "@/generated/prisma/enums";
import type { TenantDb } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { ForbiddenError, can, type Permission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { assertTransition, InvalidTransitionError } from "@/lib/workflow";
import { slaSettings } from "@/services/settings";

/**
 * Everything a person can do to a meeting request.
 *
 * Each action follows the same five steps, in one transaction:
 *   1. check the actor's permission
 *   2. check the status change is legal for the state machine
 *   3. write the change
 *   4. write the timeline event and the audit rows
 *   5. notify whoever is now waiting on something
 *
 * Nothing in the product updates a request outside this file, which is what
 * makes the timeline and the audit log complete rather than best-effort.
 */

export type ActionContext = {
  db: TenantDb;
  session: SessionUser;
};

export class NotFoundError extends Error {
  constructor(what = "Request") {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export type ActionResult =
  | { ok: true; status: RequestStatus }
  | { ok: false; error: "forbidden" | "not_found" | "invalid_transition" | "invalid_input"; message: string };

function fail(
  error: "forbidden" | "not_found" | "invalid_transition" | "invalid_input",
  message: string,
): ActionResult {
  return { ok: false, error, message };
}

/** Wraps an action so a policy or state-machine violation becomes a result, not a crash. */
async function guard(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ForbiddenError) return fail("forbidden", error.message);
    if (error instanceof InvalidTransitionError) {
      return fail("invalid_transition", error.message);
    }
    if (error instanceof NotFoundError) return fail("not_found", error.message);
    throw error;
  }
}

function require(ctx: ActionContext, permission: Permission): void {
  if (!can(ctx.session.role, permission)) throw new ForbiddenError(permission);
}

// ---------------------------------------------------------------- helpers

type LoadedRequest = {
  id: string;
  requestNumber: number;
  status: RequestStatus;
  subject: string;
  requesterUserId: string;
  assignedCoordinatorId: string | null;
  organizationId: string;
  contact: { fullName: string; company: string | null };
};

async function load(ctx: ActionContext, requestId: string): Promise<LoadedRequest> {
  const request = await ctx.db.meetingRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      requestNumber: true,
      status: true,
      subject: true,
      requesterUserId: true,
      assignedCoordinatorId: true,
      organizationId: true,
      contact: { select: { fullName: true, company: true } },
    },
  });

  if (!request) throw new NotFoundError();
  return request;
}

/**
 * A person may act on a request when they coordinate, or when it is their own.
 * Read visibility is handled separately; this is the write gate.
 */
function assertCanActOn(ctx: ActionContext, request: LoadedRequest): void {
  if (can(ctx.session.role, "request:read:all")) return;
  if (request.requesterUserId === ctx.session.id) return;
  throw new ForbiddenError("request:write:own");
}

type ActivityInput = {
  type: Parameters<TenantDb["activity"]["create"]>[0]["data"]["type"];
  channel?: ActivityChannel | null;
  outcome?: ActivityOutcome | null;
  body?: string | null;
};

/** The one path that changes a request. Everything else calls it. */
async function apply(
  ctx: ActionContext,
  request: LoadedRequest,
  input: {
    to?: RequestStatus;
    data?: Record<string, unknown>;
    activity: ActivityInput;
    audit: { action: string; before?: Record<string, unknown>; after?: Record<string, unknown> };
    notify?: { userIds: string[]; type: Parameters<TenantDb["notification"]["create"]>[0]["data"]["type"]; title: string; body?: string };
  },
): Promise<RequestStatus> {
  const now = new Date();

  if (input.to && input.to !== request.status) {
    const rule = assertTransition(request.status, input.to);
    require(ctx, rule.permission);
  }

  const nextStatus = input.to ?? request.status;

  await ctx.db.meetingRequest.update({
    where: { id: request.id },
    data: {
      ...(input.data ?? {}),
      ...(input.to ? { status: input.to } : {}),
      lastActivityAt: now,
      ...(input.to && ["COMPLETED", "CANCELLED", "DECLINED"].includes(input.to)
        ? { closedAt: now }
        : {}),
    },
  });

  await ctx.db.activity.create({
    data: {
      organizationId: ctx.session.organizationId,
      requestId: request.id,
      actorUserId: ctx.session.id,
      type: input.activity.type,
      channel: input.activity.channel ?? null,
      outcome: input.activity.outcome ?? null,
      body: input.activity.body ?? null,
      occurredAt: now,
    },
  });

  await writeAudit(ctx.db, {
    organizationId: ctx.session.organizationId,
    actor: { userId: ctx.session.id, userName: ctx.session.fullName },
    entity: "MeetingRequest",
    entityId: request.id,
    action: input.audit.action,
    before: { ...(input.audit.before ?? {}), status: request.status },
    after: { ...(input.audit.after ?? {}), status: nextStatus },
  });

  if (input.notify) {
    const recipients = [...new Set(input.notify.userIds)].filter(
      (id) => id && id !== ctx.session.id,
    );

    if (recipients.length > 0) {
      await ctx.db.notification.createMany({
        data: recipients.map((userId) => ({
          organizationId: ctx.session.organizationId,
          userId,
          type: input.notify!.type,
          title: input.notify!.title,
          body: input.notify!.body ?? null,
          entityType: "MeetingRequest",
          entityId: request.id,
        })),
      });
    }
  }

  return nextStatus;
}

/** Colleagues attached to a request, used as notification recipients. */
async function participantIds(ctx: ActionContext, requestId: string): Promise<string[]> {
  const rows = await ctx.db.meetingParticipant.findMany({
    where: { requestId },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

// ---------------------------------------------------------------- creation

export type CreateRequestInput = {
  type: MeetingType;
  priority: Priority;
  subject: string;
  purpose?: string | null;
  description?: string | null;
  desiredOutcome?: string | null;
  hadPriorContact: boolean;
  priorContactBy?: string | null;
  priorContactNotes?: string | null;
  datePreferenceMode: "EXACT" | "OPTIONS" | "RANGE" | "NONE";
  preferredDate?: Date | null;
  preferredTime?: string | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  dateOptions?: { date: Date; time?: string | null }[];
  participantIds: string[];
  parentRequestId?: string | null;
  contact:
    | { mode: "existing"; contactId: string }
    | {
        mode: "new";
        fullName: string;
        company?: string | null;
        jobTitle?: string | null;
        phone?: string | null;
        phoneAlt?: string | null;
        email?: string | null;
        website?: string | null;
        linkedin?: string | null;
        notes?: string | null;
      };
};

export async function createRequest(
  ctx: ActionContext,
  input: CreateRequestInput,
): Promise<{ ok: true; requestNumber: number } | { ok: false; error: string; message: string }> {
  try {
    require(ctx, "request:create");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "forbidden", message: error.message };
    }
    throw error;
  }

  if (!input.subject.trim()) {
    return { ok: false, error: "invalid_input", message: "Subject is required" };
  }

  const contactId =
    input.contact.mode === "existing"
      ? input.contact.contactId
      : (
          await ctx.db.contact.create({
            data: {
              organizationId: ctx.session.organizationId,
              fullName: input.contact.fullName,
              company: input.contact.company ?? null,
              jobTitle: input.contact.jobTitle ?? null,
              phone: input.contact.phone ?? null,
              phoneAlt: input.contact.phoneAlt ?? null,
              email: input.contact.email ?? null,
              website: input.contact.website ?? null,
              linkedin: input.contact.linkedin ?? null,
              notes: input.contact.notes ?? null,
              createdByUserId: ctx.session.id,
            },
          })
        ).id;

  // Request numbers are per organization and human facing, so they continue
  // from the highest one already used rather than restarting.
  const highest = await ctx.db.meetingRequest.aggregate({
    _max: { requestNumber: true },
  });
  const requestNumber = (highest._max.requestNumber ?? 1000) + 1;

  const now = new Date();

  const request = await ctx.db.meetingRequest.create({
    data: {
      organizationId: ctx.session.organizationId,
      requestNumber,
      type: input.type,
      priority: input.priority,
      // A request is born needing coordination; NEW exists only as an instant.
      status: "NEEDS_COORDINATION",
      contactId,
      requesterUserId: ctx.session.id,
      subject: input.subject.trim(),
      purpose: input.purpose ?? null,
      description: input.description ?? null,
      desiredOutcome: input.desiredOutcome ?? null,
      hadPriorContact: input.hadPriorContact,
      priorContactBy: input.priorContactBy ?? null,
      priorContactNotes: input.priorContactNotes ?? null,
      datePreferenceMode: input.datePreferenceMode,
      preferredDate: input.preferredDate ?? null,
      preferredTime: input.preferredTime ?? null,
      rangeStart: input.rangeStart ?? null,
      rangeEnd: input.rangeEnd ?? null,
      parentRequestId: input.parentRequestId ?? null,
      lastActivityAt: now,
    },
  });

  const everyone = [...new Set([ctx.session.id, ...input.participantIds])];

  await ctx.db.meetingParticipant.createMany({
    data: everyone.map((userId) => ({
      requestId: request.id,
      userId,
      isOrganizer: userId === ctx.session.id,
    })),
  });

  if (input.dateOptions?.length) {
    await ctx.db.requestDateOption.createMany({
      data: input.dateOptions.map((option, rank) => ({
        requestId: request.id,
        rank,
        optionDate: option.date,
        optionTime: option.time ?? null,
      })),
    });
  }

  await ctx.db.activity.create({
    data: {
      organizationId: ctx.session.organizationId,
      requestId: request.id,
      actorUserId: ctx.session.id,
      type: "REQUEST_CREATED",
      occurredAt: now,
    },
  });

  await writeAudit(ctx.db, {
    organizationId: ctx.session.organizationId,
    actor: { userId: ctx.session.id, userName: ctx.session.fullName },
    entity: "MeetingRequest",
    entityId: request.id,
    action: "create",
  });

  // The coordination desk needs to know work arrived.
  const coordinators = await ctx.db.user.findMany({
    where: { role: { in: ["COORDINATOR", "ADMIN"] }, isActive: true },
    select: { id: true },
  });

  await ctx.db.notification.createMany({
    data: coordinators
      .filter((coordinator) => coordinator.id !== ctx.session.id)
      .map((coordinator) => ({
        organizationId: ctx.session.organizationId,
        userId: coordinator.id,
        type: "REQUEST_ASSIGNED" as const,
        title: `בקשה חדשה ${requestNumber}`,
        body: `${input.subject.trim()}`,
        entityType: "MeetingRequest",
        entityId: request.id,
      })),
  });

  return { ok: true, requestNumber };
}

// ---------------------------------------------------------------- ownership

export function takeRequest(ctx: ActionContext, requestId: string): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:take");
    const request = await load(ctx, requestId);

    const status = await apply(ctx, request, {
      to: "IN_PROGRESS",
      data: {
        assignedCoordinatorId: ctx.session.id,
        firstTouchAt: new Date(),
      },
      activity: { type: "ASSIGNED" },
      audit: {
        action: "take",
        before: { assignedCoordinatorId: request.assignedCoordinatorId },
        after: { assignedCoordinatorId: ctx.session.id },
      },
      notify: {
        userIds: [request.requesterUserId],
        type: "REQUEST_ASSIGNED",
        title: `${ctx.session.fullName} לקח לטיפול את בקשה ${request.requestNumber}`,
        body: request.subject,
      },
    });

    return { ok: true, status };
  });
}

export function assignRequest(
  ctx: ActionContext,
  requestId: string,
  coordinatorId: string,
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:assign");
    const request = await load(ctx, requestId);

    const coordinator = await ctx.db.user.findUnique({
      where: { id: coordinatorId },
      select: { id: true, fullName: true, role: true },
    });

    if (!coordinator) throw new NotFoundError("Coordinator");

    const status = await apply(ctx, request, {
      to: request.status === "NEEDS_COORDINATION" ? "IN_PROGRESS" : undefined,
      data: { assignedCoordinatorId: coordinator.id, firstTouchAt: new Date() },
      activity: {
        type: request.assignedCoordinatorId ? "REASSIGNED" : "ASSIGNED",
        body: `הוקצה ל${coordinator.fullName}`,
      },
      audit: {
        action: "assign",
        before: { assignedCoordinatorId: request.assignedCoordinatorId },
        after: { assignedCoordinatorId: coordinator.id },
      },
      notify: {
        userIds: [coordinator.id, request.requesterUserId],
        type: "REQUEST_ASSIGNED",
        title: `בקשה ${request.requestNumber} הוקצתה ל${coordinator.fullName}`,
        body: request.subject,
      },
    });

    return { ok: true, status };
  });
}

// ---------------------------------------------------------------- contact

export type ContactAttemptInput = {
  channel: ActivityChannel;
  outcome: ActivityOutcome;
  notes?: string | null;
  occurredAt?: Date;
};

export function logContactAttempt(
  ctx: ActionContext,
  requestId: string,
  input: ContactAttemptInput,
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:logActivity");
    const request = await load(ctx, requestId);

    // A reply moves the request back into active handling; silence parks it.
    const answered = ["ANSWERED", "POSITIVE"].includes(input.outcome);
    const to: RequestStatus | undefined =
      request.status === "IN_PROGRESS" && !answered
        ? "WAITING_FOR_CONTACT"
        : request.status === "WAITING_FOR_CONTACT" && answered
          ? "IN_PROGRESS"
          : undefined;

    const status = await apply(ctx, request, {
      to,
      data: request.assignedCoordinatorId ? {} : { assignedCoordinatorId: ctx.session.id },
      activity: {
        type: input.channel === "EMAIL" ? "EMAIL_SENT" : "CONTACT_ATTEMPT",
        channel: input.channel,
        outcome: input.outcome,
        body: input.notes ?? null,
      },
      audit: { action: "log_contact_attempt" },
    });

    return { ok: true, status };
  });
}

export function recordReply(
  ctx: ActionContext,
  requestId: string,
  input: { channel: ActivityChannel; notes: string; positive: boolean },
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:logActivity");
    const request = await load(ctx, requestId);

    const status = await apply(ctx, request, {
      to: request.status === "WAITING_FOR_CONTACT" ? "IN_PROGRESS" : undefined,
      activity: {
        type: "REPLY_RECEIVED",
        channel: input.channel,
        outcome: input.positive ? "POSITIVE" : "NEGATIVE",
        body: input.notes,
      },
      audit: { action: "record_reply" },
      notify: {
        userIds: [request.requesterUserId],
        type: "REQUEST_ASSIGNED",
        title: `התקבלה תשובה בבקשה ${request.requestNumber}`,
        body: input.notes.slice(0, 140),
      },
    });

    return { ok: true, status };
  });
}

export function addNote(
  ctx: ActionContext,
  requestId: string,
  note: string,
): Promise<ActionResult> {
  return guard(async () => {
    const request = await load(ctx, requestId);
    assertCanActOn(ctx, request);

    if (!note.trim()) return fail("invalid_input", "Note is empty");

    const status = await apply(ctx, request, {
      activity: { type: "NOTE", body: note.trim() },
      audit: { action: "add_note" },
    });

    return { ok: true, status };
  });
}

// ---------------------------------------------------------------- scheduling

export type ScheduleInput = {
  start: Date;
  durationMinutes: number;
  location?: string | null;
  meetingUrl?: string | null;
  dialNumber?: string | null;
  note?: string | null;
};

export function scheduleMeeting(
  ctx: ActionContext,
  requestId: string,
  input: ScheduleInput,
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:schedule");
    const request = await load(ctx, requestId);

    if (Number.isNaN(input.start.getTime())) {
      return fail("invalid_input", "Invalid date");
    }

    const end = new Date(input.start.getTime() + input.durationMinutes * 60000);

    await ctx.db.meeting.create({
      data: {
        organizationId: ctx.session.organizationId,
        requestId: request.id,
        scheduledStart: input.start,
        scheduledEnd: end,
        location: input.location ?? null,
        meetingUrl: input.meetingUrl ?? null,
        dialNumber: input.dialNumber ?? null,
        status: "PLANNED",
        createdByUserId: ctx.session.id,
      },
    });

    const participants = await participantIds(ctx, request.id);

    const status = await apply(ctx, request, {
      to: "SCHEDULED",
      data: {
        scheduledAt: input.start,
        slaState: "GREEN",
        ...(request.assignedCoordinatorId ? {} : { assignedCoordinatorId: ctx.session.id }),
      },
      activity: { type: "SCHEDULED", body: input.note ?? null },
      audit: {
        action: "schedule",
        before: { scheduledAt: null },
        after: { scheduledAt: input.start },
      },
      notify: {
        userIds: [request.requesterUserId, ...participants],
        type: "MEETING_SCHEDULED",
        title: `הפגישה בבקשה ${request.requestNumber} נקבעה`,
        body: `${request.contact.fullName} · ${input.start.toLocaleString("he-IL")}`,
      },
    });

    return { ok: true, status };
  });
}

export function rescheduleMeeting(
  ctx: ActionContext,
  requestId: string,
  input: ScheduleInput & { reason?: string | null },
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:reschedule");
    const request = await load(ctx, requestId);

    const previous = await ctx.db.meeting.findFirst({
      where: { requestId: request.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, scheduledStart: true },
    });

    const end = new Date(input.start.getTime() + input.durationMinutes * 60000);

    if (previous) {
      await ctx.db.meeting.update({
        where: { id: previous.id },
        data: { status: "RESCHEDULED" },
      });
    }

    await ctx.db.meeting.create({
      data: {
        organizationId: ctx.session.organizationId,
        requestId: request.id,
        scheduledStart: input.start,
        scheduledEnd: end,
        location: input.location ?? null,
        meetingUrl: input.meetingUrl ?? null,
        dialNumber: input.dialNumber ?? null,
        status: "PLANNED",
        rescheduledFromMeetingId: previous?.id ?? null,
        createdByUserId: ctx.session.id,
      },
    });

    const participants = await participantIds(ctx, request.id);

    const status = await apply(ctx, request, {
      to: "RESCHEDULED",
      data: { scheduledAt: input.start },
      activity: { type: "RESCHEDULED", body: input.reason ?? null },
      audit: {
        action: "reschedule",
        before: { scheduledAt: previous?.scheduledStart ?? null },
        after: { scheduledAt: input.start },
      },
      notify: {
        userIds: [request.requesterUserId, ...participants],
        type: "MEETING_RESCHEDULED",
        title: `מועד הפגישה בבקשה ${request.requestNumber} שונה`,
        body: input.start.toLocaleString("he-IL"),
      },
    });

    return { ok: true, status };
  });
}

/** The requester, or a participant, asking for a different date. */
export function requestReschedule(
  ctx: ActionContext,
  requestId: string,
  reason: string,
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:requestReschedule");
    const request = await load(ctx, requestId);
    assertCanActOn(ctx, request);

    const status = await apply(ctx, request, {
      to: "RESCHEDULE_REQUESTED",
      activity: { type: "NOTE", body: reason },
      audit: { action: "request_reschedule" },
      notify: {
        userIds: [request.assignedCoordinatorId ?? ""],
        type: "MEETING_RESCHEDULED",
        title: `נדרש שינוי מועד בבקשה ${request.requestNumber}`,
        body: reason.slice(0, 140),
      },
    });

    return { ok: true, status };
  });
}

// ---------------------------------------------------------------- info flow

export function requestInfo(
  ctx: ActionContext,
  requestId: string,
  question: string,
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:requestInfo");
    const request = await load(ctx, requestId);

    if (!question.trim()) return fail("invalid_input", "Question is empty");

    const status = await apply(ctx, request, {
      to: "WAITING_FOR_EMPLOYEE",
      activity: { type: "INFO_REQUESTED", body: question.trim() },
      audit: { action: "request_info" },
      notify: {
        userIds: [request.requesterUserId],
        type: "INFO_REQUESTED",
        title: `נדרש ממך מידע בבקשה ${request.requestNumber}`,
        body: question.trim().slice(0, 140),
      },
    });

    return { ok: true, status };
  });
}

export function provideInfo(
  ctx: ActionContext,
  requestId: string,
  answer: string,
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:addInfo");
    const request = await load(ctx, requestId);
    assertCanActOn(ctx, request);

    if (!answer.trim()) return fail("invalid_input", "Answer is empty");

    const status = await apply(ctx, request, {
      to: "IN_PROGRESS",
      activity: { type: "INFO_PROVIDED", body: answer.trim() },
      audit: { action: "provide_info" },
      notify: {
        userIds: [request.assignedCoordinatorId ?? ""],
        type: "REQUEST_ASSIGNED",
        title: `התקבל מידע בבקשה ${request.requestNumber}`,
        body: answer.trim().slice(0, 140),
      },
    });

    return { ok: true, status };
  });
}

// ---------------------------------------------------------------- closing

export function markDeclined(
  ctx: ActionContext,
  requestId: string,
  reason: string,
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "request:decline");
    const request = await load(ctx, requestId);

    const status = await apply(ctx, request, {
      to: "DECLINED",
      activity: {
        type: "DECLINED",
        outcome: "NEGATIVE",
        body: reason || null,
      },
      audit: { action: "decline" },
      notify: {
        userIds: [request.requesterUserId],
        type: "REQUEST_DECLINED",
        title: `הצד השני סירב לפגישה בבקשה ${request.requestNumber}`,
        body: reason.slice(0, 140),
      },
    });

    return { ok: true, status };
  });
}

export function cancelRequest(
  ctx: ActionContext,
  requestId: string,
  reason: string,
): Promise<ActionResult> {
  return guard(async () => {
    const request = await load(ctx, requestId);

    // The requester may always cancel their own; a coordinator may cancel any.
    if (request.requesterUserId !== ctx.session.id) {
      require(ctx, "request:cancel:any");
    } else {
      require(ctx, "request:cancel:own");
    }

    const status = await apply(ctx, request, {
      to: "CANCELLED",
      activity: { type: "CANCELLED", body: reason || null },
      audit: { action: "cancel" },
      notify: {
        userIds: [request.assignedCoordinatorId ?? "", request.requesterUserId],
        type: "MEETING_CANCELLED",
        title: `בקשה ${request.requestNumber} בוטלה`,
        body: reason.slice(0, 140),
      },
    });

    return { ok: true, status };
  });
}

/**
 * Moves a booked meeting whose end time has passed into "waiting for summary".
 * Called by the SLA sweep, and opportunistically when a request is opened.
 */
export async function closePastMeetings(
  db: TenantDb,
  organizationId: string,
): Promise<number> {
  const now = new Date();

  const due = await db.meetingRequest.findMany({
    where: {
      status: { in: ["SCHEDULED", "RESCHEDULED"] },
      scheduledAt: { lt: now },
      meetings: { some: { scheduledEnd: { lt: now }, status: "PLANNED" } },
    },
    select: { id: true, requestNumber: true, subject: true, requesterUserId: true },
  });

  for (const request of due) {
    await db.meetingRequest.update({
      where: { id: request.id },
      data: { status: "SUMMARY_REQUIRED", lastActivityAt: now },
    });

    await db.activity.create({
      data: {
        organizationId,
        requestId: request.id,
        actorUserId: null,
        type: "COMPLETED",
        occurredAt: now,
      },
    });

    await db.notification.create({
      data: {
        organizationId,
        userId: request.requesterUserId,
        type: "SUMMARY_REQUIRED",
        title: `הפגישה בבקשה ${request.requestNumber} הסתיימה`,
        body: "נא למלא סיכום",
        entityType: "MeetingRequest",
        entityId: request.id,
      },
    });
  }

  return due.length;
}

// ---------------------------------------------------------------- summary

export type SummaryInput = {
  tookPlace: boolean;
  rawText?: string | null;
  summary: string;
  outcome: SummaryOutcome;
  aiStructured?: boolean;
  needsFollowupMeeting: boolean;
  tasks: { description: string; assigneeUserId?: string | null; dueDate?: Date | null }[];
};

export function submitSummary(
  ctx: ActionContext,
  requestId: string,
  input: SummaryInput,
): Promise<ActionResult> {
  return guard(async () => {
    require(ctx, "summary:submit");
    const request = await load(ctx, requestId);
    assertCanActOn(ctx, request);

    if (!input.summary.trim()) return fail("invalid_input", "Summary is empty");

    const meeting = await ctx.db.meeting.findFirst({
      where: { requestId: request.id },
      orderBy: { scheduledStart: "desc" },
      select: { id: true },
    });

    if (meeting) {
      await ctx.db.meeting.update({
        where: { id: meeting.id },
        data: { status: input.tookPlace ? "HELD" : "NOT_HELD" },
      });
    }

    const summary = await ctx.db.meetingSummary.create({
      data: {
        organizationId: ctx.session.organizationId,
        requestId: request.id,
        meetingId: meeting?.id ?? null,
        submittedByUserId: ctx.session.id,
        tookPlace: input.tookPlace,
        rawText: input.rawText ?? null,
        summary: input.summary.trim(),
        outcome: input.outcome,
        aiStructured: input.aiStructured ?? false,
        needsFollowupMeeting: input.needsFollowupMeeting,
      },
    });

    const tasks = input.tasks.filter((task) => task.description.trim());

    if (tasks.length > 0) {
      await ctx.db.followUpTask.createMany({
        data: tasks.map((task) => ({
          organizationId: ctx.session.organizationId,
          requestId: request.id,
          summaryId: summary.id,
          description: task.description.trim(),
          assigneeUserId: task.assigneeUserId ?? null,
          dueDate: task.dueDate ?? null,
        })),
      });

      const assignees = tasks
        .map((task) => task.assigneeUserId)
        .filter((id): id is string => Boolean(id));

      if (assignees.length > 0) {
        await ctx.db.notification.createMany({
          data: [...new Set(assignees)]
            .filter((id) => id !== ctx.session.id)
            .map((userId) => ({
              organizationId: ctx.session.organizationId,
              userId,
              type: "TASK_ASSIGNED" as const,
              title: `הוקצתה לך משימת המשך`,
              body: request.subject,
              entityType: "MeetingRequest",
              entityId: request.id,
            })),
        });
      }
    }

    const status = await apply(ctx, request, {
      to: "COMPLETED",
      activity: { type: "SUMMARY_SUBMITTED" },
      audit: { action: "submit_summary" },
      notify: input.needsFollowupMeeting
        ? {
            userIds: [request.assignedCoordinatorId ?? ""],
            type: "FOLLOW_UP_REQUIRED",
            title: `נדרשת פגישת המשך לבקשה ${request.requestNumber}`,
            body: request.subject,
          }
        : undefined,
    });

    return { ok: true, status };
  });
}

// ---------------------------------------------------------------- sla sweep

/** Recomputes the handling-time state for every open request. */
export async function refreshSla(
  db: TenantDb,
  organizationId: string,
): Promise<{ green: number; amber: number; red: number }> {
  const sla = await slaSettings(db);
  const now = Date.now();

  const open = await db.meetingRequest.findMany({
    where: { closedAt: null },
    select: {
      id: true,
      status: true,
      slaState: true,
      createdAt: true,
      lastActivityAt: true,
    },
  });

  const tally = { green: 0, amber: 0, red: 0 };

  for (const request of open) {
    const ageHours = (now - request.createdAt.getTime()) / 3_600_000;
    const idleDays = (now - request.lastActivityAt.getTime()) / 86_400_000;

    let next: "GREEN" | "AMBER" | "RED" = "GREEN";

    if (["NEW", "NEEDS_COORDINATION"].includes(request.status)) {
      if (ageHours > sla.newRequestHours * 2) next = "RED";
      else if (ageHours > sla.newRequestHours) next = "AMBER";
    } else if (request.status === "WAITING_FOR_CONTACT") {
      if (idleDays > sla.waitingContactDays * 2) next = "RED";
      else if (idleDays > sla.waitingContactDays) next = "AMBER";
    } else if (request.status === "SUMMARY_REQUIRED") {
      const overdueHours = idleDays * 24;
      if (overdueHours > sla.summaryDueHours * 2) next = "RED";
      else if (overdueHours > sla.summaryDueHours) next = "AMBER";
    } else if (idleDays > sla.noActivityDays * 2) {
      next = "RED";
    } else if (idleDays > sla.noActivityDays) {
      next = "AMBER";
    }

    tally[next.toLowerCase() as "green" | "amber" | "red"] += 1;

    if (next !== request.slaState) {
      await db.meetingRequest.update({
        where: { id: request.id },
        data: { slaState: next },
      });
    }
  }

  void organizationId;
  return tally;
}
