import "server-only";

import type { TenantDb } from "@/lib/tenant";

/**
 * Per-organization settings. Admin-editable, with defaults that make a fresh
 * organization behave sensibly before anyone touches the settings screen.
 */

export type SlaSettings = {
  /** Hours a new request may sit before anyone picks it up. */
  newRequestHours: number;
  /** Days an in-progress request may go without activity. */
  noActivityDays: number;
  /** Days the desk may wait on the other side before chasing. */
  waitingContactDays: number;
  /** Hours after a meeting before its summary counts as late. */
  summaryDueHours: number;
};

export const SLA_DEFAULTS: SlaSettings = {
  newRequestHours: 4,
  noActivityDays: 2,
  waitingContactDays: 3,
  summaryDueHours: 24,
};

const KEYS = {
  newRequestHours: "sla.new_request_hours",
  noActivityDays: "sla.no_activity_days",
  waitingContactDays: "sla.waiting_contact_days",
  summaryDueHours: "sla.summary_due_hours",
} as const;

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function slaSettings(db: TenantDb): Promise<SlaSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });

  const byKey = new Map(rows.map((row) => [row.key, row.valueJson]));

  return {
    newRequestHours: toPositiveNumber(
      byKey.get(KEYS.newRequestHours),
      SLA_DEFAULTS.newRequestHours,
    ),
    noActivityDays: toPositiveNumber(
      byKey.get(KEYS.noActivityDays),
      SLA_DEFAULTS.noActivityDays,
    ),
    waitingContactDays: toPositiveNumber(
      byKey.get(KEYS.waitingContactDays),
      SLA_DEFAULTS.waitingContactDays,
    ),
    summaryDueHours: toPositiveNumber(
      byKey.get(KEYS.summaryDueHours),
      SLA_DEFAULTS.summaryDueHours,
    ),
  };
}
