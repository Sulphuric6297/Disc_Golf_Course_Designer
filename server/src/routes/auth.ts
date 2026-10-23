// Signing in: first-run setup, password, 2FA (set up or checked), invites and resets, signing out.
import type { FastifyInstance } from "fastify";
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { z } from "zod";
import type { Ctx } from "../app.js";
import { backupCodeHash, base32, checkTotp, newBackupCode, open, sameText, seal, sha256, totpUri } from "../crypto.js";
import { ApiError, audit, code, displayName, need, needSetup, parse, password, username } from "../http.js";
import { endSession, startSession } from "../sessions.js";

/** Wrong passwords before an account rests, and for how long. */
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60_000;
/** Wrong codes before a half-finished sign-in starts over. */
const MAX_CODE_TRIES = 5;

export async function authRoutes(app: FastifyInstance, { sql, cfg, setup, authLimit = 10 }: Ctx) {
  // (tries a minute from one address)
  const strict = { config: { rateLimit: { max: authLimit, timeWindow: "1 minute" } } };
  // (compared against when the username doesn't exist, so a wrong name takes as long as a wrong password)
  const dummyHash = await hash(randomBytes(16).toString("hex"));

  const notSameAsName = (pw: string, name: string) => {
    if (pw.toLowerCase().includes(name.toLowerCase())) throw new ApiError(400, "Password: don't use your username in it");
  };

  app.get("/api/session", async req => {
    const [{ n }] = await sql`select count(*)::int as n from users`;
    const a = req.auth;
    return { needsSetup: n === 0, stage: a?.stage ?? null, user: a ? { ...a.user } : null };
  });

  // --- First run: the first account, the admin. Needs the code printed in the server's log.
  app.post("/api/setup", strict, async (req, reply) => {
    const b = parse(z.object({ code: z.string().trim(), username, displayName, password }), req.body);
    const expected = setup.code();
    if (!expected || !sameText(b.code.toUpperCase().replace(/[^A-Z2-7]/g, ""), expected)) {
      await audit(sql, req, "setup.wrong-code", {}, null);
      throw new ApiError(403, "Wrong setup code");
    }
    notSameAsName(b.password, b.username);
    const pwHash = await hash(b.password);
    const user = await sql.begin(async tx => {
      await tx`lock table users in exclusive mode`;
      const [{ n }] = await tx`select count(*)::int as n from users`;
      if (n > 0) throw new ApiError(409, "Already set up");
      const [u] = await tx`insert into users (username, display_name, password_hash, is_admin) values (${b.username}, ${b.displayName}, ${pwHash}, true) returning id`;
      return u;
    });
    setup.done();
    await audit(sql, req, "setup.admin-created", { username: b.username }, user.id);
    // (2FA is the admin's own choice, as for everyone: set up later from the account)
    await startSession(sql, cfg, req, reply, user.id, "full");
    return { stage: "full" };
  });

  // --- Password
  app.post("/api/login", strict, async (req, reply) => {
    const b = parse(z.object({ username: z.string().trim().max(64), password: z.string().max(256) }), req.body);
    const [u] = await sql`select id, password_hash, totp_enabled, mfa_required, disabled, locked_until from users where lower(username) = lower(${b.username})`;
    const wrong = new ApiError(401, "Wrong username or password");
    if (!u) { await verify(dummyHash, b.password).catch(() => false); throw wrong; }
    const ok = await verify(u.password_hash, b.password).catch(() => false);
    if (u.locked_until && u.locked_until > new Date()) { await audit(sql, req, "login.locked", {}, u.id); throw wrong; }
    if (!ok) {
      const [f] = await sql`update users set failed_logins = failed_logins + 1 where id = ${u.id} returning failed_logins`;
      if (f.failed_logins >= MAX_FAILS) {
        await sql`update users set failed_logins = 0, locked_until = ${new Date(Date.now() + LOCK_MS)} where id = ${u.id}`;
        await audit(sql, req, "login.lock", {}, u.id);
      } else await audit(sql, req, "login.wrong-password", {}, u.id);
      throw wrong;
    }
    if (u.disabled) { await audit(sql, req, "login.disabled", {}, u.id); throw wrong; }
    await sql`update users set failed_logins = 0, locked_until = null where id = ${u.id}`;
    // (a code when it's on; set up first when an admin requires it; otherwise straight in)
    const stage = u.totp_enabled ? "mfa" : u.mfa_required ? "mfa-setup" : "full";
    await startSession(sql, cfg, req, reply, u.id, stage);
    return { stage };
  });

  // --- 2FA set up: a new secret (as a QR code), then a code from the app turns it on
  app.post("/api/mfa/enroll", strict, async req => {
    const a = needSetup(req);
    const secret = randomBytes(20);
    // (a new secret: codes used with the old one say nothing about it)
    await sql`update users set totp_secret = ${seal(secret, cfg.appSecret)}, totp_enabled = false, totp_last_step = 0 where id = ${a.user.id}`;
    const uri = totpUri(secret, a.user.username);
    const qr = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { secret: base32(secret), uri, qr };
  });

  app.post("/api/mfa/enroll/confirm", strict, async (req, reply) => {
    const a = needSetup(req);
    const b = parse(z.object({ code }), req.body);
    const [u] = await sql`select totp_secret, totp_last_step from users where id = ${a.user.id}`;
    if (!u?.totp_secret) throw new ApiError(400, "Set up 2FA first");
    const step = checkTotp(open(u.totp_secret, cfg.appSecret), b.code, Number(u.totp_last_step));
    if (step === null) throw new ApiError(400, "Wrong code");
    const codes = Array.from({ length: 10 }, newBackupCode);
    await sql.begin(async tx => {
      await tx`update users set totp_enabled = true, totp_last_step = ${step} where id = ${a.user.id}`;
      await tx`delete from backup_codes where user_id = ${a.user.id}`;
      for (const c of codes) await tx`insert into backup_codes (user_id, code_hash) values (${a.user.id}, ${backupCodeHash(c)})`;
    });
    await audit(sql, req, "mfa.enabled");
    await startSession(sql, cfg, req, reply, a.user.id, "full");
    return { backupCodes: codes };
  });

  // --- 2FA check: a code from the app, or a backup code
  app.post("/api/mfa/verify", strict, async (req, reply) => {
    const a = need(req, "mfa");
    const b = parse(z.object({ code }), req.body);
    let ok = false;
    if (/^\d{6}$/.test(b.code.replace(/\s+/g, ""))) {
      const [u] = await sql`select totp_secret, totp_last_step from users where id = ${a.user.id}`;
      const step = u?.totp_secret ? checkTotp(open(u.totp_secret, cfg.appSecret), b.code, Number(u.totp_last_step)) : null;
      // (only one request can use a step)
      if (step !== null) ok = (await sql`update users set totp_last_step = ${step} where id = ${a.user.id} and totp_last_step < ${step} returning id`).length > 0;
    } else {
      const used = await sql`update backup_codes set used_at = now() where user_id = ${a.user.id} and code_hash = ${backupCodeHash(b.code)} and used_at is null returning user_id`;
      ok = used.length > 0;
      if (ok) await audit(sql, req, "mfa.backup-code-used");
    }
    if (!ok) {
      const [s] = await sql`update sessions set mfa_attempts = mfa_attempts + 1 where id = ${a.sessionId} returning mfa_attempts`;
      await audit(sql, req, "mfa.wrong-code");
      if (s.mfa_attempts >= MAX_CODE_TRIES) {
        await endSession(sql, req, reply);
        throw new ApiError(401, "Too many wrong codes. Sign in again");
      }
      throw new ApiError(400, "Wrong code");
    }
    await audit(sql, req, "login");
    await startSession(sql, cfg, req, reply, a.user.id, "full");
    return { stage: "full" };
  });

  app.post("/api/logout", async (req, reply) => {
    if (req.auth) await audit(sql, req, "logout");
    await endSession(sql, req, reply);
    return { ok: true };
  });

  // --- Invite and reset links
  const findInvite = async (token: string) => {
    const [i] = await sql`
      select i.id, i.kind, i.user_id, i.is_admin, u.username, u.display_name
      from invites i left join users u on u.id = i.user_id
      where i.token_hash = ${sha256(token)} and i.used_at is null and i.expires_at > now()`;
    if (!i) throw new ApiError(404, "This link has expired or was already used");
    return i;
  };

  app.get<{ Params: { token: string } }>("/api/invites/:token", strict, async req => {
    const i = await findInvite(req.params.token);
    return { kind: i.kind, username: i.username ?? null, displayName: i.display_name ?? null };
  });

  app.post<{ Params: { token: string } }>("/api/invites/:token/accept", strict, async (req, reply) => {
    const i = await findInvite(req.params.token);
    if (i.kind === "invite") {
      const b = parse(z.object({ username, displayName, password }), req.body);
      notSameAsName(b.password, b.username);
      const pwHash = await hash(b.password);
      const user = await sql.begin(async tx => {
        const [used] = await tx`update invites set used_at = now() where id = ${i.id} and used_at is null returning id`;
        if (!used) throw new ApiError(404, "This link has expired or was already used");
        const [taken] = await tx`select 1 from users where lower(username) = lower(${b.username})`;
        if (taken) throw new ApiError(409, "That username is taken");
        const [u] = await tx`insert into users (username, display_name, password_hash, is_admin) values (${b.username}, ${b.displayName}, ${pwHash}, ${i.is_admin}) returning id`;
        await tx`update invites set used_by = ${u.id} where id = ${i.id}`;
        return u;
      });
      await audit(sql, req, "invite.accepted", { username: b.username, admin: i.is_admin }, user.id);
      await startSession(sql, cfg, req, reply, user.id, "full");
      return { stage: "full" };
    } else {
      const b = parse(z.object({ password }), req.body);
      notSameAsName(b.password, i.username);
      const pwHash = await hash(b.password);
      await sql.begin(async tx => {
        const [used] = await tx`update invites set used_at = now(), used_by = ${i.user_id} where id = ${i.id} and used_at is null returning id`;
        if (!used) throw new ApiError(404, "This link has expired or was already used");
        await tx`update users set password_hash = ${pwHash}, totp_secret = null, totp_enabled = false, failed_logins = 0, locked_until = null where id = ${i.user_id}`;
        await tx`delete from backup_codes where user_id = ${i.user_id}`;
        await tx`delete from sessions where user_id = ${i.user_id}`;
      });
      await audit(sql, req, "reset.used", {}, i.user_id);
      // (2FA again only where an admin requires it)
      const [r] = await sql`select mfa_required from users where id = ${i.user_id}`;
      const stage = r?.mfa_required ? "mfa-setup" : "full";
      await startSession(sql, cfg, req, reply, i.user_id, stage);
      return { stage };
    }
  });
}
