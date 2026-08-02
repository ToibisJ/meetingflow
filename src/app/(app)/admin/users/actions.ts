"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/current-user";
import { can } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

export async function toggleUserAction(form: FormData): Promise<void> {
  const ctx = await requireUser();
  if (!can(ctx.session.role, "users:manage")) return;

  const userId = String(form.get("userId") ?? "");

  // Locking yourself out is never the intent; the button is disabled in the UI
  // and refused here as well.
  if (!userId || userId === ctx.session.id) return;

  const user = await ctx.db.user.findUnique({
    where: { id: userId },
    select: { isActive: true, fullName: true },
  });

  if (!user) return;

  await ctx.db.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  });

  // Disabling an account must also end its live sessions, not just block sign-in.
  if (user.isActive) {
    await ctx.db.session.deleteMany({ where: { userId } });
  }

  await writeAudit(ctx.db, {
    organizationId: ctx.session.organizationId,
    actor: { userId: ctx.session.id, userName: ctx.session.fullName },
    entity: "User",
    entityId: userId,
    action: user.isActive ? "disable" : "enable",
    before: { isActive: user.isActive },
    after: { isActive: !user.isActive },
  });

  revalidatePath("/admin/users");
}
