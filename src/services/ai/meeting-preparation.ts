import "server-only";

import { MeetingPrepSchema, type MeetingPrep } from "./schemas";
import { dataBlock, formatDate, systemPrompt } from "./prompts";
import { runStructured, type AiCallResult, type AiContext } from "./gateway";

/**
 * "Prepare me for this meeting".
 *
 * The brief has two halves and the UI renders them differently: the facts come
 * straight from the request and are shown as record data; the objectives,
 * talking points and risks are model suggestions and are labelled as such.
 */

const ROLE =
  "You prepare a person for a meeting they are about to attend. You suggest goals and questions; you never state a fact that is not in the data.";

export type MeetingBriefFacts = {
  requestNumber: number;
  contactName: string;
  company: string | null;
  jobTitle: string | null;
  subject: string;
  purpose: string | null;
  requestedBy: string;
  openedDaysAgo: number;
  contactAttempts: number;
  scheduledFor: string | null;
  history: { at: string | null; type: string; outcome: string | null; note: string | null }[];
  previousSummaries: { at: string | null; outcome: string; summary: string }[];
};

export type MeetingBriefResult = {
  facts: MeetingBriefFacts;
  suggestions: MeetingPrep | null;
  unavailableReason: string | null;
  suggestionId: string | null;
};

export async function prepareForMeeting(
  ctx: AiContext,
  requestId: string,
): Promise<MeetingBriefResult | null> {
  const request = await ctx.db.meetingRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      requestNumber: true,
      subject: true,
      purpose: true,
      desiredOutcome: true,
      description: true,
      createdAt: true,
      scheduledAt: true,
      contact: {
        select: { id: true, fullName: true, company: true, jobTitle: true, notes: true },
      },
      requester: { select: { fullName: true } },
      participants: { select: { user: { select: { fullName: true } } } },
      activities: {
        select: {
          type: true,
          channel: true,
          outcome: true,
          body: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: "asc" },
        take: 30,
      },
    },
  });

  if (!request) return null;

  // Everything this organization already knows about the same contact.
  const priorSummaries = await ctx.db.meetingSummary.findMany({
    where: { request: { contactId: request.contact.id } },
    select: { submittedAt: true, outcome: true, summary: true },
    orderBy: { submittedAt: "desc" },
    take: 3,
  });

  const attempts = request.activities.filter(
    (activity) => activity.type === "CONTACT_ATTEMPT",
  ).length;

  const facts: MeetingBriefFacts = {
    requestNumber: request.requestNumber,
    contactName: request.contact.fullName,
    company: request.contact.company,
    jobTitle: request.contact.jobTitle,
    subject: request.subject,
    purpose: request.purpose,
    requestedBy: request.requester.fullName,
    openedDaysAgo: Math.floor(
      (Date.now() - request.createdAt.getTime()) / 86_400_000,
    ),
    contactAttempts: attempts,
    scheduledFor: formatDate(request.scheduledAt),
    history: request.activities.map((activity) => ({
      at: formatDate(activity.occurredAt),
      type: activity.type,
      outcome: activity.outcome,
      note: activity.body,
    })),
    previousSummaries: priorSummaries.map((summary) => ({
      at: formatDate(summary.submittedAt),
      outcome: summary.outcome,
      summary: summary.summary,
    })),
  };

  const prompt = [
    dataBlock("meeting facts", facts),
    dataBlock("free-text description written by the requester", request.description),
    dataBlock("what the requester wants to achieve", request.desiredOutcome),
    dataBlock("notes stored about this contact", request.contact.notes),
    dataBlock(
      "colleagues attending",
      request.participants.map((participant) => participant.user.fullName),
    ),
    "",
    "Suggest what to aim for, what to raise, and what to ask. Base every suggestion on the data above.",
    "In missingInformation, list what the system does not know that would materially change how to run this meeting.",
    "Do not restate the facts back — the interface already shows them.",
  ].join("\n\n");

  const result: AiCallResult<MeetingPrep> = await runStructured(ctx, {
    feature: "MEETING_PREPARATION",
    permission: "request:read:own",
    system: systemPrompt(ROLE, ctx.session.locale),
    prompt,
    schema: MeetingPrepSchema,
    effort: "medium",
    maxTokens: 10000,
    cacheSystem: true,
    record: { entityType: "MeetingRequest", entityId: request.id },
  });

  if (!result.ok) {
    return {
      facts,
      suggestions: null,
      unavailableReason: result.message,
      suggestionId: null,
    };
  }

  return {
    facts,
    suggestions: result.value,
    unavailableReason: null,
    suggestionId: result.suggestionId,
  };
}
