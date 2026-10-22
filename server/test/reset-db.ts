// Empties the database DATABASE_URL names (only one for tests: ending in _test or _e2e), so the
// server starts with no accounts. Run before the sign-in end-to-end tests.
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
if (!/\/[^/]*_(test|e2e)(\?|$)/.test(url)) throw new Error("DATABASE_URL must name a database ending in _test or _e2e");
const sql = postgres(url, { onnotice: () => {} });
await sql`drop schema if exists public cascade`;
await sql`create schema public`;
await sql.end();
