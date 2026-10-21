// A fresh database and server for each test, and a client that keeps its cookies.
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { connect, migrate, type Sql } from "../src/db.js";
import { stepAt, totp } from "../src/crypto.js";

const url = process.env.TEST_DATABASE_URL ?? "postgres://hyzerlab:hyzerlab@127.0.0.1:5432/hyzerlab_test";
// (it empties the database: never one that isn't for tests)
if (!/\/[^/]*_test(\?|$)/.test(url)) throw new Error("TEST_DATABASE_URL must name a database ending in _test");

export const ORIGIN = "https://app.example.com";
export const SETUP_CODE = "ABCDEFGHIJKLMNOP";

export const cfg: Config = {
  host: "127.0.0.1", port: 0, databaseUrl: url, appSecret: Buffer.alloc(32, 7), origins: [ORIGIN],
  forceSecureCookies: false, trustProxy: false, staticDir: null
};

export interface World { app: FastifyInstance; sql: Sql; close: () => Promise<void> }

export async function world(opts: { authLimit?: number } = {}): Promise<World> {
  const sql = connect(url);
  await sql`drop schema if exists public cascade`;
  await sql`create schema public`;
  await migrate(sql);
  let code: string | null = SETUP_CODE;
  const app = await buildApp({ sql, cfg, setup: { code: () => code, done: () => { code = null; } }, authLimit: opts.authLimit ?? 1000 });
  return { app, sql, close: async () => { await app.close(); await sql.end(); } };
}

export function base32Decode(s: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A code from the authenticator app, `ahead` steps from now (each code works once). */
export const codeFor = (secret: string, ahead = 0) => totp(base32Decode(secret), stepAt(Date.now()) + ahead);

export class Client {
  cookies = new Map<string, string>();
  constructor(private app: FastifyInstance) {}

  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method: method as "GET",
      url,
      payload: body === undefined ? undefined : (body as object),
      headers: {
        ...(method === "GET" ? {} : { "x-hyzerlab": "1", origin: ORIGIN, "sec-fetch-site": "same-origin" }),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...headers
      }
    });
    for (const c of res.cookies) {
      if (!c.value || (c.expires && c.expires.getTime() < Date.now())) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return { status: res.statusCode, body: res.body ? res.json() : null };
  }
  get = (url: string) => this.req("GET", url);
  post = (url: string, body: unknown = {}) => this.req("POST", url, body);
  del = (url: string) => this.req("DELETE", url);
}

/** Through setup to signed in as the admin; returns the client and the 2FA secret. */
export async function adminSignedIn(w: World) {
  const c = new Client(w.app);
  await c.post("/api/setup", { code: SETUP_CODE, username: "admin", displayName: "Admin", password: "correct horse battery" });
  const { body: e } = await c.post("/api/mfa/enroll");
  const { body } = await c.post("/api/mfa/enroll/confirm", { code: codeFor(e.secret) });
  return { c, secret: e.secret as string, backupCodes: body.backupCodes as string[] };
}

/** Invites someone and signs them in with 2FA set up. */
export async function memberSignedIn(w: World, admin: Client, username = "pat") {
  const { body: inv } = await admin.post("/api/admin/invites", {});
  const c = new Client(w.app);
  await c.post(`/api/invites/${inv.token}/accept`, { username, displayName: "Pat", password: "another long passphrase" });
  const { body: e } = await c.post("/api/mfa/enroll");
  await c.post("/api/mfa/enroll/confirm", { code: codeFor(e.secret) });
  return { c, secret: e.secret as string };
}
