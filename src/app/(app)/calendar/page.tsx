import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge, Eyebrow, EmptyState, GlassCard, cn } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { requestVisibility } from "@/services/requests/visibility";
import { BOOKED_STATUSES } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/**
 * Two weeks of booked meetings, grouped by day.
 *
 * This is the system's own calendar. Once a Google or Outlook account is
 * connected it will also show that calendar's busy blocks; until then it shows
 * only what MeetingFlow itself booked, and says so.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const ctx = await requireUser();
  const t = await getTranslations();

  const start = from ? new Date(from) : new Date();
  if (Number.isNaN(start.getTime())) start.setTime(Date.now());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start.getTime() + 14 * 86_400_000);

  const visible = await requestVisibility(ctx.db, ctx.session);

  const rows = await ctx.db.meetingRequest.findMany({
    where: {
      AND: [
        visible,
        {
          status: { in: BOOKED_STATUSES },
          scheduledAt: { gte: start, lt: end },
        },
      ],
    },
    select: {
      requestNumber: true,
      subject: true,
      type: true,
      scheduledAt: true,
      slaState: true,
      contact: { select: { fullName: true, company: true } },
      coordinator: { select: { fullName: true } },
      meetings: {
        select: { location: true, meetingUrl: true, scheduledEnd: true },
        orderBy: { scheduledStart: "desc" },
        take: 1,
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // Group into days so the page reads as a calendar rather than a list.
  const days: { date: Date; items: typeof rows }[] = [];

  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(start.getTime() + offset * 86_400_000);
    const next = new Date(date.getTime() + 86_400_000);
    days.push({
      date,
      items: rows.filter(
        (row) => row.scheduledAt && row.scheduledAt >= date && row.scheduledAt < next,
      ),
    });
  }

  const isToday = (date: Date) => {
    const now = new Date();
    return (
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  };

  const previous = new Date(start.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const following = end.toISOString().slice(0, 10);

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Eyebrow>{t("nav.calendar")}</Eyebrow>
          <h1 className="text-[28px] font-medium text-ice-highlight">
            {start.toLocaleDateString("he-IL", { day: "numeric", month: "long" })} —{" "}
            {new Date(end.getTime() - 86_400_000).toLocaleDateString("he-IL", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h1>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/calendar?from=${previous}`}
            className="rounded-[999px] bg-[rgba(186,214,247,0.06)] px-4 py-2 text-[13px] text-moon-mist shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:text-frost-glow"
          >
            {t("common.back")}
          </Link>
          <Link
            href={`/calendar?from=${following}`}
            className="rounded-[999px] bg-[rgba(186,214,247,0.06)] px-4 py-2 text-[13px] text-moon-mist shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:text-frost-glow"
          >
            {t("common.next")}
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <GlassCard>
          <EmptyState title={t("myDay.empty")} hint={t("calendarSourceNote")} />
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {days
            .filter((day) => day.items.length > 0 || isToday(day.date))
            .map((day) => (
              <GlassCard
                key={day.date.toISOString()}
                className={cn(
                  "flex flex-col gap-3",
                  isToday(day.date) && "shadow-[inset_0_0_0_1px_rgba(102,58,243,0.35)]",
                )}
              >
                <div className="flex items-baseline gap-3">
                  <h2 className="text-[16px] font-medium text-ice-highlight">
                    {day.date.toLocaleDateString("he-IL", { weekday: "long" })}
                  </h2>
                  <span className="text-[13px] text-fog-veil">
                    {day.date.toLocaleDateString("he-IL", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  {isToday(day.date) ? <Badge tone="info">{t("common.today")}</Badge> : null}
                </div>

                {day.items.length === 0 ? (
                  <p className="text-[13px] text-fog-veil">{t("myDay.empty")}</p>
                ) : (
                  day.items.map((row) => (
                    <Link
                      key={row.requestNumber}
                      href={`/requests/${row.requestNumber}`}
                      className="flex flex-wrap items-center gap-3 rounded-[8px] px-3 py-2.5 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
                    >
                      <span className="w-[52px] text-[15px] tabular-nums text-frost-glow">
                        {row.scheduledAt?.toLocaleTimeString("he-IL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <Badge>{t(`meetingType.${row.type}`)}</Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-moon-mist">
                          {row.contact.fullName}
                          {row.contact.company ? ` · ${row.contact.company}` : ""}
                        </span>
                        <span className="block truncate text-[12.5px] text-fog-veil">
                          {row.subject}
                        </span>
                      </span>
                      {row.coordinator ? (
                        <span className="text-[12.5px] text-fog-veil">
                          {row.coordinator.fullName}
                        </span>
                      ) : null}
                    </Link>
                  ))
                )}
              </GlassCard>
            ))}
        </div>
      )}

      <p className="text-[12.5px] text-fog-veil">{t("calendarSourceNote")}</p>
    </div>
  );
}
