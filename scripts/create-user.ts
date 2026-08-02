import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";

/**
 * Creates or updates one user.
 *
 * The login identifier is stored in the `email` column and may be a plain
 * username — the sign-in screen accepts either. The password is hashed here and
 * never stored in the clear.
 *
 *   npx tsx scripts/create-user.ts <login> <password> <full name> [role] [org slug]
 */

const [login, password, fullName, roleArg, slugArg] = process.argv.slice(2);

if (!login || !password || !fullName) {
  console.error(
    "Usage: npx tsx scripts/create-user.ts <login> <password> <full name> [ADMIN|MANAGER|COORDINATOR|EMPLOYEE] [org-slug]",
  );
  process.exit(1);
}

const role = (roleArg ?? "ADMIN") as Role;
const slug = slugArg ?? "automatixy";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const org = await db.organization.findUniqueOrThrow({ where: { slug } });
  const passwordHash = await bcrypt.hash(password, 12);
  const identifier = login.trim().toLowerCase();

  const user = await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: identifier } },
    create: {
      organizationId: org.id,
      email: identifier,
      passwordHash,
      fullName,
      role,
      isActive: true,
    },
    update: { passwordHash, fullName, role, isActive: true },
  });

  console.log(`user ready: ${user.email}  (${user.role})  in ${org.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
