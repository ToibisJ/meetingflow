import "server-only";

import { cookies } from "next/headers";

import { canPreview } from "./rbac";
import type { SessionUser } from "./session";
import { tenantDb } from "./tenant";
import type { Role } from "@/generated/prisma/enums";

/**
 * Looking at the product through another person's eyes.
 *
 * Three rules make this safe, and all three are checked here on every request
 * rather than once when the preview starts:
 *
 *   1. Only a level that holds `roles:preview` may do it at all.
 *   2. The target must be at or below the viewer's own level — you can look
 *      down, never up.
 *   3. The target must belong to the viewer's own organization.
 *
 * A preview is read-only. The database client is built with writes refused, so
 * nothing done while wearing someone else's face can be recorded as theirs.
 */

const COOKIE_NAME = "mf_preview";

export type Preview = {
  /** The person being looked at. */
  as: SessionUser;
  /** Who is really signed in. */
  realId: string;
  realName: string;
  realRole: Role;
};

export async function readPreviewCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function setPreviewCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Deliberately a session cookie: a preview should not outlive the browser.
  });
}

export async function clearPreviewCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Resolves the preview for the signed-in user, or null when there is none or
 * the viewer is not entitled to it. Never throws — an invalid cookie simply
 * means no preview.
 */
export async function resolvePreview(real: SessionUser): Promise<Preview | null> {
  const targetId = await readPreviewCookie();
  if (!targetId || targetId === real.id) return null;

  // Scoped to the viewer's own organization, so a stale cookie from another
  // tenant resolves to nothing at all.
  const db = tenantDb(real.organizationId, { readOnly: true });

  const target = await db.user.findFirst({
    where: { id: targetId, isActive: true },
    include: { organization: { select: { name: true, timezone: true, isActive: true } } },
  });

  if (!target || !target.organization.isActive) return null;
  if (!canPreview(real.role, target.role)) return null;

  return {
    as: {
      id: target.id,
      organizationId: target.organizationId,
      email: target.email,
      fullName: target.fullName,
      role: target.role,
      locale: target.locale,
      departmentId: target.departmentId,
      managerId: target.managerId,
      organizationName: target.organization.name,
      timezone: target.organization.timezone,
    },
    realId: real.id,
    realName: real.fullName,
    realRole: real.role,
  };
}
