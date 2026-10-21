// The admin's: people (invite, disable, make admin, reset, remove) and the activity log.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Ctx } from "../app.js";
import { newToken, sha256 } from "../crypto.js";
import { ApiError, audit, needAdmin, parse } from "../http.js";

/** How long an invite or reset link works. */
const LINK_MS = 48 * 3600_000;

type Id = { Params: { id: string } };
const uuid = z.object({ id: z.uuid("Not found") });

export async function adminRoutes(app: FastifyInstance, { sql }: Ctx) {
  const other = async (req: Parameters<typeof needAdmin>[0], id: string) => {
    const a = needAdmin(req);
    if (id === a.user.id) throw new ApiError(400, "Not on your own account");
    const [u] = await sql`select id, username from users where id = ${id}`;
    if (!u) throw new ApiError(404, "Not found");
    return u;
  };

  app.get("/api/admin/users", async req => {
    needAdmin(req);
    const rows = await sql`
      select u.id, u.username, u.display_name, u.is_admin, u.disabled, u.totp_enabled, u.created_at,
        u.locked_until > now() as locked,
        (select max(last_seen_at) from sessions s where s.user_id = u.id and s.stage = 'full') as last_seen_at
      from users u order by lower(u.username)`;
    return rows.map(r => ({
      id: r.id, username: r.username, displayName: r.display_name, isAdmin: r.is_admin, disabled: r.disabled,
      totpEnabled: r.totp_enabled, locked: !!r.locked, createdAt: r.created_at, lastSeenAt: r.last_seen_at
    }));
  });

  app.post("/api/admin/invites", async req => {
    const a = needAdmin(req);
    const b = parse(z.object({ isAdmin: z.boolean().default(false), note: z.string().trim().max(100).default("") }), req.body);
    const token = newToken();
    const expiresAt = new Date(Date.now() + LINK_MS);
    await sql`insert into invites (token_hash, kind, is_admin, note, created_by, expires_at) values (${sha256(token)}, 'invite', ${b.isAdmin}, ${b.note}, ${a.user.id}, ${expiresAt})`;
    await audit(sql, req, "invite.created", { admin: b.isAdmin, note: b.note });
    return { token, expiresAt };
  });

  app.get("/api/admin/invites", async req => {
    needAdmin(req);
    const rows = await sql`
      select i.id, i.kind, i.is_admin, i.note, i.created_at, i.expires_at, u.username
      from invites i left join users u on u.id = i.user_id
      where i.used_at is null and i.expires_at > now() order by i.created_at desc`;
    return rows.map(r => ({ id: r.id, kind: r.kind, isAdmin: r.is_admin, note: r.note, username: r.username, createdAt: r.created_at, expiresAt: r.expires_at }));
  });

  app.delete<Id>("/api/admin/invites/:id", async req => {
    needAdmin(req);
    const { id } = parse(uuid, req.params);
    const gone = await sql`delete from invites where id = ${id} and used_at is null returning kind`;
    if (!gone.length) throw new ApiError(404, "Not found");
    await audit(sql, req, "invite.cancelled", { id });
    return { ok: true };
  });

  app.post<Id>("/api/admin/users/:id", async req => {
    const { id } = parse(uuid, req.params);
    const u = await other(req, id);
    const b = parse(z.object({ disabled: z.boolean().optional(), isAdmin: z.boolean().optional() }), req.body);
    if (b.disabled !== undefined) {
      await sql`update users set disabled = ${b.disabled} where id = ${id}`;
      if (b.disabled) await sql`delete from sessions where user_id = ${id}`;
      await audit(sql, req, b.disabled ? "user.disabled" : "user.enabled", { username: u.username });
    }
    if (b.isAdmin !== undefined) {
      await sql`update users set is_admin = ${b.isAdmin} where id = ${id}`;
      await audit(sql, req, b.isAdmin ? "user.made-admin" : "user.admin-removed", { username: u.username });
    }
    return { ok: true };
  });

  // A reset link: a new password and 2FA. Signs the person out everywhere now.
  app.post<Id>("/api/admin/users/:id/reset", async req => {
    const a = needAdmin(req);
    const { id } = parse(uuid, req.params);
    const u = await other(req, id);
    const token = newToken();
    const expiresAt = new Date(Date.now() + LINK_MS);
    await sql.begin(async tx => {
      await tx`delete from invites where user_id = ${id} and kind = 'reset' and used_at is null`;
      await tx`insert into invites (token_hash, kind, user_id, created_by, expires_at) values (${sha256(token)}, 'reset', ${id}, ${a.user.id}, ${expiresAt})`;
      await tx`delete from sessions where user_id = ${id}`;
    });
    await audit(sql, req, "reset.created", { username: u.username });
    return { token, expiresAt };
  });

  app.delete<Id>("/api/admin/users/:id", async req => {
    const { id } = parse(uuid, req.params);
    const u = await other(req, id);
    await sql`delete from users where id = ${id}`;
    await audit(sql, req, "user.removed", { username: u.username });
    return { ok: true };
  });

  app.get<{ Querystring: { before?: string } }>("/api/admin/audit", async req => {
    needAdmin(req);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const rows = await sql`
      select l.id, l.at, l.action, l.detail, l.ip, u.username
      from audit_log l left join users u on u.id = l.user_id
      where l.id < ${before} order by l.id desc limit 100`;
    return rows.map(r => ({ id: Number(r.id), at: r.at, action: r.action, detail: r.detail, ip: r.ip, username: r.username }));
  });
}
