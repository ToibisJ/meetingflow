/**
 * Creates and applies a migration against the local development database.
 *
 * Why this exists instead of `prisma migrate dev`: the local Prisma dev server
 * backs every database name with the same storage, so Prisma cannot get the
 * empty shadow database it needs to verify a migration. This does the same job
 * without one — diff the live database against the schema, write the SQL as a
 * normal migration file, apply it, and record it as applied.
 *
 * The migration files it produces are ordinary Prisma migrations. On a hosted
 * PostgreSQL, `prisma migrate deploy` applies them unchanged, and
 * `prisma migrate dev` works normally there.
 *
 *   node scripts/migrate-local.mjs <migration name>
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];

if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error(
    "Usage: node scripts/migrate-local.mjs <migration_name>  (lowercase, digits and underscores)",
  );
  process.exit(1);
}

const stamp = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14);

const folder = join("prisma", "migrations", `${stamp}_${name}`);
const file = join(folder, "migration.sql");

const run = (args) =>
  execFileSync("npx", ["prisma", ...args], {
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
    shell: true,
  });

mkdirSync(folder, { recursive: true });

run([
  "migrate",
  "diff",
  "--from-config-datasource",
  "--to-schema",
  "prisma/schema.prisma",
  "--script",
  "-o",
  file,
]);

const sql = readFileSync(file, "utf8").trim();

if (!sql) {
  rmSync(folder, { recursive: true, force: true });
  console.log("No schema changes — nothing to migrate.");
  process.exit(0);
}

console.log(`\n${folder}\n`);
console.log(sql);
console.log("");

run(["db", "execute", "--file", file]);
run(["migrate", "resolve", "--applied", `${stamp}_${name}`]);
run(["generate"]);

console.log(`\nApplied ${stamp}_${name}.`);
