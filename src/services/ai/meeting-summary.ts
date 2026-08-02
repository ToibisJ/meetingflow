import "server-only";

import {
  FollowUpDetectionSchema,
  StructuredSummarySchema,
  type FollowUpDetection,
  type StructuredSummary,
} from "./schemas";
import { dataBlock, systemPrompt } from "./prompts";
import { runStructured, type AiCallResult, type AiContext } from "./gateway";

/**
 * Turning a messy free-text summary into structure.
 *
 * The employee types whatever they remember. The model reorganises it — it does
 * not add to it. The original text is stored verbatim alongside the structured
 * version, and the structured version is only saved once the employee approves
 * it on screen.
 */

const STRUCTURE_ROLE =
  "You tidy up a meeting summary that a colleague typed quickly. You reorganise their words. You never add a fact, a name, a date or a commitment they did not write.";

const FOLLOW_UP_ROLE =
  "You decide whether a written meeting summary implies that another contact is needed later, and when.";

export type StructureSummaryInput = {
  requestId: string;
  rawText: string;
};

export async function structureSummary(
  ctx: AiContext,
  input: StructureSummaryInput,
): Promise<AiCallResult<StructuredSummary>> {
  const request = await ctx.db.meetingRequest.findUnique({
    where: { id: input.requestId },
    select: {
      requestNumber: true,
      subject: true,
      purpose: true,
      contact: { select: { fullName: true, company: true } },
      requester: { select: { fullName: true } },
      participants: { select: { user: { select: { fullName: true } } } },
    },
  });

  if (!request) {
    return { ok: false, errorType: "not_found", message: "Request not found" };
  }

  const prompt = [
    dataBlock("meeting context", {
      subject: request.subject,
      purpose: request.purpose,
      contact: request.contact.fullName,
      company: request.contact.company,
      requester: request.requester.fullName,
      colleagues: request.participants.map((p) => p.user.fullName),
    }),
    "--- WHAT THE EMPLOYEE WROTE ---",
    input.rawText,
    "--- END ---",
    "",
    "Rewrite this as a clean summary paragraph, pick the outcome that matches what was written, and pull out any task the writer mentioned.",
    "For each task, copy the owner's name exactly as the writer referred to them, or use null. Copy any deadline exactly as written — never convert it to a date yourself.",
    "Set followUpRequired only if the text says or clearly implies another contact is needed. Set followUpInDays only when a timeframe was actually stated.",
    "If the text is too short or vague to structure, still return a summary containing only what was written.",
  ].join("\n");

  return runStructured(ctx, {
    feature: "SUMMARY_STRUCTURING",
    permission: "summary:submit",
    system: systemPrompt(STRUCTURE_ROLE, ctx.session.locale),
    prompt,
    schema: StructuredSummarySchema,
    effort: "low",
    maxTokens: 8000,
    cacheSystem: true,
    record: { entityType: "MeetingRequest", entityId: input.requestId },
  });
}

export async function detectFollowUp(
  ctx: AiContext,
  input: { requestId: string; summaryText: string },
): Promise<AiCallResult<FollowUpDetection>> {
  const prompt = [
    "--- SUMMARY TEXT ---",
    input.summaryText,
    "--- END ---",
    "",
    "Decide whether another meeting or call is needed later.",
    "Set inDays only when the text states a timeframe. Quote the exact words that led to your conclusion, or return null.",
  ].join("\n");

  return runStructured(ctx, {
    feature: "FOLLOW_UP_DETECTION",
    permission: "followup:create",
    system: systemPrompt(FOLLOW_UP_ROLE, ctx.session.locale),
    prompt,
    schema: FollowUpDetectionSchema,
    effort: "low",
    maxTokens: 4000,
    cacheSystem: true,
    record: { entityType: "MeetingRequest", entityId: input.requestId },
  });
}
