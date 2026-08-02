"use server";

import { redirect } from "next/navigation";

import { clearPreviewCookie, setPreviewCookie } from "@/lib/preview";
import { canPreview } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { tenantDb } from "@/lib/tenant";

/**
 * Starting and ending a preview.
 *
 * These deliberately read the real session rather than the request context: a
 * preview must never be able to start another preview from inside itself, and
 * ending one has to be possible no matter whose face is currently on.
 */

export async function enterPreviewAction(form: FormData): Promise<void> {
  const real = await getSession();
  if (!real) redirect("/login");

  const targetId = String(form.get("userId") ?? "").trim();
  if (!targetId) redirect("/roles");

  const db = tenantDb(real.organizationId, { readOnly: true });
  const target = await db.user.findFirst({
    where: { id: targetId, isActive: true },
    select: { id: true, role: true },
  });

  // Silent refusal: an unauthorised attempt leaves the viewer exactly where
  // they were, with no preview started and nothing to probe.
  if (!target || !canPreview(real.role, target.role)) {
    redirect("/roles");
  }

  await setPreviewCookie(target.id);
  redirect("/dashboard");
}

export async function leavePreviewAction(): Promise<void> {
  await clearPreviewCookie();
  redirect("/roles");
}
