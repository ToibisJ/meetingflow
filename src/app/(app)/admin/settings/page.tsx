import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Eyebrow, GlassCard } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { slaSettings } from "@/services/settings";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const ctx = await requireUser();
  if (!can(ctx.session.role, "settings:manage")) redirect("/dashboard");

  const t = await getTranslations();
  const sla = await slaSettings(ctx.db);

  const organization = await ctx.db.organization.findUniqueOrThrow({
    where: { id: ctx.session.organizationId },
    select: { name: true, timezone: true, defaultLocale: true, plan: true },
  });

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("nav.settings")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">
          {t("admin.settingsTitle")}
        </h1>
      </header>

      <GlassCard className="flex flex-col gap-4">
        <div>
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("admin.orgSection")}
          </h2>
          <p className="text-[13px] text-fog-veil">
            {organization.name} · {organization.timezone} · {organization.plan}
          </p>
        </div>
      </GlassCard>

      <GlassCard className="flex flex-col gap-4">
        <div>
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("admin.slaSection")}
          </h2>
          <p className="text-[13px] text-fog-veil">{t("dashboard.attentionTitle")}</p>
        </div>

        <SettingsForm values={sla} />
      </GlassCard>
    </div>
  );
}
