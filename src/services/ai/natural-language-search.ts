import "server-only";

import { SearchFilterSchema, type SearchFilter } from "./schemas";
import { systemPrompt } from "./prompts";
import { runStructured, type AiContext } from "./gateway";
import { requestVisibility } from "@/services/requests/visibility";

/**
 * Search in plain language.
 *
 * The model never writes a query. It fills in a fixed, enum-constrained filter
 * object; this module turns that object into a Prisma clause and always
 * combines it with the user's own visibility filter using AND. A filter asking
 * for another employee's requests therefore returns nothing for an employee and
 * everything for a coordinator — the permission layer decides, not the model.
 */

const ROLE = `You translate a question about meeting requests into a search filter.

You are filling in a fixed form, not writing a query. Leave a field null or empty when the question does not mention it. Never widen the search beyond what was asked.

Guidance for the trickier fields:
- openLongerThanDays: use for "still open after…", "waiting more than…".
- noActivityForDays: use for "stuck", "nothing happened", "no one touched".
- missingSummary: use for "ended without a summary".
- overdueOnly: use for "late", "breached", "past the deadline".
- unassignedOnly: use for "nobody is handling".
- requesterName / coordinatorName / contactName / company: copy the name exactly as written in the question.`;

export type SearchResultRow = {
  requestNumber: number;
  subject: string;
  status: string;
  priority: string;
  contactName: string;
  company: string | null;
  requesterName: string;
  coordinatorName: string | null;
  createdAt: Date;
  scheduledAt: Date | null;
  lastActivityAt: Date;
};

export type NaturalSearchResult = {
  interpretation: string;
  filter: SearchFilter;
  rows: SearchResultRow[];
  truncated: boolean;
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function daysAhead(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

/**
 * Translates the validated filter into a Prisma clause.
 * Only fields present on this switchboard can ever reach the database.
 */
function toWhere(filter: SearchFilter): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (filter.statuses.length > 0) and.push({ status: { in: filter.statuses } });
  if (filter.priorities.length > 0) and.push({ priority: { in: filter.priorities } });
  if (filter.types.length > 0) and.push({ type: { in: filter.types } });

  if (filter.freeText) {
    and.push({
      OR: [
        { subject: { contains: filter.freeText, mode: "insensitive" } },
        { purpose: { contains: filter.freeText, mode: "insensitive" } },
        { description: { contains: filter.freeText, mode: "insensitive" } },
        { summaries: { some: { summary: { contains: filter.freeText, mode: "insensitive" } } } },
      ],
    });
  }

  if (filter.requesterName) {
    and.push({
      requester: { fullName: { contains: filter.requesterName, mode: "insensitive" } },
    });
  }

  if (filter.coordinatorName) {
    and.push({
      coordinator: { fullName: { contains: filter.coordinatorName, mode: "insensitive" } },
    });
  }

  if (filter.departmentName) {
    and.push({
      requester: {
        department: { name: { contains: filter.departmentName, mode: "insensitive" } },
      },
    });
  }

  if (filter.company) {
    and.push({ contact: { company: { contains: filter.company, mode: "insensitive" } } });
  }

  if (filter.contactName) {
    and.push({ contact: { fullName: { contains: filter.contactName, mode: "insensitive" } } });
  }

  if (filter.createdWithinDays) {
    and.push({ createdAt: { gte: daysAgo(filter.createdWithinDays) } });
  }

  if (filter.scheduledWithinDays) {
    and.push({
      scheduledAt: { gte: new Date(), lte: daysAhead(filter.scheduledWithinDays) },
    });
  }

  if (filter.openLongerThanDays) {
    and.push({
      createdAt: { lt: daysAgo(filter.openLongerThanDays) },
      closedAt: null,
    });
  }

  if (filter.noActivityForDays) {
    and.push({ lastActivityAt: { lt: daysAgo(filter.noActivityForDays) } });
  }

  if (filter.missingSummary) {
    and.push({ status: "SUMMARY_REQUIRED" });
  }

  if (filter.overdueOnly) {
    and.push({ slaState: { in: ["AMBER", "RED"] } });
  }

  if (filter.unassignedOnly) {
    and.push({ assignedCoordinatorId: null });
  }

  return and.length > 0 ? { AND: and } : {};
}

function toOrderBy(filter: SearchFilter): Record<string, "asc" | "desc"> {
  switch (filter.sortBy) {
    case "PRIORITY":
      return { priority: "desc" };
    case "OPEN_TIME":
      return { createdAt: "asc" };
    case "SCHEDULED":
      return { scheduledAt: "asc" };
    default:
      return { createdAt: "desc" };
  }
}

export async function naturalLanguageSearch(
  ctx: AiContext,
  question: string,
): Promise<
  | { ok: true; result: NaturalSearchResult }
  | { ok: false; errorType: string; message: string }
> {
  const parsed = await runStructured(ctx, {
    feature: "NATURAL_LANGUAGE_SEARCH",
    permission: "request:read:own",
    system: systemPrompt(ROLE, ctx.session.locale),
    prompt: `QUESTION: ${question}`,
    schema: SearchFilterSchema,
    effort: "low",
    maxTokens: 5000,
    cacheSystem: true,
  });

  if (!parsed.ok) return parsed;

  const filter = parsed.value;

  // The user's own visibility is applied on top of whatever the model asked
  // for. This is the line that makes the feature safe.
  const visible = await requestVisibility(ctx.db, ctx.session);
  const limit = Math.min(filter.limit, 100);

  const rows = await ctx.db.meetingRequest.findMany({
    where: { AND: [visible, toWhere(filter)] },
    select: {
      requestNumber: true,
      subject: true,
      status: true,
      priority: true,
      createdAt: true,
      scheduledAt: true,
      lastActivityAt: true,
      contact: { select: { fullName: true, company: true } },
      requester: { select: { fullName: true } },
      coordinator: { select: { fullName: true } },
    },
    orderBy: toOrderBy(filter),
    take: limit + 1,
  });

  const truncated = rows.length > limit;

  return {
    ok: true,
    result: {
      interpretation: filter.interpretation,
      filter,
      truncated,
      rows: rows.slice(0, limit).map((row) => ({
        requestNumber: row.requestNumber,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        contactName: row.contact.fullName,
        company: row.contact.company,
        requesterName: row.requester.fullName,
        coordinatorName: row.coordinator?.fullName ?? null,
        createdAt: row.createdAt,
        scheduledAt: row.scheduledAt,
        lastActivityAt: row.lastActivityAt,
      })),
    },
  };
}
