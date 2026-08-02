import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // Migrations are verified against a throwaway database first. Naming it
    // explicitly keeps a failed attempt from poisoning the default one.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
