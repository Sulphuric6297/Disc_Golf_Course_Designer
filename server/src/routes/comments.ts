// Comments on a course, and the notices people get about them. Everyone on the course can read
// and write them (viewers too); you change or delete your own (an owner deletes any); anyone on
// it resolves or re-opens a thread and assigns it. A reply tells the thread's people, @username
// tells that member, an assignment tells the one assigned.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Ctx } from "../app.js";
import { ApiError, need, parse } from "../http.js";
import { ids, roleOn, type Id } from "./courses.js";

const anchor = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  // (the hole or feature it's on: it moves with it)
  on: z.object({ kind: z.enum(["hole", "item"]), id: z.string().max(100) }).optional()
}).nullable().optional();
const body = z.string().trim().min(1, "Write something").max(4000);

type Cm = { Params: { id: string; cid: string } };
const cmIds = z.object({ id: z.uuid("Not found"), cid: z.uuid("Not found") });

export async function commentRoutes(app: FastifyInstance, { sql }: Ctx) {
  const role = roleOn(sql);

  /** The course's members named in a comment (@username). */
  const mentioned = async (courseId: string, text: string) => {
    const names = [...new Set([...text.matchAll(/@([a-zA-Z0-9][a-zA-Z0-9._-]{2,31})/g)].map(m => m[1].toLowerCase()))];
    if (!names.length) return [];
    const rows = await sql`select u.id from users u join course_members m on m.user_id = u.id where m.course_id = ${courseId} and lower(u.username) in ${sql(names)}`;
    return rows.map(r => r.id as string);
  };
  const notify = async (users: string[], courseId: string, commentId: string, kind: string, by: string) => {
    for (const u of new Set(users)) if (u !== by) await sql`insert into notifications (user_id, course_id, comment_id, kind, by_id) values (${u}, ${courseId}, ${commentId}, ${kind}, ${by})`;
  };
  const isMember = async (courseId: string, userId: string) => (await sql`select 1 from course_members where course_id = ${courseId} and user_id = ${userId}`).length > 0;

  app.get<Id>("/api/courses/:id/comments", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "viewer");
    const rows = await sql`
      select c.*, a.display_name as author, a.username as author_username, s.display_name as assignee, r.display_name as resolver
      from course_comments c
      left join users a on a.id = c.author_id left join users s on s.id = c.assignee_id left join users r on r.id = c.resolved_by
      where c.course_id = ${id} order by c.created_at`;
    const out = rows.map(c => ({
      id: c.id, parentId: c.parent_id, authorId: c.author_id, author: c.author, authorUsername: c.author_username, body: c.body, anchor: c.anchor,
      version: c.version, inDraft: c.in_draft, assigneeId: c.assignee_id, assignee: c.assignee, resolvedAt: c.resolved_at, resolvedBy: c.resolver,
      createdAt: c.created_at, editedAt: c.edited_at
    }));
    // Threads: the first comment, its replies in order
    return out.filter(c => !c.parentId).map(t => ({ ...t, replies: out.filter(r => r.parentId === t.id) }));
  });

  app.post<Id>("/api/courses/:id/comments", async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "viewer");
    const b = parse(z.object({ body, anchor, parentId: z.uuid().optional(), inDraft: z.boolean().default(false) }), req.body);
    let thread: { id: string; author_id: string; assignee_id: string | null } | null = null;
    if (b.parentId) {
      const [t] = await sql`select id, author_id, assignee_id from course_comments where id = ${b.parentId} and course_id = ${id} and parent_id is null`;
      if (!t) throw new ApiError(404, "Not found");
      thread = { id: t.id, author_id: t.author_id, assignee_id: t.assignee_id };
    } else if (!b.anchor) throw new ApiError(400, "Pin it to a spot on the map");
    const [c] = await sql`select version from courses where id = ${id}`;
    const [made] = await sql`
      insert into course_comments (course_id, parent_id, author_id, body, anchor, version, in_draft)
      values (${id}, ${b.parentId ?? null}, ${a.user.id}, ${b.body}, ${b.parentId ? null : sql.json(b.anchor as never)}, ${c.version}, ${b.inDraft}) returning id`;
    if (thread) {
      // (the thread's people: who started it, who's assigned, who replied)
      const people = await sql`select distinct author_id from course_comments where (id = ${thread.id} or parent_id = ${thread.id}) and author_id is not null`;
      await notify([...people.map(p => p.author_id as string), ...(thread.assignee_id ? [thread.assignee_id] : [])], id, made.id, "reply", a.user.id);
      // (a reply re-opens a resolved thread)
      await sql`update course_comments set resolved_at = null, resolved_by = null where id = ${thread.id}`;
    }
    await notify(await mentioned(id, b.body), id, made.id, "mention", a.user.id);
    return { id: made.id };
  });

  /** A comment on the course, and whether it's yours. */
  const find = async (courseId: string, cid: string) => {
    const [c] = await sql`select id, author_id, parent_id from course_comments where id = ${cid} and course_id = ${courseId}`;
    if (!c) throw new ApiError(404, "Not found");
    return c;
  };

  app.patch<Cm>("/api/courses/:id/comments/:cid", async req => {
    const { id, cid } = parse(cmIds, req.params);
    const { a } = await role(req, id, "viewer");
    const c = await find(id, cid);
    const b = parse(z.object({
      body: body.optional(),
      resolved: z.boolean().optional(),
      assigneeId: z.uuid().nullable().optional(),
      anchor
    }), req.body);
    if ((b.body !== undefined || b.anchor !== undefined) && c.author_id !== a.user.id) throw new ApiError(403, "Only its author can change it");
    if ((b.resolved !== undefined || b.assigneeId !== undefined) && c.parent_id) throw new ApiError(400, "Resolve or assign the thread");
    if (b.body !== undefined) {
      await sql`update course_comments set body = ${b.body}, edited_at = now() where id = ${cid}`;
      await notify(await mentioned(id, b.body), id, cid, "mention", a.user.id);
    }
    if (b.anchor) await sql`update course_comments set anchor = ${sql.json(b.anchor as never)} where id = ${cid}`;
    if (b.resolved !== undefined) await sql`update course_comments set resolved_at = ${b.resolved ? new Date() : null}, resolved_by = ${b.resolved ? a.user.id : null} where id = ${cid}`;
    if (b.assigneeId !== undefined) {
      if (b.assigneeId && !(await isMember(id, b.assigneeId))) throw new ApiError(400, "Only someone on the course");
      await sql`update course_comments set assignee_id = ${b.assigneeId} where id = ${cid}`;
      if (b.assigneeId) await notify([b.assigneeId], id, cid, "assigned", a.user.id);
    }
    return { ok: true };
  });

  app.delete<Cm>("/api/courses/:id/comments/:cid", async req => {
    const { id, cid } = parse(cmIds, req.params);
    const { a, role: r } = await role(req, id, "viewer");
    const c = await find(id, cid);
    if (c.author_id !== a.user.id && r !== "owner") throw new ApiError(403, "Only its author or an owner");
    await sql`delete from course_comments where id = ${cid}`;
    return { ok: true };
  });

  // --- Your notices
  app.get("/api/notifications", async req => {
    const a = need(req);
    const rows = await sql`
      select n.id, n.kind, n.created_at, n.read_at, n.course_id, n.comment_id, c.name as course, b.display_name as by, cm.body,
        coalesce(cm.parent_id, cm.id) as thread_id
      from notifications n
      left join courses c on c.id = n.course_id left join users b on b.id = n.by_id left join course_comments cm on cm.id = n.comment_id
      where n.user_id = ${a.user.id} and exists (select 1 from course_members m where m.course_id = n.course_id and m.user_id = ${a.user.id})
      order by n.id desc limit 50`;
    const [{ unread }] = await sql`select count(*)::int as unread from notifications where user_id = ${a.user.id} and read_at is null`;
    return {
      unread,
      items: rows.map(n => ({ id: Number(n.id), kind: n.kind, at: n.created_at, read: !!n.read_at, courseId: n.course_id, course: n.course, by: n.by, body: (n.body ?? "").slice(0, 160), threadId: n.thread_id }))
    };
  });

  app.post("/api/notifications/read", async req => {
    const a = need(req);
    const b = parse(z.object({ ids: z.array(z.number().int()).max(500).optional() }), req.body);
    if (b.ids) await sql`update notifications set read_at = now() where user_id = ${a.user.id} and id in ${sql(b.ids)} and read_at is null`;
    else await sql`update notifications set read_at = now() where user_id = ${a.user.id} and read_at is null`;
    return { ok: true };
  });
}
