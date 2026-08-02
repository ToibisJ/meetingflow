import { getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2, ExternalLink, Plug } from "lucide-react";

import { Badge, Eyebrow, GlassCard, cn } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { formatEventTime } from "@/lib/dates";
import { connectionStates } from "@/services/connections/providers";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

const TONE = {
  CONNECTED: "ok",
  DISCONNECTED: "neutral",
  NOT_CONFIGURED: "warn",
  NEEDS_ATTENTION: "warn",
  EXPIRED: "late",
} as const;

export default async function ProfilePage() {
  const ctx = await requireUser();
  const t = await getTranslations();

  const [user, connections] = await Promise.all([
    ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.id },
      select: {
        fullName: true,
        email: true,
        phone: true,
        whatsapp: true,
        jobTitle: true,
        workStart: true,
        workEnd: true,
        locale: true,
        role: true,
        department: { select: { name: true } },
        manager: { select: { fullName: true } },
      },
    }),
    connectionStates(ctx.db, ctx.session.id),
  ]);

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("profile.title")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">{user.fullName}</h1>
        <p className="flex flex-wrap items-center gap-2 text-[14px] text-fog-veil">
          <Badge>{t(`roles.${user.role}`)}</Badge>
          {user.department ? <Badge>{user.department.name}</Badge> : null}
          {user.manager ? <span>{user.manager.fullName}</span> : null}
        </p>
      </header>

      <GlassCard className="flex flex-col gap-4">
        <div>
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("profile.title")}
          </h2>
          <p className="text-[13px] text-fog-veil">{t("profile.subtitle")}</p>
        </div>

        <ProfileForm
          values={{
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            whatsapp: user.whatsapp,
            jobTitle: user.jobTitle,
            workStart: user.workStart,
            workEnd: user.workEnd,
            locale: user.locale,
          }}
        />
      </GlassCard>

      <GlassCard className="flex flex-col gap-5">
        <div>
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("profile.connectionsTitle")}
          </h2>
          <p className="text-[13px] text-fog-veil">{t("profile.connectionsSubtitle")}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {connections.map((connection) => {
            const configured = connection.status !== "NOT_CONFIGURED";
            const connected = connection.status === "CONNECTED";

            return (
              <div
                key={connection.definition.provider}
                className="flex flex-col gap-4 rounded-[12px] p-5 shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(186,214,247,0.06)]">
                      {connected ? (
                        <CheckCircle2 size={18} className="text-[#7fd7c6]" />
                      ) : configured ? (
                        <Plug size={18} className="opacity-70" />
                      ) : (
                        <AlertTriangle size={18} className="text-[#e8c37a]" />
                      )}
                    </span>
                    <div>
                      <p className="text-[16px] text-frost-glow">
                        {connection.definition.name}
                      </p>
                      <p className="text-[12px] text-fog-veil">
                        {connection.accountEmail ?? t("profile.statusDISCONNECTED")}
                      </p>
                    </div>
                  </div>

                  <Badge tone={TONE[connection.status]}>
                    {t(`profile.status${connection.status}`)}
                  </Badge>
                </div>

                <div className="flex flex-col gap-1">
                  <p
                    className="text-[11px] uppercase tracking-[0.1em] text-fog-veil"
                    style={{ fontFamily: "var(--font-dotdigital)" }}
                  >
                    {t("profile.whatItDoes")}
                  </p>
                  <ul className="flex flex-col gap-1 text-[13px] text-moon-mist">
                    {connection.definition.capabilities.map((capability) => (
                      <li key={capability.en}>
                        {ctx.session.locale === "en" ? capability.en : capability.he}
                      </li>
                    ))}
                  </ul>
                </div>

                {connected ? (
                  <p className="text-[12.5px] text-fog-veil">
                    {t("profile.lastSync")}:{" "}
                    {connection.lastSyncAt
                      ? formatEventTime(connection.lastSyncAt)
                      : t("profile.neverSynced")}
                  </p>
                ) : null}

                {connection.lastSyncError ? (
                  <p className="rounded-[6px] bg-[rgba(224,90,76,0.12)] px-3 py-2 text-[12.5px] text-[#f0a094]">
                    {connection.lastSyncError}
                  </p>
                ) : null}

                {/* An unconfigured provider states exactly what is missing rather
                    than offering a button that cannot work. */}
                {!configured ? (
                  <div className="flex flex-col gap-2 rounded-[8px] bg-[rgba(224,168,60,0.08)] p-3">
                    <p className="text-[13px] font-medium text-[#e8c37a]">
                      {t("profile.notConfiguredTitle")}
                    </p>
                    <p className="text-[12.5px] leading-relaxed text-moon-mist">
                      {t("profile.notConfiguredBody")}
                    </p>

                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-fog-veil">
                        {t("profile.missingVariables")}
                      </span>
                      <code className="block overflow-x-auto rounded-[4px] bg-[rgba(5,6,15,0.6)] px-2 py-1.5 text-[12px] text-frost-glow" dir="ltr">
                        {connection.missingEnv.join("  ")}
                      </code>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-fog-veil">
                        {t("profile.redirectUri")}
                      </span>
                      <code className="block overflow-x-auto rounded-[4px] bg-[rgba(5,6,15,0.6)] px-2 py-1.5 text-[12px] text-frost-glow" dir="ltr">
                        {appUrl}
                        {connection.definition.redirectPath}
                      </code>
                    </div>

                    <a
                      href={connection.definition.consoleUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-[#c0acff] underline underline-offset-4"
                    >
                      {t("profile.openConsole")}
                      <ExternalLink size={13} />
                    </a>
                  </div>
                ) : (
                  <a
                    href={`/api/connections/${connection.definition.provider.toLowerCase()}/start`}
                    className={cn(
                      "inline-flex w-fit items-center gap-2 rounded-[999px] px-5 py-2.5 text-[13.5px]",
                      "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] transition-colors",
                      connected
                        ? "bg-[rgba(186,214,247,0.04)] text-moon-mist hover:bg-[rgba(186,214,247,0.1)]"
                        : "bg-void-violet text-pure-white hover:opacity-90",
                    )}
                  >
                    {connected ? t("profile.reconnect") : t("profile.connect")}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
