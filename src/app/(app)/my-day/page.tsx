import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge, Eyebrow, GlassCard } from "@/components/ui/primitives";
import { MeetingLink } from "@/components/meeting-link";
import { requireUser } from "@/lib/current-user";
import { formatMeetingSlot, formatDay } from "@/lib/dates";
import { BOOKED_STATUSES } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/**
 * One screen answering "what is on me today".
 *
 * Everything here is scoped to the signed-in person: their meetings, the
 * requests waiting on them, the summaries they owe, the tasks they hold.
 */
export default async function MyDayPage() {
  const ctx = await requireUser();
  const t = await getTranslations();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const inAWeek = new Date(Date.now() + 7 * 86_400_000);

  const mine = {
    OR: [
      { requesterUserId: ctx.session.id },
      { assignedCoordinatorId: ctx.session.id },
      { participants: { some: { userId: ctx.session.id } } },
    ],
  };

  const [today, upcoming, waitingOnMe, needSummary, tasks] = await Promise.all([
    ctx.db.meetingRequest.findMany({
      where: {
        AND: [
          mine,
          {
            status: { in: BOOKED_STATUSES },
            scheduledAt: { gte: startOfDay, lte: endOfDay },
          },
        ],
      },
      select: {
        requestNumber: true,
        subject: true,
        type: true,
        scheduledAt: true,
        contact: { select: { fullName: true, company: true, phone: true } },
        meetings: {
          select: { meetingUrl: true, dialNumber: true },
          orderBy: { scheduledStart: "desc" },
          take: 1,
        },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    ctx.db.meetingRequest.findMany({
      where: {
        AND: [
          mine,
          {
            status: { in: BOOKED_STATUSES },
            scheduledAt: { gt: endOfDay, lte: inAWeek },
          },
        ],
      },
      select: {
        requestNumber: true,
        subject: true,
        scheduledAt: true,
        contact: { select: { fullName: true, company: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    ctx.db.meetingRequest.findMany({
      where: {
        AND: [
          { requesterUserId: ctx.session.id },
          { status: "WAITING_FOR_EMPLOYEE" },
        ],
      },
      select: {
        requestNumber: true,
        subject: true,
        contact: { select: { fullName: true } },
        activities: {
          where: { type: "INFO_REQUESTED" },
          select: { body: true },
          orderBy: { occurredAt: "desc" },
          take: 1,
        },
      },
    }),

    ctx.db.meetingRequest.findMany({
      where: { AND: [mine, { status: "SUMMARY_REQUIRED" }] },
      select: {
        requestNumber: true,
        subject: true,
        scheduledAt: true,
        contact: { select: { fullName: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    ctx.db.followUpTask.findMany({
      where: { assigneeUserId: ctx.session.id, status: "OPEN" },
      select: {
        id: true,
        description: true,
        dueDate: true,
        request: { select: { requestNumber: true, subject: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const empty = (
    <p className="text-[14px] text-fog-veil">{t("myDay.empty")}</p>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("nav.myDay")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">
          {t("dashboard.greeting", { name: ctx.session.fullName })}
        </h1>
        <p className="text-[14px] text-fog-veil">{formatDay(new Date())}</p>
      </header>

      <GlassCard className="flex flex-col gap-4">
        <h2 className="text-[17px] font-medium text-ice-highlight">
          {t("myDay.meetingsToday")}
        </h2>
        {today.length === 0
          ? empty
          : today.map((row) => (
              <Link
                key={row.requestNumber}
                href={`/requests/${row.requestNumber}`}
                className="flex flex-wrap items-center gap-3 rounded-[8px] px-3 py-3 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
              >
                <span className="text-[16px] tabular-nums text-frost-glow">
                  {row.scheduledAt?.toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <Badge>{t(`meetingType.${row.type}`)}</Badge>
                <span className="flex-1 text-[14px] text-moon-mist">
                  {row.contact.fullName}
                  {row.contact.company ? ` · ${row.contact.company}` : ""}
                </span>
                <span className="text-[13px] text-fog-veil">{row.subject}</span>
                {/* Today's calls are joined from here, not from inside the request. */}
                <MeetingLink
                  url={row.meetings[0]?.meetingUrl}
                  dialNumber={row.meetings[0]?.dialNumber}
                  compact
                />
              </Link>
            ))}
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("myDay.waitingOnMe")}
          </h2>
          {waitingOnMe.length === 0
            ? empty
            : waitingOnMe.map((row) => (
                <Link
                  key={row.requestNumber}
                  href={`/requests/${row.requestNumber}`}
                  className="flex flex-col gap-1 rounded-[8px] px-3 py-2.5 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
                >
                  <span className="text-[14px] text-frost-glow">{row.subject}</span>
                  <span className="text-[12.5px] text-fog-veil">
                    {row.activities[0]?.body ?? row.contact.fullName}
                  </span>
                </Link>
              ))}
        </GlassCard>

        <GlassCard className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("myDay.needSummary")}
          </h2>
          {needSummary.length === 0
            ? empty
            : needSummary.map((row) => (
                <Link
                  key={row.requestNumber}
                  href={`/requests/${row.requestNumber}`}
                  className="flex flex-col gap-1 rounded-[8px] px-3 py-2.5 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
                >
                  <span className="text-[14px] text-frost-glow">{row.subject}</span>
                  <span className="text-[12.5px] text-fog-veil">
                    {row.contact.fullName}
                    {row.scheduledAt ? ` · ${formatMeetingSlot(row.scheduledAt)}` : ""}
                  </span>
                </Link>
              ))}
        </GlassCard>

        <GlassCard className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("myDay.upcoming")}
          </h2>
          {upcoming.length === 0
            ? empty
            : upcoming.map((row) => (
                <Link
                  key={row.requestNumber}
                  href={`/requests/${row.requestNumber}`}
                  className="flex flex-col gap-1 rounded-[8px] px-3 py-2.5 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
                >
                  <span className="text-[14px] text-frost-glow">
                    {row.scheduledAt ? formatMeetingSlot(row.scheduledAt) : ""}
                  </span>
                  <span className="text-[12.5px] text-fog-veil">
                    {row.contact.fullName} · {row.subject}
                  </span>
                </Link>
              ))}
        </GlassCard>

        <GlassCard className="flex flex-col gap-3">
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("myDay.followUps")}
          </h2>
          {tasks.length === 0
            ? empty
            : tasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/requests/${task.request.requestNumber}`}
                  className="flex flex-col gap-1 rounded-[8px] px-3 py-2.5 transition-colors hover:bg-[rgba(186,214,247,0.06)]"
                >
                  <span className="text-[14px] text-frost-glow">{task.description}</span>
                  <span className="text-[12.5px] text-fog-veil">
                    {task.dueDate ? formatDay(task.dueDate) : task.request.subject}
                  </span>
                </Link>
              ))}
        </GlassCard>
      </div>
    </div>
  );
}
