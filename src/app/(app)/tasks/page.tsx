import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge, Eyebrow, EmptyState, GlassCard } from "@/components/ui/primitives";
import { requireUser } from "@/lib/current-user";
import { formatDay } from "@/lib/dates";
import { completeTaskAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const ctx = await requireUser();
  const t = await getTranslations();

  const [open, done] = await Promise.all([
    ctx.db.followUpTask.findMany({
      where: { assigneeUserId: ctx.session.id, status: "OPEN" },
      select: {
        id: true,
        description: true,
        dueDate: true,
        request: {
          select: {
            requestNumber: true,
            subject: true,
            contact: { select: { fullName: true, company: true } },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    ctx.db.followUpTask.findMany({
      where: { assigneeUserId: ctx.session.id, status: "DONE" },
      select: {
        id: true,
        description: true,
        completedAt: true,
        request: { select: { requestNumber: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
  ]);

  const overdue = (due: Date | null) => due !== null && due.getTime() < Date.now();

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>{t("nav.tasks")}</Eyebrow>
        <h1 className="text-[28px] font-medium text-ice-highlight">{t("summary.tasks")}</h1>
      </header>

      <GlassCard className="flex flex-col gap-2">
        <h2 className="text-[17px] font-medium text-ice-highlight">
          {t("myDay.followUps")}
        </h2>

        {open.length === 0 ? (
          <EmptyState title={t("myDay.empty")} />
        ) : (
          open.map((task) => (
            <div
              key={task.id}
              className="flex flex-wrap items-center gap-3 border-b border-[rgba(186,215,247,0.08)] py-3 last:border-b-0"
            >
              <form action={completeTaskAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  type="submit"
                  aria-label={t("common.confirm")}
                  className="h-5 w-5 rounded-[4px] shadow-[inset_0_0_0_1px_rgba(186,215,247,0.24)] transition-colors hover:bg-[rgba(38,150,132,0.2)]"
                />
              </form>

              <div className="min-w-0 flex-1">
                <p className="text-[14px] text-frost-glow">{task.description}</p>
                <Link
                  href={`/requests/${task.request.requestNumber}`}
                  className="text-[12.5px] text-fog-veil hover:text-moon-mist"
                >
                  #{task.request.requestNumber} · {task.request.contact.fullName}
                  {task.request.contact.company ? ` · ${task.request.contact.company}` : ""}
                </Link>
              </div>

              {task.dueDate ? (
                <Badge tone={overdue(task.dueDate) ? "late" : "neutral"}>
                  {formatDay(task.dueDate)}
                </Badge>
              ) : null}
            </div>
          ))
        )}
      </GlassCard>

      {done.length > 0 ? (
        <GlassCard className="flex flex-col gap-2">
          <h2 className="text-[17px] font-medium text-ice-highlight">
            {t("status.COMPLETED")}
          </h2>
          {done.map((task) => (
            <Link
              key={task.id}
              href={`/requests/${task.request.requestNumber}`}
              className="flex items-center gap-3 py-2 text-[13.5px] text-fog-veil hover:text-moon-mist"
            >
              <span className="line-through">{task.description}</span>
            </Link>
          ))}
        </GlassCard>
      ) : null}
    </div>
  );
}
