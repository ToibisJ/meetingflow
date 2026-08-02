"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/current-user";
import type {
  ActivityChannel,
  ActivityOutcome,
  SummaryOutcome,
} from "@/generated/prisma/enums";
import type { FormState } from "./form-state";
import {
  addNote,
  assignRequest,
  cancelRequest,
  correctRequest,
  logContactAttempt,
  markDeclined,
  provideInfo,
  recordReply,
  requestInfo,
  requestReschedule,
  rescheduleMeeting,
  scheduleMeeting,
  submitSummary,
  takeRequest,
  type ActionResult,
} from "@/services/requests/actions";

/**
 * Server actions behind the request workspace.
 *
 * Each one resolves the signed-in user, hands the tenant-scoped client to the
 * domain layer, and returns a plain message the form can display. The domain
 * layer owns the rules; these are just the wiring.
 */

const MESSAGES: Record<string, string> = {
  forbidden: "אין לך הרשאה לפעולה הזו.",
  not_found: "הבקשה לא נמצאה.",
  invalid_transition: "לא ניתן לבצע את הפעולה הזו מהמצב הנוכחי של הבקשה.",
  invalid_input: "יש שדות חסרים או לא תקינים.",
  read_only: "אתה צופה במערכת דרך משתמש אחר, ולכן אי אפשר לשנות כלום. חזור לעצמך כדי לבצע פעולות.",
};

function toState(result: ActionResult, requestId: string): FormState {
  if (result.ok) {
    revalidatePath(`/requests`);
    revalidatePath(`/dashboard`);
    void requestId;
    return { ok: true, message: null };
  }
  return { ok: false, message: MESSAGES[result.error] ?? result.message };
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Combines a date input and a time input into one instant. */
function toDate(dateValue: string, timeValue: string): Date {
  return new Date(`${dateValue}T${timeValue || "09:00"}:00`);
}

export async function takeAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  return toState(await takeRequest(ctx, id), id);
}

export async function assignAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  const coordinatorId = text(form, "coordinatorId");

  if (!coordinatorId) return { ok: false, message: MESSAGES.invalid_input };

  return toState(await assignRequest(ctx, id, coordinatorId), id);
}

export async function logAttemptAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");

  return toState(
    await logContactAttempt(ctx, id, {
      channel: text(form, "channel") as ActivityChannel,
      outcome: text(form, "outcome") as ActivityOutcome,
      notes: text(form, "notes") || null,
    }),
    id,
  );
}

export async function replyAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  const notes = text(form, "notes");

  if (!notes) return { ok: false, message: MESSAGES.invalid_input };

  return toState(
    await recordReply(ctx, id, {
      channel: text(form, "channel") as ActivityChannel,
      notes,
      positive: text(form, "tone") !== "negative",
    }),
    id,
  );
}

export async function noteAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  return toState(await addNote(ctx, id, text(form, "note")), id);
}

export async function scheduleAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  const date = text(form, "date");

  if (!date) return { ok: false, message: MESSAGES.invalid_input };

  return toState(
    await scheduleMeeting(ctx, id, {
      start: toDate(date, text(form, "time")),
      durationMinutes: Number(text(form, "duration")) || 60,
      location: text(form, "location") || null,
      meetingUrl: text(form, "meetingUrl") || null,
      note: text(form, "note") || null,
    }),
    id,
  );
}

export async function rescheduleAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  const date = text(form, "date");

  if (!date) return { ok: false, message: MESSAGES.invalid_input };

  return toState(
    await rescheduleMeeting(ctx, id, {
      start: toDate(date, text(form, "time")),
      durationMinutes: Number(text(form, "duration")) || 60,
      location: text(form, "location") || null,
      meetingUrl: text(form, "meetingUrl") || null,
      reason: text(form, "reason") || null,
    }),
    id,
  );
}

export async function requestInfoAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  return toState(await requestInfo(ctx, id, text(form, "question")), id);
}

export async function provideInfoAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  return toState(await provideInfo(ctx, id, text(form, "answer")), id);
}

export async function requestRescheduleAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  return toState(await requestReschedule(ctx, id, text(form, "reason")), id);
}

export async function declineAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  return toState(await markDeclined(ctx, id, text(form, "reason")), id);
}

export async function cancelAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");
  return toState(await cancelRequest(ctx, id, text(form, "reason")), id);
}

export async function summaryAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");

  // Follow-up tasks arrive as parallel arrays from the repeatable rows.
  const descriptions = form.getAll("taskDescription").map(String);
  const assignees = form.getAll("taskAssignee").map(String);
  const dueDates = form.getAll("taskDue").map(String);

  const tasks = descriptions
    .map((description, index) => ({
      description: description.trim(),
      assigneeUserId: assignees[index] || null,
      dueDate: dueDates[index] ? new Date(dueDates[index]) : null,
    }))
    .filter((task) => task.description.length > 0);

  return toState(
    await submitSummary(ctx, id, {
      tookPlace: text(form, "tookPlace") === "yes",
      summary: text(form, "summary"),
      outcome: text(form, "outcome") as SummaryOutcome,
      needsFollowupMeeting: text(form, "needsFollowup") === "yes",
      tasks,
    }),
    id,
  );
}

/**
 * Putting a wrongly recorded detail right.
 *
 * Only the fields the person actually filled in are sent on; an empty box means
 * "leave this alone", not "clear it". The domain layer works out what really
 * changed and writes the correction to the timeline.
 */
export async function correctAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const ctx = await requireUser();
  const id = text(form, "requestId");

  const optional = (key: string) => {
    const value = text(form, key);
    return value.length > 0 ? value : undefined;
  };

  const date = text(form, "correctDate");
  const time = text(form, "correctTime");

  return toState(
    await correctRequest(ctx, id, {
      reason: text(form, "reason"),
      subject: optional("subject"),
      purpose: optional("purpose"),
      description: optional("description"),
      desiredOutcome: optional("desiredOutcome"),
      scheduledAt: date ? toDate(date, time) : undefined,
      location: optional("location"),
      meetingUrl: optional("meetingUrl"),
    }),
    id,
  );
}
