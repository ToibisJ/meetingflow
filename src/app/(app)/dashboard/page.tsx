import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { formatDay } from "@/lib/dates";

import { KpiRing, type KpiTone } from "@/components/dashboard/kpi-ring";
import { Badge, Eyebrow, GlassCard, cn } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { visibilityScope } from "@/lib/rbac";
import { dashboardSnapshot } from "@/services/dashboard/attention";
import { computePriority } from "@/services/ai/priority";
import { requestVisibility } from "@/services/requests/visibility";
import { OPEN_STATUSES } from "@/lib/workflow";

export const dynamic = "force-dynamic";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-[#e05a4c]",
  warning: "bg-[#e0a83c]",
  info: "bg-[#6ea8f0]",
  success: "bg-[#269684]",
};

export default async function DashboardPage() {
  const ctx = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();

  const { counters, attention } = await dashboardSnapshot(ctx.db, ctx.session);
  const visible = await requestVisibility(ctx.db, ctx.session);

  const open = await ctx.db.meetingRequest.findMany({
    where: { ...visible, status: { in: OPEN_STATUSES } },
    select: {
      id: true,
      requestNumber: true,
      subject: true,
      status: true,
      priority: true,
      slaState: true,
      createdAt: true,
      lastActivityAt: true,
      preferredDate: true,
      scheduledAt: true,
      contact: { select: { fullName: true, company: true } },
      requester: { select: { fullName: true } },
      coordinator: { select: { fullName: true } },
      _count: { select: { activities: true } },
    },
    orderBy: { lastActivityAt: "asc" },
    take: 40,
  });

  const ranked = open
    .map((request) => ({
      request,
      score: computePriority({
        priority: request.priority,
        status: request.status,
        slaState: request.slaState,
        createdAt: request.createdAt,
        lastActivityAt: request.lastActivityAt,
        preferredDate: request.preferredDate,
        scheduledAt: request.scheduledAt,
        contactAttempts: request._count.activities,
        replyReceived: false,
        companyRequestCount: 0,
      }),
    }))
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, 8);

  const totalForRings =
    counters.needsCoordination +
    counters.inProgress +
    counters.waiting +
    counters.scheduled +
    counters.completed;

  const tiles = [
    {
      label: t("dashboard.kpiNeedsCoordination"),
      value: counters.needsCoordination,
      tone: "critical" as KpiTone,
      href: "/requests?status=NEEDS_COORDINATION",
    },
    {
      label: t("dashboard.kpiInProgress"),
      value: counters.inProgress,
      tone: "info" as KpiTone,
      href: "/requests?status=IN_PROGRESS",
    },
    {
      label: t("dashboard.kpiWaiting"),
      value: counters.waiting,
      tone: "warning" as KpiTone,
      href: "/requests?status=WAITING_FOR_CONTACT",
    },
    {
      label: t("dashboard.kpiScheduled"),
      value: counters.scheduled,
      tone: "ok" as KpiTone,
      href: "/requests?status=SCHEDULED",
    },
    {
      label: t("dashboard.kpiToday"),
      value: counters.today,
      tone: "info" as KpiTone,
      href: "/requests?view=today",
    },
    {
      label: t("dashboard.kpiCompleted"),
      value: counters.completed,
      tone: "neutral" as KpiTone,
      href: "/requests?status=COMPLETED",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>{t("dashboard.title")}</Eyebrow>
          <h1 className="text-[28px] font-medium text-ice-highlight">
            {t("dashboard.greeting", { name: ctx.session.fullName })}
          </h1>
        </div>

        {/* The shortcuts that used to sit here are in the top bar now, on every
            screen. What belongs here instead is what the top bar cannot say:
            which day you are looking at. */}
        <p className="text-[14px] text-fog-veil">{formatDay(new Date(), locale)}</p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <KpiRing
            key={tile.label}
            label={tile.label}
            value={tile.value}
            total={totalForRings}
            tone={tile.tone}
            href={tile.href}
          />
        ))}
      </section>

      <GlassCard className="flex flex-col gap-4">
        <h2 className="text-[18px] font-medium text-ice-highlight">
          {t("dashboard.attentionTitle")}
        </h2>

        {attention.length === 0 ? (
          <p className="text-[14px] text-fog-veil">{t("dashboard.attentionEmpty")}</p>
        ) : (
          <ul className="flex flex-col">
            {attention.map((bucket) => (
              <li key={bucket.key}>
                <Link
                  href={bucket.href}
                  className="flex items-center gap-3 rounded-[6px] px-2 py-3 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
                >
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      SEVERITY_DOT[bucket.severity],
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-[14px] text-moon-mist">
                    {t(`dashboard.${bucket.key}`, bucket.params)}
                  </span>
                  <ChevronLeft size={16} className="opacity-50 rtl:rotate-0 ltr:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-medium text-ice-highlight">
            {/* An employee's list is their own work, not the organization's. */}
            {t(
              visibilityScope(ctx.session.role) === "OWN"
                ? "requests.myTitle"
                : "requests.title",
            )}
          </h2>
          <span className="text-[12px] text-fog-veil">
            {t("requests.count", { count: open.length })}
          </span>
        </div>

        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr className="text-start text-fog-veil">
                <th className="px-2 pb-3 text-start font-normal">
                  {t("requests.colNumber")}
                </th>
                <th className="px-2 pb-3 text-start font-normal">
                  {t("requests.colContact")}
                </th>
                <th className="px-2 pb-3 text-start font-normal">
                  {t("requests.colSubject")}
                </th>
                <th className="px-2 pb-3 text-start font-normal">
                  {t("requests.colStatus")}
                </th>
                <th className="px-2 pb-3 text-start font-normal">
                  {t("requests.colCoordinator")}
                </th>
                <th className="px-2 pb-3 text-start font-normal">
                  {t("requests.colOpenFor")}
                </th>
                <th className="px-2 pb-3 text-start font-normal">Priority</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ request, score }) => (
                <tr
                  key={request.id}
                  className="border-t border-[rgba(186,215,247,0.12)]"
                >
                  <td className="px-2 py-3">
                    <Link
                      href={`/requests/${request.requestNumber}`}
                      className="tabular-nums text-frost-glow underline-offset-4 hover:underline"
                    >
                      {request.requestNumber}
                    </Link>
                  </td>
                  <td className="px-2 py-3 text-moon-mist">
                    <span className="block text-frost-glow">
                      {request.contact.fullName}
                    </span>
                    <span className="block text-[12px] text-fog-veil">
                      {request.contact.company}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-2 py-3">
                    <Link
                      href={`/requests/${request.requestNumber}`}
                      className="block truncate text-moon-mist hover:text-frost-glow"
                    >
                      {request.subject}
                    </Link>
                  </td>
                  <td className="px-2 py-3">
                    <Badge
                      tone={
                        request.slaState === "RED"
                          ? "late"
                          : request.slaState === "AMBER"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {t(`status.${request.status}`)}
                    </Badge>
                  </td>
                  <td className="px-2 py-3 text-moon-mist">
                    {request.coordinator?.fullName ?? (
                      <span className="text-fog-veil">{t("common.unassigned")}</span>
                    )}
                  </td>
                  <td className="px-2 py-3 tabular-nums text-moon-mist">
                    {t("time.days", {
                      count: Math.floor(
                        (Date.now() - request.createdAt.getTime()) / 86_400_000,
                      ),
                    })}
                  </td>
                  <td className="px-2 py-3">
                    <Badge
                      tone={
                        score.band === "CRITICAL"
                          ? "late"
                          : score.band === "HIGH"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {score.score}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
