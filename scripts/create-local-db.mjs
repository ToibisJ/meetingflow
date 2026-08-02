/**
 * Creates the project database on the local Prisma dev Postgres server.
 *
 * Only used for local development. Production points DATABASE_URL at whichever
 * managed PostgreSQL the customer runs; nothing here is needed there.
 *
 *   node scripts/create-local-db.mjs postgres://.../postgres
 */
import { Client } from "pg";

const adminUrl = process.argv[2];
const dbName = process.argv[3] ?? "meetingflow";
/**
 * The local dev server's `template1` picks up whatever the first migration
 * created, so anything cloned from it starts non-empty. Pass `template0` when
 * the new database must be genuinely pristine — Prisma's shadow database is
 * rejected unless it is.
 */
const template = process.argv[4] ?? null;

if (!adminUrl) {
  console.error(
    "Usage: node scripts/create-local-db.mjs <admin url> [db name] [template]",
  );
  process.exit(1);
}

const admin = new Client({ connectionString: adminUrl });
await admin.connect();

const existing = await admin.query("select 1 from pg_database where datname = $1", [
  dbName,
]);

if (existing.rowCount === 0) {
  await admin.query(
    template
      ? `create database "${dbName}" template "${template}"`
      : `create database "${dbName}"`,
  );
  console.log(`created database ${dbName}${template ? ` from ${template}` : ""}`);
} else {
  console.log(`database ${dbName} already exists`);
}

const version = await admin.query("select version()");
console.log(version.rows[0].version);

await admin.end();
