// Sessions: a random token in an HttpOnly cookie, its hash in the database.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Sql } from "./db.js";
import type { Config } from "./config.js";
import { newToken, sha256 } from "./crypto.js";

export type Stage = "mfa" | "mfa-setup" | "full";

export interface Auth {
  sessionId: string;
  stage: Stage;
  mfaAttempts: number;
  user: { id: string; username: string; displayName: string; isAdmin: boolean; totpEnabled: boolean; mfaRequired: boolean };
}

/** A session between the password and the code (or 2FA setup) lasts this long. */
const PENDING_MS = 15 * 60_000;
/** Signed in: ends after this long unused, and after MAX_MS whatever happens. */
const IDLE_MS = 3 * 24 * 3600_000;
const MAX_MS = 30 * 24 * 3600_000;

const SECURE_NAME = "__Host-hyzerlab";
const PLAIN_NAME = "hyzerlab";

const secure = (cfg: Config, req: FastifyRequest) => cfg.forceSecureCookies || req.protocol === "https";

const tokenOf = (req: FastifyRequest) => req.cookies[SECURE_NAME] ?? req.cookies[PLAIN_NAME];

export async function loadAuth(sql: Sql, req: FastifyRequest): Promise<Auth | null> {
  const token = tokenOf(req);
  if (!token) return null;
  const [row] = await sql`
    select s.id, s.stage, s.mfa_attempts, s.last_seen_at, s.created_at,
      u.id as user_id, u.username, u.display_name, u.is_admin, u.totp_enabled, u.mfa_required
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now() and not u.disabled`;
  if (!row) return null;
  if (row.stage === "full" && Date.now() - row.last_seen_at.getTime() > 60_000) {
    const expires = new Date(Math.min(row.created_at.getTime() + MAX_MS, Date.now() + IDLE_MS));
    await sql`update sessions set last_seen_at = now(), expires_at = ${expires} where id = ${row.id}`;
  }
  return {
    sessionId: row.id,
    stage: row.stage,
    mfaAttempts: row.mfa_attempts,
    user: { id: row.user_id, username: row.username, displayName: row.display_name, isAdmin: row.is_admin, totpEnabled: row.totp_enabled, mfaRequired: row.mfa_required }
  };
}

/** A new session (and cookie) for the user; any session this request had ends. */
export async function startSession(sql: Sql, cfg: Config, req: FastifyRequest, reply: FastifyReply, userId: string, stage: Stage) {
  const old = tokenOf(req);
  if (old) await sql`delete from sessions where token_hash = ${sha256(old)}`;
  const token = newToken();
  const now = Date.now();
  const expires = new Date(stage === "full" ? Math.min(now + IDLE_MS, now + MAX_MS) : now + PENDING_MS);
  await sql`
    insert into sessions (token_hash, user_id, stage, expires_at, ip, user_agent)
    values (${sha256(token)}, ${userId}, ${stage}, ${expires}, ${req.ip}, ${String(req.headers["user-agent"] ?? "").slice(0, 300)})`;
  const isSecure = secure(cfg, req);
  reply.clearCookie(isSecure ? PLAIN_NAME : SECURE_NAME, { path: "/" });
  reply.setCookie(isSecure ? SECURE_NAME : PLAIN_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: isSecure,
    // (signed in: kept when the browser closes; part-way: only until it does)
    maxAge: stage === "full" ? MAX_MS / 1000 : undefined
  });
}

export async function endSession(sql: Sql, req: FastifyRequest, reply: FastifyReply) {
  const token = tokenOf(req);
  if (token) await sql`delete from sessions where token_hash = ${sha256(token)}`;
  reply.clearCookie(SECURE_NAME, { path: "/", secure: true });
  reply.clearCookie(PLAIN_NAME, { path: "/" });
}
