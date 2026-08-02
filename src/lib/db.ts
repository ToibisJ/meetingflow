import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Raw Prisma client — NOT tenant-scoped.
 *
 * Only three callers are allowed to use it directly:
 *   1. authentication (looks users up by email before a tenant is known)
 *   2. the seed script
 *   3. background jobs that legitimately sweep every organization
 *
 * Everything else must go through the tenant-scoped client in src/lib/tenant.ts,
 * which injects organizationId into every query.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
  );
}

function createClient() {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
