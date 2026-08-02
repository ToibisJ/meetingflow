import { getTranslations } from "next-intl/server";

import { Eyebrow, GlassCard } from "@/components/ui/primitives";
import { REQUEST_ROW_SELECT, RequestTable } from "@/components/requests/request-table";
import { requireUser } from "@/lib/current-user";
import { TERMINAL_STATUSES } from "@/lib/workflow";

export const dynamic = "force-dynamic";

/**
 * A person's own meetings — the ones they opened and the ones they attend.
 * Deliberately not the coordination desk view: no filters, no other people's
 * work, just "what did I ask for and where is it".
 */
export default async function MyRequestsPage() {
  const ctx = await requireUser();
  const t = await getTranslations();

  const mine = {
    OR: [
      { requesterUserId: ctx.session.id },
      { participants: { some: { userId: ctx.session.id } } },
    ],
  };

  const [open, closed] = await Promise.all([
    ctx.db.meetingRequest.findMany({
      where: { AND: [mine, { status: { notIn: TERMINAL_STATUSES } }] },
      select: REQUEST_ROW_SELECT,
      orderBy: { lastActivityAt: "desc" },
    }),
    ctx.db.meetingRequest.findMany({
      where: { AND: [mine, { status: { in: TERMINAL_STATUSES } }] },
      select: REQUEST_ROW_SELECT,
      orderBy: { closedAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("nav.myRequests")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">
          {t("requests.myTitle")}
        </h1>
      </header>

      <GlassCard className="flex flex-col gap-4">
        <h2 className="text-[17px] font-medium text-ice-highlight">
          {t("requests.count", { count: open.length })}
        </h2>
        <RequestTable rows={open} showRequester={false} />
      </GlassCard>

      {closed.length > 0 ? (
        <GlassCard className="flex flex-col gap-4">
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("status.COMPLETED")}
          </h2>
          <RequestTable rows={closed} showRequester={false} />
        </GlassCard>
      ) : null}
    </div>
  );
}
