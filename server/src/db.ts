// The database connection and its migrations (plain SQL files in ../migrations, applied in
// name order, each once, inside a transaction).
import postgres from "postgres";
import { readdir, readFile } from "fs/promises";
import { fileURLToPath } from "url";

export type Sql = postgres.Sql;

const MIGRATIONS = fileURLToPath(new URL("../migrations/", import.meta.url));

export const connect = (url: string) => postgres(url, { max: 10, onnotice: () => {}, transform: { undefined: null } });

export async function migrate(sql: Sql) {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const files = (await readdir(MIGRATIONS)).filter(f => f.endsWith(".sql")).sort();
  for (const name of files) {
    await sql.begin(async tx => {
      // (one server at a time: a second one waits here, then finds the migration done)
      await tx`select pg_advisory_xact_lock(724001)`;
      const [done] = await tx`select 1 from schema_migrations where name = ${name}`;
      if (done) return;
      await tx.unsafe(await readFile(MIGRATIONS + name, "utf8"));
      await tx`insert into schema_migrations (name) values (${name})`;
    });
  }
}
