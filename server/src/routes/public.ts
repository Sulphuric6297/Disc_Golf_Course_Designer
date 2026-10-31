// What a course shows beyond its members: public links and the public site. Everyone on the course
// sees its links; owners make them and publish the site (and editors, when the owner allows it):
// the parts chosen, made in the publisher's browser (pictures, GPS files, the course's
// numbers, and the course itself only if its map or 3D view is a part); each link shows the
// parts of it the link allows, with an optional password and expiry. Anyone with a link and no
// account reads only that: never the course as it's being changed.
import { createHash, randomBytes } from "crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";
import type { Ctx } from "../app.js";
import { newToken, sha256 } from "../crypto.js";
import { ApiError, audit, parse } from "../http.js";
import { BIG, ids, roleOn, type Id } from "./courses.js";

/** What can be shown: to a viewer on the course, or through a link. */
export const PARTS = ["map", "view3d", "flyovers", "printedMap", "teeSigns", "scorecard", "stats", "downloads", "copy", "comments"] as const;
export type Part = (typeof PARTS)[number];
export const perms = z.object(Object.fromEntries(PARTS.map(p => [p, z.boolean()])) as Record<Part, z.ZodBoolean>).partial();

/** The files a site may have, and the part each belongs to. */
const FILE = /^(map\.(png|webp)|scorecard\.(png|webp)|sign-[0-9]{1,3}\.(png|webp)|photo\.(png|jpeg|webp)|course\.(gpx|kml))$/;
const partOf = (name: string): Part => (name.startsWith("map.") ? "printedMap" : name.startsWith("sign-") ? "teeSigns" : name.startsWith("scorecard") ? "scorecard" : name.startsWith("photo.") ? "map" : "downloads");
const MIME: Record<string, string> = { png: "image/png", webp: "image/webp", jpeg: "image/jpeg", gpx: "application/gpx+xml", kml: "application/vnd.google-earth.kml+xml" };
const dataUrl = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/]+=*)$/;

type Lk = { Params: { id: string; lid: string } };
type Tok = { Params: { token: string } };
type TokFile = { Params: { token: string; name: string } };

