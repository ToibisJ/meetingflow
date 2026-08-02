import "server-only";

import type { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import type { AiFeature, AiSuggestionStatus } from "@/generated/prisma/enums";
import type { TenantDb } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { can, type Permission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

import { aiProvider, type AiEffort, type AiOutcome } from "./provider";
import { monthlyBudget, recordUsage } from "./usage";

/**
 * The gateway every AI feature must go through.
 *
 * Four guarantees, enforced here rather than in each feature:
 *   1. Tenant isolation — the caller hands in a tenant-scoped client, and the
 *      gateway has no way to reach any other organization's rows.
 *   2. Permission — the feature declares the permission it needs, and the
 *      gateway checks it against the signed-in user before spending a token.
 *   3. Cost — every call is metered, and a plan that is over budget is refused
 *      before the request is made.
 *   4. Traceability — a proposal is stored with who asked for it, what the
 *      model returned, what the human changed, and who approved it.
 */

export type AiContext = {
  db: TenantDb;
  session: SessionUser;
  /** The organization's billing plan, used for the AI budget ceiling. */
  plan: string;
};

export type AiCall<S extends z.ZodType> = {
  feature: AiFeature;
  /** Permission the signed-in user must hold. */
  permission: Permission;
  system: string;
  prompt: string;
  schema: S;
  effort?: AiEffort;
  maxTokens?: number;
  /** Cache the system block when the same instructions repeat across calls. */
  cacheSystem?: boolean;
  /** Store the result as a reviewable proposal. */
  record?: {
    entityType: string;
    entityId: string;
  };
};

export type AiCallResult<T> =
  | { ok: true; value: T; suggestionId: string | null }
  | { ok: false; errorType: string; message: string };

/**
 * Runs one structured model call end to end.
 * Returns a plain result — features never see the provider or the usage rows.
 */
export async function runStructured<S extends z.ZodType>(
  ctx: AiContext,
  call: AiCall<S>,
): Promise<AiCallResult<z.infer<S>>> {
  if (!can(ctx.session.role, call.permission)) {
    return {
      ok: false,
      errorType: "forbidden",
      message: "You do not have permission to use this feature.",
    };
  }

  const provider = aiProvider();

  if (!provider.isAvailable()) {
    return {
      ok: false,
      errorType: "unavailable",
      message: "The AI assistant is not configured for this installation.",
    };
  }

  const budget = await monthlyBudget(ctx.db, ctx.plan);
  if (budget.exceeded) {
    return {
      ok: false,
      errorType: "budget_exceeded",
      message: "This organization has reached its monthly AI budget.",
    };
  }

  const outcome = await provider.generateStructuredOutput({
    system: call.system,
    prompt: call.prompt,
    schema: call.schema,
    effort: call.effort,
    maxTokens: call.maxTokens,
    cacheSystem: call.cacheSystem,
  });

  await recordUsage(ctx.db, {
    organizationId: ctx.session.organizationId,
    feature: call.feature,
    userId: ctx.session.id,
    usage: outcome.usage,
    success: outcome.ok,
    errorType: outcome.ok ? null : outcome.errorType,
  });

  if (!outcome.ok) {
    return {
      ok: false,
      errorType: outcome.errorType,
      message: outcome.message,
    };
  }

  let suggestionId: string | null = null;

  if (call.record) {
    const suggestion = await ctx.db.aiSuggestion.create({
      data: {
        organizationId: ctx.session.organizationId,
        userId: ctx.session.id,
        feature: call.feature,
        entityType: call.record.entityType,
        entityId: call.record.entityId,
        proposed: outcome.value as Prisma.InputJsonValue,
        status: "PROPOSED",
      },
    });
    suggestionId = suggestion.id;

    // The proposal itself is an event on the request's timeline, so a reader
    // can see what the assistant offered even if nobody acted on it.
    if (call.record.entityType === "MeetingRequest") {
      await ctx.db.activity.create({
        data: {
          organizationId: ctx.session.organizationId,
          requestId: call.record.entityId,
          actorUserId: null,
          type: "AI_SUGGESTED",
          body: describeFeature(call.feature),
        },
      });
    }
  }

  return { ok: true, value: outcome.value, suggestionId };
}

/** Same flow, for features whose output is prose the user will edit. */
export async function runText(
  ctx: AiContext,
  call: Omit<AiCall<z.ZodType>, "schema">,
): Promise<AiCallResult<string>> {
  if (!can(ctx.session.role, call.permission)) {
    return {
      ok: false,
      errorType: "forbidden",
      message: "You do not have permission to use this feature.",
    };
  }

  const provider = aiProvider();

  if (!provider.isAvailable()) {
    return {
      ok: false,
      errorType: "unavailable",
      message: "The AI assistant is not configured for this installation.",
    };
  }

  const budget = await monthlyBudget(ctx.db, ctx.plan);
  if (budget.exceeded) {
    return {
      ok: false,
      errorType: "budget_exceeded",
      message: "This organization has reached its monthly AI budget.",
    };
  }

  const outcome: AiOutcome<string> = await provider.generateText({
    system: call.system,
    prompt: call.prompt,
    effort: call.effort,
    maxTokens: call.maxTokens,
    cacheSystem: call.cacheSystem,
  });

  await recordUsage(ctx.db, {
    organizationId: ctx.session.organizationId,
    feature: call.feature,
    userId: ctx.session.id,
    usage: outcome.usage,
    success: outcome.ok,
    errorType: outcome.ok ? null : outcome.errorType,
  });

  if (!outcome.ok) {
    return { ok: false, errorType: outcome.errorType, message: outcome.message };
  }

  return { ok: true, value: outcome.value, suggestionId: null };
}

/**
 * Records what the human did with a proposal.
 *
 * This is the half of the AI audit trail that matters: the timeline ends up
 * showing what was suggested, whether a person changed it, and who approved it.
 */
export async function decideSuggestion(
  ctx: AiContext,
  input: {
    suggestionId: string;
    status: Extract<AiSuggestionStatus, "ACCEPTED" | "EDITED" | "REJECTED">;
    approved?: unknown;
  },
): Promise<void> {
  const before = await ctx.db.aiSuggestion.findUnique({
    where: { id: input.suggestionId },
  });

  if (!before) return;

  const after = await ctx.db.aiSuggestion.update({
    where: { id: input.suggestionId },
    data: {
      status: input.status,
      approved:
        input.approved === undefined
          ? undefined
          : (input.approved as Prisma.InputJsonValue),
      decidedAt: new Date(),
      decidedByUserId: ctx.session.id,
    },
  });

  if (before.entityType === "MeetingRequest" && before.entityId) {
    await ctx.db.activity.create({
      data: {
        organizationId: ctx.session.organizationId,
        requestId: before.entityId,
        actorUserId: ctx.session.id,
        type:
          input.status === "REJECTED"
            ? "AI_REJECTED"
            : input.status === "EDITED"
              ? "AI_EDITED"
              : "AI_APPROVED",
        body: describeFeature(before.feature),
      },
    });
  }

  await writeAudit(ctx.db, {
    organizationId: ctx.session.organizationId,
    actor: { userId: ctx.session.id, userName: ctx.session.fullName },
    entity: "AiSuggestion",
    entityId: after.id,
    action: input.status.toLowerCase(),
    before: { status: before.status },
    after: { status: after.status },
  });
}

/** Short, stable label for a feature. Translated in the UI by this key. */
function describeFeature(feature: AiFeature): string {
  return `ai.feature.${feature}`;
}
