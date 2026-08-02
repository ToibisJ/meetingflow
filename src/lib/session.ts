import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";

import { db } from "./db";
import type { Role, Locale } from "@/generated/prisma/enums";

/**
 * Authentication and session management.
 *
 * Passwords: bcrypt, cost 12. Never stored or logged in the clear.
 * Sessions: 32 random bytes handed to the browser in an httpOnly cookie; only
 * the SHA-256 hash is stored, so a database dump cannot be replayed as a login.
 */

const COOKIE_NAME = "mf_session";
const SESSION_TTL_DAYS = 7;
const BCRYPT_COST = 12;

export type SessionUser = {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: Role;
  locale: Locale;
  departmentId: string | null;
  managerId: string | null;
  organizationName: string;
  timezone: string;
};

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare, used where a plain equality check would leak timing. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function requestMeta() {
  const headerList = await headers();
  return {
    ip:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      null,
    userAgent: headerList.get("user-agent") ?? null,
  };
}

/** Creates a session row and sets the cookie. Returns nothing to the caller. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const meta = await requestMeta();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Returns the signed-in user, or null. Expired rows are cleaned up on read. */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const row = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { organization: true } },
    },
  });

  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }

  const { user } = row;
  if (!user.isActive || !user.organization.isActive) return null;

  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    locale: user.locale,
    departmentId: user.departmentId,
    managerId: user.managerId,
    organizationName: user.organization.name,
    timezone: user.organization.timezone,
  };
}

/** Same as getSession, but throws when there is no session. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new UnauthenticatedError();
  }
  return session;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    await db.session
      .delete({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }

  cookieStore.delete(COOKIE_NAME);
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthenticatedError";
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
