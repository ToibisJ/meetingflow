import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge, Eyebrow, EmptyState, GlassCard, cn } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { formatEventTime } from "@/lib/dates";
import { markAllReadAction } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, "late" | "warn" | "info" | "neutral"> = {
  SLA_BREACH: "late",
  REQUEST_DECLINED: "late",
  MEETING_CANCELLED: "late",
  SUMMARY_REQUIRED: "warn",
  INFO_REQUESTED: "warn",
  FOLLOW_UP_REQUIRED: "warn",
  MEETING_RESCHEDULED: "info",
  MEETING_SCHEDULED: "info",
  REQUEST_ASSIGNED: "neutral",
  TASK_ASSIGNED: "neutral",
};

export default async function NotificationsPage() {
  const ctx = await requireUser();
  const t = await getTranslations();

  const notifications = await ctx.db.notification.findMany({
    where: { userId: ctx.session.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Notifications point at a request; resolve the numbers so each row links.
  const requestIds = notifications
    .filter((n) => n.entityType === "MeetingRequest" && n.entityId)
    .map((n) => n.entityId!);

  const requests = requestIds.length
    ? await ctx.db.meetingRequest.findMany({
        where: { id: { in: requestIds } },
        select: { id: true, requestNumber: true },
      })
    : [];

  const numberById = new Map(requests.map((r) => [r.id, r.requestNumber]));
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Eyebrow>{t("nav.notifications")}</Eyebrow>
          <h1 className="text-[28px] font-medium text-ice-highlight">
            {t("notifications.title")}
          </h1>
        </div>

        {unread > 0 ? (
          <form action={markAllReadAction}>
            <button
              type="submit"
              className="rounded-[999px] bg-[rgba(186,214,247,0.06)] px-5 py-2.5 text-[13.5px] text-pure-white shadow-[inset_0_0_0_1px_rgba(186,215,247,0.12)] hover:bg-[rgba(186,214,247,0.12)]"
            >
              {t("notifications.markAllRead")} ({unread})
            </button>
          </form>
        ) : null}
      </header>

      <GlassCard className="flex flex-col">
        {notifications.length === 0 ? (
          <EmptyState title={t("notifications.empty")} />
        ) : (
          notifications.map((notification) => {
            const number = notification.entityId
              ? numberById.get(notification.entityId)
              : undefined;

            const body = (
              <div
                className={cn(
                  "flex flex-col gap-1 rounded-[8px] px-3 py-3 transition-colors",
                  !notification.isRead && "bg-[rgba(102,58,243,0.08)]",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[notification.type] ?? "neutral"}>
                    {t(`notifications.${notification.type}`)}
                  </Badge>
                  <span className="flex-1 text-[14px] text-frost-glow">
                    {notification.title}
                  </span>
                  <span className="text-[11.5px] tabular-nums text-fog-veil">
                    {formatEventTime(notification.createdAt)}
                  </span>
                </div>
                {notification.body ? (
                  <p className="text-[13px] text-fog-veil">{notification.body}</p>
                ) : null}
              </div>
            );

            return (
              <div
                key={notification.id}
                className="border-b border-[rgba(186,215,247,0.08)] last:border-b-0"
              >
                {number ? (
                  <Link href={`/requests/${number}`} className="block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </div>
            );
          })
        )}
      </GlassCard>
    </div>
  );
}
