// Starts the server: settings, database, migrations, then the first-run setup code while there
// is no account yet.
import { randomBytes } from "crypto";
import { loadConfig } from "./config.js";
import { connect, migrate } from "./db.js";
import { buildApp } from "./app.js";
import { base32 } from "./crypto.js";

const cfg = loadConfig();
const sql = connect(cfg.databaseUrl);
await migrate(sql);

let setupCode: string | null = null;
const [{ n }] = await sql`select count(*)::int as n from users`;
if (n === 0) {
  // (SETUP_CODE: a code chosen ahead, for automated tests; 16 characters or more)
  const given = process.env.SETUP_CODE?.trim().toUpperCase();
  if (given && given.length < 16) throw new Error("SETUP_CODE must be 16 characters or more");
  setupCode = given || base32(randomBytes(10));
  console.log(`\n  No accounts yet. Open the app and create the admin with this setup code:\n\n      ${setupCode}\n`);
}

const app = await buildApp({ sql, cfg, setup: { code: () => setupCode, done: () => { setupCode = null; } } }, { logger: true });
await app.listen({ host: cfg.host, port: cfg.port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}
