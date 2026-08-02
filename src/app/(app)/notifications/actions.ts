"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/current-user";

export async function markAllReadAction(): Promise<void> {
  const ctx = await requireUser();

  await ctx.db.notification.updateMany({
    where: { userId: ctx.session.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  revalidatePath("/notifications");
}
