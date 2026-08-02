import "server-only";

import type { AiFeature } from "@/generated/prisma/enums";
import type { AiUsage } from "./provider";
import type { TenantDb } from "@/lib/tenant";

/**
 * AI cost accounting.
 *
 * Every model call is written to ai_usage_logs, successful or not, so an admin
 * can see spend per organization and so a plan limit can be enforced before the
 * next call rather than after the invoice.
 */

/** US dollars per million tokens, as published for each model. */
type Rate = { input: number; output: number };

const RATES: Record<string, Rate> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5": { input: 10, output: 50 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Falls back to Opus rates so an unknown model is never billed as free. */
function rateFor(model: string): Rate {
  return RATES[model] ?? { input: 5, output: 25 };
}

const MILLION = 1_000_000;
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export function estimateCost(usage: AiUsage): number {
  const rate = rateFor(usage.model);

  const cost =
    (usage.inputTokens * rate.input +
      usage.outputTokens * rate.output +
      usage.cacheReadTokens * rate.input * CACHE_READ_MULTIPLIER +
      usage.cacheWriteTokens * rate.input * CACHE_WRITE_MULTIPLIER) /
    MILLION;

  return Number(cost.toFixed(6));
}

export type UsageRecord = {
  organizationId: string;
  feature: AiFeature;
  userId: string | null;
  usage: AiUsage | null;
  success: boolean;
  errorType?: string | null;
};

/** Writes one usage row. Never throws — accounting must not break a feature. */
export async function recordUsage(
  db: TenantDb,
  record: UsageRecord,
): Promise<void> {
  const usage = record.usage;

  try {
    await db.aiUsageLog.create({
      data: {
        organizationId: record.organizationId,
        userId: record.userId,
        feature: record.feature,
        model: usage?.model ?? "none",
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cacheReadTokens: usage?.cacheReadTokens ?? 0,
        cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
        estimatedCost: usage ? estimateCost(usage) : 0,
        latencyMs: usage?.latencyMs ?? null,
        success: record.success,
        errorType: record.errorType ?? null,
      },
    });
  } catch {
    // Accounting is best-effort. A failure here must not surface to the user.
  }
}

/** Monthly ceilings in US dollars, by plan. Null means unlimited. */
const PLAN_MONTHLY_BUDGET: Record<string, number | null> = {
  free: 5,
  standard: 100,
  business: 500,
  enterprise: null,
};

export type BudgetState = {
  plan: string;
  limit: number | null;
  spent: number;
  remaining: number | null;
  exceeded: boolean;
};

/** Spend for the current calendar month, and whether the plan allows more. */
export async function monthlyBudget(
  db: TenantDb,
  plan: string,
): Promise<BudgetState> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const aggregate = await db.aiUsageLog.aggregate({
    where: { createdAt: { gte: monthStart } },
    _sum: { estimatedCost: true },
  });

  const spent = Number(aggregate._sum.estimatedCost ?? 0);
  const limit = PLAN_MONTHLY_BUDGET[plan] ?? null;

  return {
    plan,
    limit,
    spent: Number(spent.toFixed(4)),
    remaining: limit === null ? null : Number(Math.max(0, limit - spent).toFixed(4)),
    exceeded: limit !== null && spent >= limit,
  };
}

/** Spend grouped by feature, for the admin usage screen. */
export async function usageByFeature(db: TenantDb, since: Date) {
  const rows = await db.aiUsageLog.groupBy({
    by: ["feature"],
    where: { createdAt: { gte: since } },
    _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
  });

  return rows
    .map((row) => ({
      feature: row.feature,
      calls: row._count._all,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      cost: Number(row._sum.estimatedCost ?? 0),
    }))
    .sort((a, b) => b.cost - a.cost);
}
