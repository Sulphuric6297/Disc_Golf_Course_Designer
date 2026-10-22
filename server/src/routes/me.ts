// Your own account: name, password, backup codes, and where you're signed in.
import type { FastifyInstance } from "fastify";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";
import type { Ctx } from "../app.js";
import { backupCodeHash, checkTotp, newBackupCode, open } from "../crypto.js";
import { ApiError, audit, code, displayName, need, parse, password } from "../http.js";

export async function meRoutes(app: FastifyInstance, { sql, cfg }: Ctx) {
  /** A code from the authenticator app, for changes that matter. */
  const checkCode = async (userId: string, c: string) => {
    const [u] = await sql`select totp_secret, totp_last_step from users where id = ${userId}`;
    const step = u?.totp_secret ? checkTotp(open(u.totp_secret, cfg.appSecret), c, Number(u.totp_last_step)) : null;
    const ok = step !== null && (await sql`update users set totp_last_step = ${step} where id = ${userId} and totp_last_step < ${step} returning id`).length > 0;
    if (!ok) throw new ApiError(400, "Wrong code");
  };

  app.post("/api/me", async req => {
    const a = need(req);
    const b = parse(z.object({ displayName }), req.body);
    await sql`update users set display_name = ${b.displayName} where id = ${a.user.id}`;
    return { ok: true };
  });

  app.post("/api/me/password", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async req => {
    const a = need(req);
    const b = parse(z.object({ current: z.string().max(256), next: password, code }), req.body);
    const [u] = await sql`select password_hash from users where id = ${a.user.id}`;
    if (!(await verify(u.password_hash, b.current).catch(() => false))) throw new ApiError(400, "Wrong current password");
    if (b.next.toLowerCase().includes(a.user.username.toLowerCase())) throw new ApiError(400, "Password: don't use your username in it");
    await checkCode(a.user.id, b.code);
    await sql`update users set password_hash = ${await hash(b.next)} where id = ${a.user.id}`;
    // (signed out everywhere else)
    await sql`delete from sessions where user_id = ${a.user.id} and id <> ${a.sessionId}`;
    await audit(sql, req, "password.changed");
    return { ok: true };
  });

  app.post("/api/me/backup-codes", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async req => {
    const a = need(req);
    const b = parse(z.object({ code }), req.body);
    await checkCode(a.user.id, b.code);
    const codes = Array.from({ length: 10 }, newBackupCode);
    await sql.begin(async tx => {
      await tx`delete from backup_codes where user_id = ${a.user.id}`;
      for (const c of codes) await tx`insert into backup_codes (user_id, code_hash) values (${a.user.id}, ${backupCodeHash(c)})`;
    });
    await audit(sql, req, "mfa.backup-codes-renewed");
    return { backupCodes: codes };
  });

  app.get("/api/me/sessions", async req => {
    const a = need(req);
    const rows = await sql`select id, created_at, last_seen_at, ip, user_agent from sessions where user_id = ${a.user.id} and stage = 'full' and expires_at > now() order by last_seen_at desc`;
    const [{ left }] = await sql`select count(*)::int as left from backup_codes where user_id = ${a.user.id} and used_at is null`;
    return {
      backupCodesLeft: left,
      sessions: rows.map(r => ({ id: r.id, current: r.id === a.sessionId, createdAt: r.created_at, lastSeenAt: r.last_seen_at, ip: r.ip, userAgent: r.user_agent }))
    };
  });

  app.delete<{ Params: { id: string } }>("/api/me/sessions/:id", async req => {
    const a = need(req);
    const { id } = parse(z.object({ id: z.uuid("Not found") }), req.params);
    const gone = await sql`delete from sessions where id = ${id} and user_id = ${a.user.id} returning id`;
    if (!gone.length) throw new ApiError(404, "Not found");
    await audit(sql, req, "session.ended");
    return { ok: true };
  });
}
