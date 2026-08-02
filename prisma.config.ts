import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations must not go through a connection pooler — a pooled connection
    // cannot hold the advisory lock Prisma takes while migrating. Hosted
    // Postgres gives two strings for this reason; DIRECT_DATABASE_URL is the
    // unpooled one and wins here when it is set.
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
    // Migrations are verified against a throwaway database first. Naming it
    // explicitly keeps a failed attempt from poisoning the default one.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
