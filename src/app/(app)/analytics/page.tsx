import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge, Eyebrow, GlassCard, cn } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { requestVisibility } from "@/services/requests/visibility";
import { BOOKED_STATUSES } from "@/lib/workflow";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90, 365] as const;

/** A single measured figure. Every number on this page is counted, not estimated. */
function Metric({
  label,
  value,
  suffix,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  suffix?: string;
  tone?: "neutral" | "ok" | "warn" | "late";
}) {
  const colour = {
    neutral: "text-ice-highlight",
    ok: "text-[#7fd7c6]",
    warn: "text-[#e8c37a]",
    late: "text-[#f0a094]",
  }[tone];

  return (
    <div className="flex flex-col gap-1 rounded-[12px] p-4 shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]">
      <span className="text-[12.5px] text-fog-veil">{label}</span>
      <span className={cn("text-[26px] font-medium tabular-nums", colour)}>
        {value}
        {suffix ? <span className="text-[14px] text-fog-veil"> {suffix}</span> : null}
      </span>
    </div>
  );
}

/** A horizontal bar, so a distribution reads at a glance rather than as a list. */
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-[140px] shrink-0 truncate text-[13px] text-moon-mist">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[rgba(186,215,247,0.08)]">
        <span
          className="block h-full rounded-full bg-[rgba(102,58,243,0.75)]"
          style={{ width: `${width}%` }}
        />
      </span>
      <span className="w-[36px] shrink-0 text-end text-[13px] tabular-nums text-frost-glow">
        {value}
      </span>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const ctx = await requireUser();

  if (!can(ctx.session.role, "analytics:self")) redirect("/dashboard");

  const t = await getTranslations();

  const windowDays = RANGES.includes(Number(days) as (typeof RANGES)[number])
    ? Number(days)
    : 30;

  const since = new Date(Date.now() - windowDays * 86_400_000);
  const visible = await requestVisibility(ctx.db, ctx.session);
  const scoped = { AND: [visible, {}] };

  const [
    opened,
    scheduled,
    held,
    cancelled,
    declined,
    followUps,
    completed,
    awaiting,
    missingSummary,
    scheduledSample,
    byEmployee,
    byCoordinator,
    attemptGroups,
  ] = await Promise.all([
    ctx.db.meetingRequest.count({
      where: { AND: [visible, { createdAt: { gte: since } }] },
    }),
    ctx.db.meetingRequest.count({
      where: { AND: [visible, { scheduledAt: { gte: since } }] },
    }),
    ctx.db.meeting.count({ where: { status: "HELD", scheduledStart: { gte: since } } }),
    ctx.db.meetingRequest.count({
      where: { AND: [visible, { status: "CANCELLED", closedAt: { gte: since } }] },
    }),
    ctx.db.meetingRequest.count({
      where: { AND: [visible, { status: "DECLINED", closedAt: { gte: since } }] },
    }),
    ctx.db.meetingRequest.count({
      where: { AND: [visible, { parentRequestId: { not: null }, createdAt: { gte: since } }] },
    }),
    ctx.db.meetingRequest.count({
      where: { AND: [visible, { status: "COMPLETED", closedAt: { gte: since } }] },
    }),
    ctx.db.meetingRequest.count({
      where: { AND: [visible, { status: { in: ["NEW", "NEEDS_COORDINATION"] } }] },
    }),
    ctx.db.meetingRequest.count({
      where: { AND: [visible, { status: "SUMMARY_REQUIRED" }] },
    }),
    ctx.db.meetingRequest.findMany({
      where: {
        AND: [
          visible,
          {
            scheduledAt: { gte: since },
            status: { in: [...BOOKED_STATUSES, "COMPLETED", "SUMMARY_REQUIRED"] },
          },
        ],
      },
      select: { createdAt: true, scheduledAt: true },
      take: 500,
    }),
    ctx.db.meetingRequest.groupBy({
      by: ["requesterUserId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    ctx.db.meetingRequest.groupBy({
      by: ["assignedCoordinatorId"],
      where: { createdAt: { gte: since }, assignedCoordinatorId: { not: null } },
      _count: { _all: true },
    }),
    ctx.db.activity.groupBy({
      by: ["requestId"],
      where: { type: "CONTACT_ATTEMPT", occurredAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  void scoped;

  const hours = scheduledSample
    .filter((row) => row.scheduledAt)
    .map((row) => (row.scheduledAt!.getTime() - row.createdAt.getTime()) / 3_600_000)
    .filter((value) => value >= 0);

  const avgHours =
    hours.length > 0
      ? Number((hours.reduce((sum, value) => sum + value, 0) / hours.length).toFixed(1))
      : null;

  const avgAttempts =
    attemptGroups.length > 0
      ? Number(
          (
            attemptGroups.reduce((sum, row) => sum + row._count._all, 0) /
            attemptGroups.length
          ).toFixed(1),
        )
      : null;

  const successRate = opened > 0 ? Math.round((scheduled / opened) * 100) : 0;

  // Resolve the grouped ids into names for display.
  const userIds = [
    ...byEmployee.map((row) => row.requesterUserId),
    ...byCoordinator.map((row) => row.assignedCoordinatorId).filter((id): id is string => !!id),
  ];

  const people = userIds.length
    ? await ctx.db.user.findMany({
        where: { id: { in: [...new Set(userIds)] } },
        select: { id: true, fullName: true },
      })
    : [];

  const nameById = new Map(people.map((person) => [person.id, person.fullName]));

  const employeeRows = byEmployee
    .map((row) => ({
      label: nameById.get(row.requesterUserId) ?? "—",
      value: row._count._all,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const coordinatorRows = byCoordinator
    .map((row) => ({
      label: nameById.get(row.assignedCoordinatorId ?? "") ?? "—",
      value: row._count._all,
    }))
    .sort((a, b) => b.value - a.value);

  const maxEmployee = Math.max(1, ...employeeRows.map((row) => row.value));
  const maxCoordinator = Math.max(1, ...coordinatorRows.map((row) => row.value));

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Eyebrow>{t("nav.analytics")}</Eyebrow>
          <h1 className="text-[28px] font-medium text-ice-highlight">
            {t("analytics.title")}
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/analytics?days=${range}`}
              className={cn(
                "rounded-[999px] px-4 py-2 text-[13px] shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]",
                windowDays === range
                  ? "bg-[rgba(102,58,243,0.2)] text-[#c0acff]"
                  : "bg-[rgba(186,214,247,0.04)] text-moon-mist hover:text-frost-glow",
              )}
            >
              {t(`analytics.range${range}`)}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={t("analytics.totalRequests")} value={opened} />
        <Metric label={t("analytics.scheduledCount")} value={scheduled} tone="ok" />
        <Metric label={t("analytics.heldCount")} value={held} tone="ok" />
        <Metric label={t("analytics.successRate")} value={successRate} suffix="%" />
        <Metric
          label={t("analytics.avgTimeToSchedule")}
          value={avgHours ?? "—"}
          suffix={avgHours === null ? undefined : t("analytics.hours")}
        />
        <Metric label={t("analytics.avgAttempts")} value={avgAttempts ?? "—"} />
        <Metric label={t("analytics.cancelledCount")} value={cancelled} tone="warn" />
        <Metric label={t("status.DECLINED")} value={declined} tone="warn" />
        <Metric label={t("analytics.followUpCount")} value={followUps} />
        <Metric label={t("status.COMPLETED")} value={completed} tone="ok" />
        <Metric
          label={t("dashboard.kpiNeedsCoordination")}
          value={awaiting}
          tone={awaiting > 0 ? "late" : "ok"}
        />
        <Metric
          label={t("status.SUMMARY_REQUIRED")}
          value={missingSummary}
          tone={missingSummary > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("analytics.byEmployee")}
          </h2>
          {employeeRows.length === 0 ? (
            <p className="text-[13px] text-fog-veil">{t("myDay.empty")}</p>
          ) : (
            employeeRows.map((row) => (
              <Bar key={row.label} label={row.label} value={row.value} max={maxEmployee} />
            ))
          )}
        </GlassCard>

        <GlassCard className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("analytics.byCoordinator")}
          </h2>
          {coordinatorRows.length === 0 ? (
            <p className="text-[13px] text-fog-veil">{t("myDay.empty")}</p>
          ) : (
            coordinatorRows.map((row) => (
              <Bar key={row.label} label={row.label} value={row.value} max={maxCoordinator} />
            ))
          )}
        </GlassCard>
      </div>

      <p className="text-[12.5px] text-fog-veil">
        <Badge>{windowDays}</Badge> {t("analytics.days")}
      </p>
    </div>
  );
}
