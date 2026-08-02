"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/current-user";
import { writeAudit } from "@/lib/audit";

export async function completeTaskAction(form: FormData): Promise<void> {
  const ctx = await requireUser();
  const taskId = String(form.get("taskId") ?? "");

  // Scoped to the signed-in assignee, so one person cannot close another's task.
  const updated = await ctx.db.followUpTask.updateMany({
    where: { id: taskId, assigneeUserId: ctx.session.id, status: "OPEN" },
    data: { status: "DONE", completedAt: new Date() },
  });

  if (updated.count > 0) {
    await writeAudit(ctx.db, {
      organizationId: ctx.session.organizationId,
      actor: { userId: ctx.session.id, userName: ctx.session.fullName },
      entity: "FollowUpTask",
      entityId: taskId,
      action: "complete",
      before: { status: "OPEN" },
      after: { status: "DONE" },
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/my-day");
}
