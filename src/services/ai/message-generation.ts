import "server-only";

import { DraftMessageSchema, type DraftMessage, type MessageKind } from "./schemas";
import { dataBlock, formatDate, systemPrompt } from "./prompts";
import { runStructured, type AiCallResult, type AiContext } from "./gateway";

/**
 * Drafts outbound messages to the external contact.
 *
 * The draft is never sent. It is returned to the coordinator, who edits it and
 * sends it themselves — the system has no outbound mail path, by design.
 */

const ROLE =
  "You draft short, professional outreach messages on behalf of an employee trying to arrange a meeting.";

const KIND_INSTRUCTIONS: Record<MessageKind, string> = {
  FIRST_OUTREACH:
    "First contact. Introduce who is writing and why, and ask for a short call or meeting. Do not assume any prior relationship unless the history says there was one.",
  FOLLOW_UP:
    "A follow-up after no reply. Reference the earlier attempt without sounding impatient, and make replying easy.",
  REMINDER:
    "A reminder about a meeting that is already booked. State the agreed date and time exactly as given.",
  TIME_REQUEST:
    "Ask for a suitable time. Offer the preferred slots from the data if any are present.",
  CONFIRMATION:
    "Confirm a meeting that has just been booked. Repeat the date, time and place exactly as given.",
  RESCHEDULE:
    "Explain that the meeting needs to move and ask for an alternative. Apologise once, briefly.",
  CANCELLATION:
    "Cancel the meeting politely and leave the door open for the future.",
  THANK_YOU:
    "Thank the contact after the meeting and state the agreed next step if the data contains one.",
};

export type DraftMessageInput = {
  requestId: string;
  kind: MessageKind;
  channel: "EMAIL" | "WHATSAPP" | "PHONE_SCRIPT";
  /** Anything the coordinator wants included, in their own words. */
  extraInstruction?: string;
};

export async function draftMessage(
  ctx: AiContext,
  input: DraftMessageInput,
): Promise<AiCallResult<DraftMessage>> {
  const request = await ctx.db.meetingRequest.findUnique({
    where: { id: input.requestId },
    select: {
      requestNumber: true,
      subject: true,
      purpose: true,
      desiredOutcome: true,
      type: true,
      priority: true,
      status: true,
      preferredDate: true,
      preferredTime: true,
      hadPriorContact: true,
      priorContactNotes: true,
      contact: {
        select: {
          fullName: true,
          company: true,
          jobTitle: true,
          email: true,
          phone: true,
        },
      },
      requester: {
        select: { fullName: true, phone: true, email: true },
      },
      dateOptions: {
        select: { optionDate: true, optionTime: true },
        orderBy: { rank: "asc" },
      },
      meetings: {
        select: { scheduledStart: true, location: true, meetingUrl: true },
        orderBy: { scheduledStart: "desc" },
        take: 1,
      },
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

  const meeting = request.meetings[0] ?? null;

  const prompt = [
    dataBlock("contact", request.contact),
    dataBlock("employee sending the message", request.requester),
    dataBlock("request", {
      number: request.requestNumber,
      subject: request.subject,
      purpose: request.purpose,
      desiredOutcome: request.desiredOutcome,
      type: request.type,
      status: request.status,
      preferredDate: formatDate(request.preferredDate),
      preferredTime: request.preferredTime,
      dateOptions: request.dateOptions.map((option) => ({
        date: formatDate(option.optionDate),
        time: option.optionTime,
      })),
      hadPriorContact: request.hadPriorContact,
      priorContactNotes: request.priorContactNotes,
    }),
    dataBlock(
      "booked meeting",
      meeting
        ? {
            start: formatDate(meeting.scheduledStart),
            location: meeting.location,
            url: meeting.meetingUrl,
          }
        : null,
    ),
    dataBlock(
      "contact history",
      request.activities.map((activity) => ({
        at: formatDate(activity.occurredAt),
        type: activity.type,
        channel: activity.channel,
        outcome: activity.outcome,
        note: activity.body,
      })),
    ),
    "",
    `MESSAGE TYPE: ${input.kind}. ${KIND_INSTRUCTIONS[input.kind]}`,
    `CHANNEL: ${input.channel}. For WHATSAPP keep it under four short lines and set subject to null. For PHONE_SCRIPT write what to say out loud and set subject to null.`,
    input.extraInstruction
      ? `The coordinator also asked: ${input.extraInstruction}`
      : "",
    "",
    "Do not state a date, time or place that is absent from the data. If a needed detail is missing, leave it out of the message and name it in notes.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return runStructured(ctx, {
    feature: "MESSAGE_GENERATION",
    permission: "request:logActivity",
    system: systemPrompt(ROLE, ctx.session.locale),
    prompt,
    schema: DraftMessageSchema,
    effort: "low",
    maxTokens: 8000,
    cacheSystem: true,
    record: { entityType: "MeetingRequest", entityId: input.requestId },
  });
}
