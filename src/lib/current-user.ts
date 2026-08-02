import "server-only";

import { redirect } from "next/navigation";

import { db } from "./db";
import { resolvePreview, type Preview } from "./preview";
import { getSession, type SessionUser } from "./session";
import { tenantDb, type TenantDb } from "./tenant";

/**
 * Everything a signed-in screen needs, resolved once per request.
 *
 * Screens never build a database client themselves — they take the scoped one
 * from here, which is why no screen can accidentally read outside its tenant.
 *
 * When a preview is running, `session` is the person being looked at and the
 * client refuses writes. `preview` is how a screen knows to say so.
 */

export type RequestContext = {
  session: SessionUser;
  db: TenantDb;
  plan: string;
  preview: Preview | null;
};

export async function requireUser(): Promise<RequestContext> {
  const real = await getSession();

  if (!real) {
    redirect("/login");
  }

  const preview = await resolvePreview(real);
  const session = preview ? preview.as : real;

  const organization = await db.organization.findUnique({
    where: { id: session.organizationId },
    select: { plan: true },
  });

  return {
    session,
    db: tenantDb(session.organizationId, { readOnly: preview !== null }),
    plan: organization?.plan ?? "standard",
    preview,
  };
}
