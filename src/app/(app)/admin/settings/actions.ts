"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { slaSettings } from "@/services/settings";
import type { SettingsState } from "./form-state";

const KEYS = {
  newRequestHours: "sla.new_request_hours",
  noActivityDays: "sla.no_activity_days",
  waitingContactDays: "sla.waiting_contact_days",
  summaryDueHours: "sla.summary_due_hours",
} as const;

function number(form: FormData, key: string, max: number): number | null {
  const value = Number(String(form.get(key) ?? ""));
  if (!Number.isFinite(value) || value < 1 || value > max) return null;
  return Math.round(value);
}

export async function saveSlaAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  const ctx = await requireUser();

  if (!can(ctx.session.role, "settings:manage")) {
    return { ok: false, message: "אין לך הרשאה לשנות הגדרות." };
  }

  const next = {
    newRequestHours: number(form, "newRequestHours", 168),
    noActivityDays: number(form, "noActivityDays", 60),
    waitingContactDays: number(form, "waitingContactDays", 60),
    summaryDueHours: number(form, "summaryDueHours", 336),
  };

  if (Object.values(next).some((value) => value === null)) {
    return { ok: false, message: "אחד הערכים אינו בטווח המותר." };
  }

  const before = await slaSettings(ctx.db);

  for (const [field, key] of Object.entries(KEYS)) {
    await ctx.db.setting.upsert({
      where: {
        organizationId_key: { organizationId: ctx.session.organizationId, key },
      },
      create: {
        organizationId: ctx.session.organizationId,
        key,
        valueJson: next[field as keyof typeof next] as number,
        updatedByUserId: ctx.session.id,
      },
      update: {
        valueJson: next[field as keyof typeof next] as number,
        updatedByUserId: ctx.session.id,
      },
    });
  }

  await writeAudit(ctx.db, {
    organizationId: ctx.session.organizationId,
    actor: { userId: ctx.session.id, userName: ctx.session.fullName },
    entity: "Setting",
    entityId: "sla",
    action: "update",
    before: { ...before },
    after: { ...(next as Record<string, number>) },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");

  return { ok: true, message: null };
}
