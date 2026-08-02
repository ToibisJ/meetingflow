import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge, Eyebrow, EmptyState, GlassCard } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { formatEventTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Field names as a person would say them, so the log reads in plain language. */
const FIELD_LABELS: Record<string, string> = {
  status: "סטטוס",
  assignedCoordinatorId: "מתאם מטפל",
  scheduledAt: "מועד הפגישה",
  subject: "נושא",
  priority: "עדיפות",
  isActive: "פעיל",
  fullName: "שם מלא",
  phone: "טלפון",
  whatsapp: "וואטסאפ",
  jobTitle: "תפקיד",
  locale: "שפה",
  workStart: "תחילת יום",
  workEnd: "סוף יום",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const ctx = await requireUser();
  if (!can(ctx.session.role, "audit:read:all")) redirect("/dashboard");

  const t = await getTranslations();

  const rows = await ctx.db.auditLog.findMany({
    where: entity ? { entity } : {},
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("nav.auditLog")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">
          {t("admin.auditTitle")}
        </h1>
      </header>

      <GlassCard className="flex flex-col">
        {rows.length === 0 ? (
          <EmptyState title={t("admin.auditEmpty")} />
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-1.5 border-b border-[rgba(186,215,247,0.08)] py-3 last:border-b-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] tabular-nums text-fog-veil">
                  {formatEventTime(row.occurredAt)}
                </span>
                <Badge>{row.entity}</Badge>
                <Badge tone="neutral">{row.action}</Badge>
                <span className="text-[14px] text-frost-glow">{row.userName}</span>
              </div>

              {row.field ? (
                <p className="text-[13px] text-moon-mist">
                  {t("admin.auditChanged", {
                    user: row.userName,
                    field: FIELD_LABELS[row.field] ?? row.field,
                  })}
                  {": "}
                  <span className="text-fog-veil line-through">{row.oldValue ?? "—"}</span>
                  {" → "}
                  <span className="text-frost-glow">{row.newValue ?? "—"}</span>
                </p>
              ) : null}
            </div>
          ))
        )}
      </GlassCard>
    </div>
  );
}