export async function publicRoutes(app: FastifyInstance, { sql }: Ctx) {
  const role = roleOn(sql);
  const limited = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
  /** Owners make the links and publish the site; editors too, when the owner allows it. */
  const manage = async (req: FastifyRequest, id: string) => {
    const r = await role(req, id, "editor");
    if (r.role === "owner") return r;
    const [c] = await sql`select editors_links from courses where id = ${id}`;
    if (!c?.editors_links) throw new ApiError(403, "Only an owner can do that");
    return r;
  };

  // --- Links: everyone on the course sees them
  app.get<Id>("/api/courses/:id/links", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "viewer");
    const rows = await sql`select id, token, slug, label, perms, password_hash is not null as has_password, expires_at, created_at, revoked_at from course_links where course_id = ${id} order by created_at desc`;
    return rows.map(l => ({ id: l.id, token: l.token, slug: l.slug, label: l.label, perms: l.perms, hasPassword: l.has_password, expiresAt: l.expires_at, createdAt: l.created_at, revoked: !!l.revoked_at }));
  });

  // (a link's own name: lowercase letters, digits and dashes)
  const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,39}$/, "Name: 3 to 40 letters, digits or dashes").nullable().optional();
  const linkBody = z.object({
    label: z.string().trim().max(100).default(""),
    slug,
    perms,
    password: z.string().min(4, "Password: at least 4 characters").max(200).nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional()
  });

  app.post<Id>("/api/courses/:id/links", async req => {
    const { id } = parse(ids, req.params);
    const { a } = await manage(req, id);
    const b = parse(linkBody, req.body);
    const token = newToken();
    const [l] = await sql`
      insert into course_links (course_id, token_hash, token, slug, label, perms, password_hash, expires_at, created_by)
      values (${id}, ${sha256(token)}, ${token}, ${b.slug || null}, ${b.label}, ${sql.json(b.perms as never)}, ${b.password ? await hash(b.password) : null}, ${b.expiresAt ?? null}, ${a.user.id}) returning id`;
    await audit(sql, req, "link.created", { course: id, link: l.id });
    return { id: l.id, token };
  });

  app.patch<Lk>("/api/courses/:id/links/:lid", async req => {
    const { id, lid } = parse(z.object({ id: z.uuid("Not found"), lid: z.uuid("Not found") }), req.params);
    await manage(req, id);
    const b = parse(linkBody.partial().extend({ revoked: z.boolean().optional(), newToken: z.boolean().optional() }), req.body);
    const [l] = await sql`select id from course_links where id = ${lid} and course_id = ${id}`;
    if (!l) throw new ApiError(404, "Not found");
    if (b.label !== undefined) await sql`update course_links set label = ${b.label} where id = ${lid}`;
    if (b.slug !== undefined) await sql`update course_links set slug = ${b.slug || null} where id = ${lid}`;
    if (b.perms) await sql`update course_links set perms = ${sql.json(b.perms as never)} where id = ${lid}`;
    if (b.password !== undefined) await sql`update course_links set password_hash = ${b.password ? await hash(b.password) : null} where id = ${lid}`;
    if (b.expiresAt !== undefined) await sql`update course_links set expires_at = ${b.expiresAt} where id = ${lid}`;
    if (b.revoked !== undefined) await sql`update course_links set revoked_at = ${b.revoked ? new Date() : null} where id = ${lid}`;
    let token: string | undefined;
    // (a new address: the old one stops working)
    if (b.newToken) { token = newToken(); await sql`update course_links set token_hash = ${sha256(token)}, token = ${token} where id = ${lid}`; }
    await audit(sql, req, "link.changed", { course: id, link: lid });
    return { ok: true, token };
  });

  app.delete<Lk>("/api/courses/:id/links/:lid", async req => {
    const { id, lid } = parse(z.object({ id: z.uuid("Not found"), lid: z.uuid("Not found") }), req.params);
    await manage(req, id);
    await sql`delete from course_links where id = ${lid} and course_id = ${id}`;
    return { ok: true };
  });

  // --- The site: everyone on the course sees what it shows
  app.get<Id>("/api/courses/:id/site", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "viewer");
    const [s] = await sql`select version, parts, published_at from course_sites where course_id = ${id}`;
    return { site: s ? { version: s.version, parts: s.parts, publishedAt: s.published_at } : null };
  });

  app.post<Id>("/api/courses/:id/site", BIG, async req => {
    const { id } = parse(ids, req.params);
    const { a } = await manage(req, id);
    const b = parse(z.object({
      parts: perms,
      info: z.looseObject({ name: z.string().max(200), holes: z.array(z.unknown()).max(500) }),
      doc: z.looseObject({ holes: z.array(z.unknown()).max(500), items: z.array(z.unknown()).max(50_000) }).nullable(),
      files: z.array(z.object({ name: z.string().regex(FILE, "Not a site file"), data: z.string().max(40 << 20).regex(dataUrl, "Not a file") })).max(600)
    }), req.body);
    const needsDoc = !!(b.parts.map || b.parts.view3d || b.parts.flyovers);
    const [c] = await sql`select version from courses where id = ${id}`;
    await sql.begin(async tx => {
      await tx`delete from course_site_files where course_id = ${id}`;
      for (const f of b.files) {
        const [, , data] = dataUrl.exec(f.data)!;
        const ext = f.name.split(".").pop()!;
        await tx`insert into course_site_files (course_id, name, mime, data) values (${id}, ${f.name}, ${MIME[ext]}, ${Buffer.from(data, "base64")})`;
      }
      await tx`
        insert into course_sites (course_id, version, parts, info, doc, published_by)
        values (${id}, ${c.version}, ${tx.json(b.parts as never)}, ${tx.json(b.info as never)}, ${needsDoc && b.doc ? tx.json({ ...b.doc, background: null } as never) : null}, ${a.user.id})
        on conflict (course_id) do update set version = excluded.version, parts = excluded.parts, info = excluded.info, doc = excluded.doc,
          published_by = excluded.published_by, published_at = now()`;
    });
    await audit(sql, req, "site.published", { course: id, version: c.version });
    return { version: c.version };
  });

  app.delete<Id>("/api/courses/:id/site", async req => {
    const { id } = parse(ids, req.params);
    await manage(req, id);
    await sql`delete from course_sites where course_id = ${id}`;
    await sql`delete from course_site_files where course_id = ${id}`;
    return { ok: true };
  });

  // --- Anyone with a link
  /** The link (working, password given if it has one) and what it shows of the site. */
  const open = async (req: FastifyRequest, token: string) => {
    const [l] = await sql`
      select l.id, l.course_id, l.perms, l.password_hash, s.parts, s.info, s.version, s.published_at, s.doc is not null as has_doc
      from course_links l join course_sites s on s.course_id = l.course_id
      where (l.token_hash = ${sha256(token)} or l.slug = ${token.toLowerCase()}) and l.revoked_at is null and (l.expires_at is null or l.expires_at > now())`;
    if (!l) throw new ApiError(404, "This link doesn't work (any more)");
    if (l.password_hash) {
      const given = String(req.headers["x-link-password"] ?? "");
      if (!given || !(await verify(l.password_hash, given).catch(() => false))) throw new ApiError(401, given ? "Wrong password" : "Password", { needsPassword: true });
    }
    const shown = Object.fromEntries(PARTS.filter(p => p !== "comments").map(p => [p, !!l.perms[p] && !!l.parts[p]])) as Record<Part, boolean>;
    return { l, shown };
  };

  app.get<Tok>("/api/public/:token", limited, async req => {
    const { l, shown } = await open(req, req.params.token);
    const files = await sql`select name from course_site_files where course_id = ${l.course_id} order by name`;
    // (the numbers per hole only when stats are shown)
    const info = shown.stats ? l.info : { ...l.info, holes: [], totals: undefined };
    return {
      info, shown, version: l.version, publishedAt: l.published_at, hasCourse: l.has_doc && (shown.map || shown.view3d || shown.flyovers),
      files: files.map(f => f.name as string).filter(n => shown[partOf(n)])
    };
  });

  app.get<Tok>("/api/public/:token/course", limited, async req => {
    const { l, shown } = await open(req, req.params.token);
    if (!(shown.map || shown.view3d || shown.flyovers)) throw new ApiError(404, "Not found");
    const [s] = await sql`select doc from course_sites where course_id = ${l.course_id}`;
    if (!s?.doc) throw new ApiError(404, "Not found");
    return { doc: s.doc, shown };
  });

  app.get<TokFile>("/api/public/:token/files/:name", limited, async (req, reply) => {
    const { l, shown } = await open(req, req.params.token);
    const name = req.params.name;
    if (!FILE.test(name) || !shown[partOf(name)]) throw new ApiError(404, "Not found");
    const [f] = await sql`select mime, data from course_site_files where course_id = ${l.course_id} and name = ${name}`;
    if (!f) throw new ApiError(404, "Not found");
    return reply.header("cache-control", "private, max-age=300").type(f.mime).send(f.data);
  });

  // --- Visitors to the public page: counted without cookies, nothing personal kept
  // (migrations/015_visitors.sql). A visitor is a hash of their address and browser with the day's
  // salt, thrown away after a day: once a day, never followed from one day to the next.
  const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
  const saltFor = async (day: string) => {
    const [s] = await sql`select salt from site_salts where day = ${day}`;
    if (s) return s.salt as Buffer;
    await sql`delete from site_salts where day < ${day}::date - 1`;
    const [n] = await sql`insert into site_salts (day, salt) values (${day}, ${randomBytes(32)}) on conflict (day) do update set day = excluded.day returning salt`;
    return n.salt as Buffer;
  };
  const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|search\.brave|startpage|qwant)\./;
  const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  // (the visitor's own day, when it's within a day of the server's: their evening is still their day)
  const ownDay = (day: string) => (Math.abs(Date.parse(day) - Date.parse(utcDay())) <= 86_400_000 ? day : utcDay());

  app.post<Tok>("/api/public/:token/visit", limited, async req => {
    const { l } = await open(req, req.params.token);
    const b = parse(z.object({
      from: z.string().max(40).optional(), ref: z.string().max(500).optional(), phone: z.boolean(),
      day: dayStr, dow: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23)
    }), req.body);
    const day = ownDay(b.day);
    const salt = await saltFor(utcDay());
    const visitor = createHash("sha256").update(salt).update(req.ip).update(String(req.headers["user-agent"] ?? "")).update(String(l.course_id)).digest().subarray(0, 16);
    // Where it came from: a tee sign's QR code, then a public link with a name, then the website
    // before (a search engine, or another), or none (typed in, or an app)
    const [link] = await sql`select label, slug from course_links where id = ${l.id}`;
    const sign = /^sign-([0-9A-Za-z]{1,4})$/.exec(b.from ?? "")?.[1];
    let host = "";
    try { host = b.ref ? new URL(b.ref).hostname.replace(/^www\./, "") : ""; } catch { host = ""; }
    if (host && host === String(req.headers.host ?? "").replace(/:\d+$/, "").replace(/^www\./, "")) host = "";
    const named = !!(link?.label || link?.slug);
    const [source, key] = sign ? ["sign", sign] : named ? ["link", null] : host && SEARCH.test(host) ? ["search", host] : host ? ["web", host] : ["direct", null];
    await sql`
      insert into site_visits (course_id, day, visitor, link_id, source, source_key, phone, dow, hour)
      values (${l.course_id}, ${day}, ${visitor}, ${l.id}, ${source}, ${key}, ${b.phone}, ${b.dow}, ${b.hour})
      on conflict (course_id, day, visitor) do update set last_at = now()`;
    return { v: visitor.toString("base64url"), day };
  });

  // (while the page is open, about once a minute, and as it closes: how long so far, and a hole or
  // flyover looked at. Only for a visit already counted; nothing to read back)
  app.post<Tok>("/api/public/:token/ping", limited, async req => {
    const b = parse(z.object({
      v: z.string().regex(/^[A-Za-z0-9_-]{20,24}$/), day: dayStr, seconds: z.number().int().min(0).max(14_400).optional(),
      hole: z.string().max(8).optional(), flyover: z.string().max(8).optional()
    }), req.body);
    const token = req.params.token;
    const [l] = await sql`select course_id from course_links where (token_hash = ${sha256(token)} or slug = ${token.toLowerCase()}) and revoked_at is null`;
    if (!l) throw new ApiError(404, "Not found");
    const visitor = Buffer.from(b.v, "base64url");
    const [v] = await sql`
      update site_visits set last_at = now(), seconds = greatest(seconds, ${b.seconds ?? 0})
      where course_id = ${l.course_id} and day = ${b.day} and visitor = ${visitor} returning 1`;
    if (!v) return { ok: false };
    for (const [kind, key] of [["hole", b.hole], ["flyover", b.flyover]] as const) {
      if (key) await sql`
        insert into site_counts (course_id, day, kind, key, n) values (${l.course_id}, ${b.day}, ${kind}, ${key}, 1)
        on conflict (course_id, day, kind, key) do update set n = site_counts.n + 1`;
    }
    return { ok: true };
  });

  // The course's visitors (its owners and editors): over the last `days` days (0: since the first)
  app.get<Id & { Querystring: { days?: string } }>("/api/courses/:id/visitors", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "editor");
    const days = Math.max(0, Math.min(3650, Number(req.query.days ?? 30) || 0));
    const today = utcDay();
    const [first] = await sql`select min(day)::text as day from site_visits where course_id = ${id}`;
    const from = days ? utcDay(new Date(Date.now() - (days - 1) * 86_400_000)) : first?.day ?? today;
    const span = Math.max(1, Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000) + 1);
    const before = utcDay(new Date(Date.parse(from) - span * 86_400_000));
    const [perDay, [prev], [now], [typical], sources, counts, heat, devices] = await Promise.all([
      sql`select day::text as day, count(*)::int as n from site_visits where course_id = ${id} and day >= ${from} group by day order by day`,
      sql`select count(*)::int as n from site_visits where course_id = ${id} and day >= ${before} and day < ${from}`,
      sql`select count(*)::int as n from site_visits where course_id = ${id} and last_at > now() - interval '2 minutes'`,
      sql`select coalesce(percentile_cont(0.5) within group (order by seconds), 0)::int as s from site_visits where course_id = ${id} and day >= ${from} and seconds >= 5`,
      sql`
        select v.source, v.source_key as key, coalesce(nullif(l.label, ''), l.slug) as label, count(*)::int as n
        from site_visits v left join course_links l on l.id = v.link_id
        where v.course_id = ${id} and v.day >= ${from} group by 1, 2, 3 order by n desc`,
      sql`select kind, key, sum(n)::int as n from site_counts where course_id = ${id} and day >= ${from} group by kind, key order by n desc`,
      sql`select dow, hour, count(*)::int as n from site_visits where course_id = ${id} and day >= ${from} group by dow, hour`,
      sql`select phone, count(*)::int as n from site_visits where course_id = ${id} and day >= ${from} group by phone`
    ]);
    return {
      from, to: today, days: perDay.map(d => ({ day: d.day as string, n: d.n as number })), total: perDay.reduce((a, d) => a + (d.n as number), 0),
      before: days ? (prev.n as number) : null, now: now.n as number, typicalSeconds: typical.s as number,
      sources: sources.map(r => ({ source: r.source as string, key: r.key as string | null, label: r.label as string | null, n: r.n as number })),
      holes: counts.filter(c => c.kind === "hole").map(c => ({ hole: c.key as string, n: c.n as number })),
      flyovers: counts.filter(c => c.kind === "flyover").map(c => ({ hole: c.key as string, n: c.n as number })),
      heat: heat.map(h => ({ dow: h.dow as number, hour: h.hour as number, n: h.n as number })),
      phone: (devices.find(d => d.phone)?.n as number | undefined) ?? 0, computer: (devices.find(d => !d.phone)?.n as number | undefined) ?? 0
    };
  });
}
