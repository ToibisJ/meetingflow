import "server-only";

import { db } from "./db";
import { createSession, hashPassword, verifyPassword } from "./session";
import { writeAudit } from "./audit";
import { tenantDb } from "./tenant";

/**
 * Sign-in.
 *
 * This is the one place that reads users without a tenant filter — it has to,
 * because the organization is not known until the user is found. Everything it
 * returns is then used to build a tenant-scoped client for the rest of the
 * request.
 */

export type SignInFailure =
  | "invalid_credentials"
  | "account_disabled"
  | "organization_disabled";

export type SignInResult =
  | { ok: true; locale: "he" | "en" }
  | { ok: false; reason: SignInFailure };

/**
 * A bcrypt hash of a value nobody uses, compared against when the email does
 * not exist. Without it, a missing user returns noticeably faster than a wrong
 * password, which tells an attacker which addresses are real.
 */
let decoyHash: string | null = null;

async function decoy(): Promise<string> {
  if (!decoyHash) {
    decoyHash = await hashPassword("no-such-account-placeholder");
  }
  return decoyHash;
}

export async function signIn(
  email: string,
  password: string,
): Promise<SignInResult> {
  const normalized = email.trim().toLowerCase();

  const user = await db.user.findFirst({
    where: { email: normalized },
    include: { organization: true },
  });

  if (!user) {
    await verifyPassword(password, await decoy());
    return { ok: false, reason: "invalid_credentials" };
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    return { ok: false, reason: "invalid_credentials" };
  }

  if (!user.isActive) {
    return { ok: false, reason: "account_disabled" };
  }

  if (!user.organization.isActive) {
    return { ok: false, reason: "organization_disabled" };
  }

  await createSession(user.id);

  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAudit(tenantDb(user.organizationId), {
    organizationId: user.organizationId,
    actor: { userId: user.id, userName: user.fullName },
    entity: "User",
    entityId: user.id,
    action: "sign_in",
  });

  return { ok: true, locale: user.locale };
}
