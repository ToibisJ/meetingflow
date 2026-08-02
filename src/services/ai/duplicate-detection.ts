import "server-only";

import type { RequestStatus } from "@/generated/prisma/enums";

import { DuplicateVerdictSchema, type DuplicateVerdict } from "./schemas";
import { dataBlock, formatDate, systemPrompt } from "./prompts";
import { runStructured, type AiContext } from "./gateway";
import { requestVisibility } from "@/services/requests/visibility";
import { TERMINAL_STATUSES } from "@/lib/workflow";

/**
 * "Someone may already be arranging this."
 *
 * Two constraints shape this feature:
 *   - The candidate list is fetched through the requester's own visibility
 *     filter, so an employee is never shown a request they are not allowed to
 *     see, not even as a duplicate warning.
 *   - The model only ranks candidates it was handed. Any request number it
 *     returns that was not in the list is discarded.
 */

const ROLE =
  "You decide whether a new meeting request duplicates one that already exists. You compare the people, the companies and the subjects.";

export type DuplicateCandidate = {
  requestNumber: number;
  subject: string;
  status: RequestStatus;
  contactName: string;
  company: string | null;
  requesterName: string;
  createdAt: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type DuplicateCheckInput = {
  contactFullName: string;
  company?: string | null;
  subject: string;
};

export async function findPossibleDuplicates(
  ctx: AiContext,
  input: DuplicateCheckInput,
): Promise<{ candidates: DuplicateCandidate[]; unavailableReason: string | null }> {
  const visible = await requestVisibility(ctx.db, ctx.session);

  // A cheap pre-filter first — the model is only asked to judge near matches.
  const pool = await ctx.db.meetingRequest.findMany({
    where: {
      ...visible,
      status: { notIn: TERMINAL_STATUSES },
      OR: [
        {
          contact: {
            fullName: {
              contains: input.contactFullName,
              mode: "insensitive" as const,
            },
          },
        },
        ...(input.company
          ? [
              {
                contact: {
                  company: {
                    contains: input.company,
                    mode: "insensitive" as const,
                  },
                },
              },
            ]
          : []),
      ],
    },
    select: {
      requestNumber: true,
      subject: true,
      status: true,
      createdAt: true,
      contact: { select: { fullName: true, company: true } },
      requester: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (pool.length === 0) {
    return { candidates: [], unavailableReason: null };
  }

  const byNumber = new Map(pool.map((row) => [row.requestNumber, row]));

  const result = await runStructured(ctx, {
    feature: "DUPLICATE_DETECTION",
    permission: "request:create",
    system: systemPrompt(ROLE, ctx.session.locale),
    prompt: [
      dataBlock("the new request being opened", input),
      dataBlock(
        "existing open requests that may overlap",
        pool.map((row) => ({
          requestNumber: row.requestNumber,
          subject: row.subject,
          status: row.status,
          contact: row.contact.fullName,
          company: row.contact.company,
          requester: row.requester.fullName,
          createdAt: formatDate(row.createdAt),
        })),
      ),
      "",
      "Return only the existing requests that genuinely look like the same piece of work.",
      "Use requestNumber values from the list only. Return an empty list when nothing matches.",
      "Rate confidence high only when the contact and the subject both line up.",
    ].join("\n\n"),
    schema: DuplicateVerdictSchema,
    effort: "low",
    maxTokens: 5000,
    cacheSystem: true,
  });

  if (!result.ok) {
    return { candidates: [], unavailableReason: result.message };
  }

  const verdict: DuplicateVerdict = result.value;

  const candidates = verdict.candidates
    .map((candidate) => {
      const row = byNumber.get(candidate.requestNumber);
      if (!row) return null;

      return {
        requestNumber: row.requestNumber,
        subject: row.subject,
        status: row.status,
        contactName: row.contact.fullName,
        company: row.contact.company,
        requesterName: row.requester.fullName,
        createdAt: formatDate(row.createdAt),
        confidence: candidate.confidence,
        reason: candidate.reason,
      } satisfies DuplicateCandidate;
    })
    .filter((candidate): candidate is DuplicateCandidate => candidate !== null);

  return { candidates, unavailableReason: null };
}
