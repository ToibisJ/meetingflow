import "server-only";

import { redirect } from "next/navigation";

import { db } from "./db";
import { getSession, type SessionUser } from "./session";
import { tenantDb, type TenantDb } from "./tenant";

/**
 * Everything a signed-in screen needs, resolved once per request.
 *
 * Screens never build a database client themselves — they take the scoped one
 * from here, which is why no screen can accidentally read outside its tenant.
 */

export type RequestContext = {
  session: SessionUser;
  db: TenantDb;
  plan: string;
};

export async function requireUser(): Promise<RequestContext> {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const organization = await db.organization.findUnique({
    where: { id: session.organizationId },
    select: { plan: true },
  });

  return {
    session,
    db: tenantDb(session.organizationId),
    plan: organization?.plan ?? "standard",
  };
}
