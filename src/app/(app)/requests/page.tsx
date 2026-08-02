import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge, Eyebrow, GlassCard, TextInput, cn } from "@/components/ui/primitives";
import { REQUEST_ROW_SELECT, RequestTable } from "@/components/requests/request-table";
import { requireUser } from "@/lib/current-user";
import { requestVisibility } from "@/services/requests/visibility";
import { BOOKED_STATUSES, OPEN_STATUSES } from "@/lib/workflow";
import type { RequestStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const STATUSES: RequestStatus[] = [
  "NEW",
  "NEEDS_COORDINATION",
  "IN_PROGRESS",
  "WAITING_FOR_CONTACT",
  "WAITING_FOR_EMPLOYEE",
  "SCHEDULED",
  "RESCHEDULE_REQUESTED",
  "RESCHEDULED",
  "SUMMARY_REQUIRED",
  "COMPLETED",
  "CANCELLED",
  "DECLINED",
];

type Search = {
  status?: string;
  view?: string;
  q?: string;
  coordinator?: string;
  priority?: string;
};

/** Turns the query string into a Prisma clause. Unknown values are ignored. */
function buildWhere(search: Search): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (search.status && STATUSES.includes(search.status as RequestStatus)) {
    and.push({ status: search.status });
  }

  if (search.priority && ["NORMAL", "HIGH", "URGENT"].includes(search.priority)) {
    and.push({ priority: search.priority });
  }

  if (search.coordinator === "unassigned") {
    and.push({ assignedCoordinatorId: null });
  } else if (search.coordinator) {
    and.push({ assignedCoordinatorId: search.coordinator });
  }

  if (search.q) {
    const term = search.q.trim();
    const asNumber = Number(term);

    and.push({
      OR: [
        { subject: { contains: term, mode: "insensitive" as const } },
        { purpose: { contains: term, mode: "insensitive" as const } },
        { contact: { fullName: { contains: term, mode: "insensitive" as const } } },
        { contact: { company: { contains: term, mode: "insensitive" as const } } },
        { contact: { phone: { contains: term } } },
        { contact: { email: { contains: term, mode: "insensitive" as const } } },
        { requester: { fullName: { contains: term, mode: "insensitive" as const } } },
        { summaries: { some: { summary: { contains: term, mode: "insensitive" as const } } } },
        ...(Number.isInteger(asNumber) ? [{ requestNumber: asNumber }] : []),
      ],
    });
  }

  switch (search.view) {
    case "open":
      and.push({ status: { in: OPEN_STATUSES } });
      break;
    case "today": {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      and.push({ status: { in: BOOKED_STATUSES }, scheduledAt: { gte: start, lte: end } });
      break;
    }
    case "overdue":
      and.push({ slaState: { in: ["AMBER", "RED"] }, closedAt: null });
      break;
    case "untouched":
      and.push({
        status: { in: ["NEW", "NEEDS_COORDINATION"] },
        createdAt: { lt: new Date(Date.now() - 4 * 3_600_000) },
      });
      break;
    case "stale":
      and.push({
        status: { in: OPEN_STATUSES.filter((status) => status !== "NEW") },
        lastActivityAt: { lt: new Date(Date.now() - 2 * 86_400_000) },
      });
      break;
    default:
      break;
  }

  return and.length > 0 ? { AND: and } : {};
}

const chip = (active: boolean) =>
  cn(
    "inline-flex items-center rounded-[999px] px-3 py-1.5 text-[12.5px] transition-colors",
    "shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)]",
    active
      ? "bg-[rgba(102,58,243,0.2)] text-[#c0acff]"
      : "bg-[rgba(186,214,247,0.04)] text-moon-mist hover:bg-[rgba(186,214,247,0.1)]",
  );

export default async function AllRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const ctx = await requireUser();
  const t = await getTranslations();

  const visible = await requestVisibility(ctx.db, ctx.session);

  const [rows, coordinators] = await Promise.all([
    ctx.db.meetingRequest.findMany({
      where: { AND: [visible, buildWhere(search)] },
      select: REQUEST_ROW_SELECT,
      orderBy: { lastActivityAt: "desc" },
      take: 200,
    }),
    ctx.db.user.findMany({
      where: { role: { in: ["COORDINATOR", "ADMIN", "MANAGER"] }, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const views = [
    { key: undefined, label: t("requests.viewAll") },
    { key: "open", label: t("nav.allRequests") },
    { key: "today", label: t("dashboard.kpiToday") },
    { key: "overdue", label: t("requests.viewOverdue") },
    { key: "untouched", label: t("requests.viewUnassigned") },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("nav.allRequests")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">
          {t("requests.title")}
        </h1>
      </header>

      <GlassCard className="flex flex-col gap-4">
        <form className="flex flex-wrap items-end gap-3" action="/requests">
          <label className="flex min-w-[240px] flex-1 flex-col gap-2">
            <span className="text-[13px] text-moon-mist">{t("common.search")}</span>
            <TextInput
              name="q"
              defaultValue={search.q ?? ""}
              placeholder={t("requests.searchPlaceholder")}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-moon-mist">{t("requests.filterStatus")}</span>
            <select
              name="status"
              defaultValue={search.status ?? ""}
              className="rounded-[6px] bg-[rgba(199,211,234,0.06)] px-3 py-2.5 text-[14px] text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] focus:outline-none"
            >
              <option value="">{t("common.all")}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-moon-mist">{t("requests.filterCoordinator")}</span>
            <select
              name="coordinator"
              defaultValue={search.coordinator ?? ""}
              className="rounded-[6px] bg-[rgba(199,211,234,0.06)] px-3 py-2.5 text-[14px] text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] focus:outline-none"
            >
              <option value="">{t("common.all")}</option>
              <option value="unassigned">{t("common.unassigned")}</option>
              {coordinators.map((coordinator) => (
                <option key={coordinator.id} value={coordinator.id}>
                  {coordinator.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-moon-mist">{t("requests.filterPriority")}</span>
            <select
              name="priority"
              defaultValue={search.priority ?? ""}
              className="rounded-[6px] bg-[rgba(199,211,234,0.06)] px-3 py-2.5 text-[14px] text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] focus:outline-none"
            >
              <option value="">{t("common.all")}</option>
              {(["URGENT", "HIGH", "NORMAL"] as const).map((priority) => (
                <option key={priority} value={priority}>
                  {t(`priority.${priority}`)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="rounded-[999px] bg-[rgba(186,214,247,0.06)] px-5 py-2.5 text-[14px] font-medium text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(186,214,247,0.12)]"
          >
            {t("common.filter")}
          </button>

          <Link
            href="/requests"
            className="rounded-[999px] px-4 py-2.5 text-[13px] text-fog-veil hover:text-frost-glow"
          >
            {t("common.clearAll")}
          </Link>
        </form>

        <div className="flex flex-wrap gap-2">
          {views.map((view) => (
            <Link
              key={view.label}
              href={view.key ? `/requests?view=${view.key}` : "/requests"}
              className={chip(search.view === view.key)}
            >
              {view.label}
            </Link>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("requests.count", { count: rows.length })}
          </h2>
          {rows.length === 200 ? <Badge tone="warn">200+</Badge> : null}
        </div>

        <RequestTable rows={rows} />
      </GlassCard>
    </div>
  );
}
