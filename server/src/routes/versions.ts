// Drafts, publishing them, the owner's OK when the owner wants one, and the history.
//
// Editors change a course in a draft of their own, saved as they go. Publishing a draft changes
// the main version: the app merges the draft with what changed meanwhile and sends the result
// with the version it merged with (an older one is refused, and the app merges again). When the
// owner turns approval on, editors submit their draft instead, and the owner accepts or declines.
// Every published change, every restore and the owner's own changes every few minutes are kept
// as versions; restoring one makes a new version, so nothing is lost.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Ctx } from "../app.js";
import { ApiError, audit, parse } from "../http.js";
import { draftCheckpoint, keepCurrent, saveDraft, snapshot } from "../history.js";
import { BIG, IMAGE, courseDoc, ids, roleOn, stored, summary, type Id } from "./courses.js";

/** A photo sent with a change: a new one, none (null), or the course's own (left out). */
const photo = z.string().max(60 << 20).regex(IMAGE, "Not an image").nullable().optional();
const note = z.string().trim().max(500).default("");

export async function versionRoutes(app: FastifyInstance, { sql }: Ctx) {
  const role = roleOn(sql);

  /** The main version replaced by a merged draft (from the version it was merged with). */
  const publish = async (courseId: string, b: { doc: z.infer<typeof courseDoc>; version: number; summary?: z.infer<typeof summary>; photo?: string | null; note: string }, by: string, approvedBy: string | null) =>
    sql.begin(async tx => {
      await keepCurrent(tx, courseId);
      const [done] = await tx`
        update courses set doc = ${tx.json(stored(b.doc) as never)}, summary = ${tx.json((b.summary ?? {}) as never)}, name = ${b.doc.name}, holes = ${b.doc.holes.length},
          version = version + 1, updated_by = ${by}, updated_at = now()
        where id = ${courseId} and version = ${b.version} returning version`;
      if (!done) {
        const [c] = await tx`select version from courses where id = ${courseId}`;
        throw new ApiError(409, "The course changed meanwhile", { version: c.version });
      }
      if (b.photo === null) await tx`delete from course_backgrounds where course_id = ${courseId}`;
      else if (b.photo) await tx`insert into course_backgrounds (course_id, data) values (${courseId}, ${b.photo}) on conflict (course_id) do update set data = excluded.data, updated_at = now()`;
      await snapshot(tx, courseId, "publish", b.note, by, approvedBy);
      return done.version as number;
    });
  const published = z.object({ doc: courseDoc, version: z.number().int(), summary, photo, note });

  // --- Your draft
  app.get<Id>("/api/courses/:id/draft", async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    const [d] = await sql`select doc, base_doc, base_version, photo is not null as has_photo, updated_at from course_drafts where course_id = ${id} and user_id = ${a.user.id}`;
    return { draft: d ? { doc: d.doc, baseDoc: d.base_doc, baseVersion: d.base_version, hasPhoto: d.has_photo, updatedAt: d.updated_at } : null };
  });

  app.put<Id>("/api/courses/:id/draft", BIG, async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    // (what it started from comes with its first save, or when it starts again from a newer main)
    const b = parse(z.object({ doc: courseDoc, summary, base: z.object({ doc: courseDoc, version: z.number().int() }).optional() }), req.body);
    if (b.base) {
      await sql`
        insert into course_drafts (course_id, user_id, doc, base_doc, base_version, summary)
        values (${id}, ${a.user.id}, ${sql.json(stored(b.doc) as never)}, ${sql.json(stored(b.base.doc) as never)}, ${b.base.version}, ${sql.json((b.summary ?? {}) as never)})
        on conflict (course_id, user_id) do update set doc = excluded.doc, base_doc = excluded.base_doc, base_version = excluded.base_version, summary = excluded.summary, updated_at = now()`;
    } else {
      const done = await sql`
        update course_drafts set doc = ${sql.json(stored(b.doc) as never)}, summary = ${sql.json((b.summary ?? {}) as never)}, updated_at = now()
        where course_id = ${id} and user_id = ${a.user.id} returning course_id`;
      if (!done.length) throw new ApiError(409, "No draft to save into");
    }
    await draftCheckpoint(sql, id, a.user.id);
    // (the course's version now: the app says when the course moved on since the draft started)
    const [c] = await sql`select version from courses where id = ${id}`;
    return { ok: true, version: c.version };
  });

  app.put<Id>("/api/courses/:id/draft/photo", BIG, async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    const { data } = parse(z.object({ data: z.string().max(60 << 20).regex(IMAGE, "Not an image") }), req.body);
    const done = await sql`update course_drafts set photo = ${data}, updated_at = now() where course_id = ${id} and user_id = ${a.user.id} returning course_id`;
    if (!done.length) throw new ApiError(409, "No draft to save into");
    return { ok: true };
  });

  app.get<Id>("/api/courses/:id/draft/photo", async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    const [d] = await sql`select photo from course_drafts where course_id = ${id} and user_id = ${a.user.id}`;
    return { data: d?.photo ?? null };
  });

  app.delete<Id>("/api/courses/:id/draft", async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    await sql`delete from course_drafts where course_id = ${id} and user_id = ${a.user.id}`;
    return { ok: true };
  });

  // --- Publishing a draft (merged with the main version by the app)
  app.post<Id>("/api/courses/:id/publish", BIG, async req => {
    const { id } = parse(ids, req.params);
    const { a, role: r } = await role(req, id, "editor");
    const [c] = await sql`select approval from courses where id = ${id}`;
    if (c.approval && r !== "owner") throw new ApiError(403, "This course needs the owner's OK: submit it");
    const b = parse(published, req.body);
    const version = await publish(id, b, a.user.id, null);
    await sql`delete from course_drafts where course_id = ${id} and user_id = ${a.user.id}`;
    await audit(sql, req, "course.published", { course: id, version, note: b.note });
    return { version };
  });

  // Your draft saved by hand, with a name, to come back to from the history
  app.post<Id>("/api/courses/:id/draft/save", async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    const b = parse(z.object({ note }), req.body);
    if (!(await saveDraft(sql, id, a.user.id, b.note || "Saved draft"))) throw new ApiError(409, "No draft to save");
    return { ok: true };
  });

  // --- Sent for the owner's OK
  type Sub = { Params: { id: string; sid: string } };
  const subIds = z.object({ id: z.uuid("Not found"), sid: z.uuid("Not found") });

  app.post<Id>("/api/courses/:id/submissions", async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    const b = parse(z.object({ note }), req.body);
    const sid = await sql.begin(async tx => {
      const [d] = await tx`delete from course_drafts where course_id = ${id} and user_id = ${a.user.id} returning doc, base_doc, base_version, photo, summary`;
      if (!d) throw new ApiError(409, "No draft to submit");
      const [s] = await tx`
        insert into course_submissions (course_id, user_id, doc, base_doc, base_version, photo, summary, note)
        values (${id}, ${a.user.id}, ${tx.json(d.doc)}, ${tx.json(d.base_doc)}, ${d.base_version}, ${d.photo}, ${tx.json(d.summary)}, ${b.note}) returning id`;
      return s.id as string;
    });
    await audit(sql, req, "course.submitted", { course: id, submission: sid });
    return { id: sid };
  });

  app.get<Id>("/api/courses/:id/submissions", async req => {
    const { id } = parse(ids, req.params);
    const { a, role: r } = await role(req, id, "editor");
    const rows = await sql`
      select s.id, s.note, s.created_at, s.summary, u.display_name, u.id as user_id from course_submissions s left join users u on u.id = s.user_id
      where s.course_id = ${id} and s.status = 'pending' and (${r === "owner"} or s.user_id = ${a.user.id}) order by s.created_at`;
    return rows.map(s => ({ id: s.id, note: s.note, createdAt: s.created_at, by: s.display_name, byId: s.user_id, summary: s.summary }));
  });

  const findSub = async (courseId: string, sid: string) => {
    const [s] = await sql`select * from course_submissions where id = ${sid} and course_id = ${courseId} and status = 'pending'`;
    if (!s) throw new ApiError(404, "Not found");
    return s;
  };

  app.get<Sub>("/api/courses/:id/submissions/:sid", async req => {
    const { id, sid } = parse(subIds, req.params);
    const { a, role: r } = await role(req, id, "editor");
    const s = await findSub(id, sid);
    if (r !== "owner" && s.user_id !== a.user.id) throw new ApiError(404, "Not found");
    return { doc: s.doc, baseDoc: s.base_doc, baseVersion: s.base_version, note: s.note, photo: s.photo };
  });

  app.post<Sub>("/api/courses/:id/submissions/:sid/accept", BIG, async req => {
    const { id, sid } = parse(subIds, req.params);
    const { a } = await role(req, id, "owner");
    const s = await findSub(id, sid);
    const b = parse(published, req.body);
    const version = await publish(id, { ...b, note: b.note || s.note }, s.user_id, a.user.id);
    await sql`update course_submissions set status = 'accepted', decided_by = ${a.user.id}, decided_at = now() where id = ${sid}`;
    await audit(sql, req, "course.accepted", { course: id, submission: sid, version });
    return { version };
  });

  app.post<Sub>("/api/courses/:id/submissions/:sid/decline", async req => {
    const { id, sid } = parse(subIds, req.params);
    const { a, role: r } = await role(req, id, "editor");
    const s = await findSub(id, sid);
    // (the owner declines; whoever sent it can take it back)
    if (r !== "owner" && s.user_id !== a.user.id) throw new ApiError(404, "Not found");
    const status = s.user_id === a.user.id && r !== "owner" ? "withdrawn" : "declined";
    const { note: said } = parse(z.object({ note: z.string().trim().max(1000).default("") }), req.body);
    await sql`update course_submissions set status = ${status}, decided_by = ${a.user.id}, decided_at = now(), decision_note = ${said} where id = ${sid}`;
    // (the sender hears of it, with what the owner said; their changes come back into their draft)
    if (status === "declined" && s.user_id) {
      await sql`insert into notifications (user_id, course_id, kind, by_id, text) values (${s.user_id}, ${id}, 'declined', ${a.user.id}, ${said || s.note})`;
      await sql`
        insert into course_drafts (course_id, user_id, doc, base_doc, base_version, photo, summary)
        values (${id}, ${s.user_id}, ${sql.json(s.doc)}, ${sql.json(s.base_doc)}, ${s.base_version}, ${s.photo}, ${sql.json(s.summary)})
        on conflict (course_id, user_id) do nothing`;
    }
    await audit(sql, req, `course.${status}`, { course: id, submission: sid });
    return { ok: true };
  });

  // --- The history

  app.get<Id>("/api/courses/:id/versions", async req => {
    const { id } = parse(ids, req.params);
    const { a } = await role(req, id, "editor");
    const rows = await sql`
      select v.id, v.version, v.kind, v.note, v.created_at, v.summary, u.display_name as by, ap.display_name as approved_by
      from course_versions v left join users u on u.id = v.by_user left join users ap on ap.id = v.approved_by
      where v.course_id = ${id} and (v.kind <> 'draft' or v.by_user = ${a.user.id}) order by v.id desc limit 300`;
    return rows.map(v => ({ id: Number(v.id), version: v.version, kind: v.kind, note: v.note, at: v.created_at, by: v.by, approvedBy: v.approved_by, summary: v.summary }));
  });

  type Ver = { Params: { id: string; vid: string } };
  const verIds = z.object({ id: z.uuid("Not found"), vid: z.coerce.number().int().positive() });
  const findVersion = async (courseId: string, vid: number, userId: string) => {
    const [v] = await sql`
      select v.version, v.doc, v.kind, v.by_user, p.data as photo from course_versions v left join course_photos p on p.course_id = v.course_id and p.sha = v.photo_sha
      where v.id = ${vid} and v.course_id = ${courseId}`;
    // (someone else's draft is theirs alone)
    if (!v || (v.kind === "draft" && v.by_user !== userId)) throw new ApiError(404, "Not found");
    return v;
  };

  // Any version (or a checkpoint of your draft) into your own draft: it starts from the course as
  // it is now, and Publish puts it in
  app.post<Ver>("/api/courses/:id/versions/:vid/to-draft", async req => {
    const { id, vid } = parse(verIds, req.params);
    const { a } = await role(req, id, "editor");
    const v = await findVersion(id, vid, a.user.id);
    const [c] = await sql`select doc, version, summary from courses where id = ${id}`;
    await sql`
      insert into course_drafts (course_id, user_id, doc, base_doc, base_version, summary)
      values (${id}, ${a.user.id}, ${sql.json(v.doc)}, ${sql.json(c.doc)}, ${c.version}, ${sql.json(c.summary)})
      on conflict (course_id, user_id) do update set doc = excluded.doc, base_doc = excluded.base_doc, base_version = excluded.base_version, updated_at = now()`;
    await audit(sql, req, "draft.from-version", { course: id, version: v.version });
    return { ok: true };
  });

  app.get<Ver>("/api/courses/:id/versions/:vid", async req => {
    const { id, vid } = parse(verIds, req.params);
    const { a } = await role(req, id, "editor");
    const v = await findVersion(id, vid, a.user.id);
    return { version: v.version, doc: v.doc, photo: v.photo ?? null };
  });

  app.post<Ver>("/api/courses/:id/versions/:vid/restore", async req => {
    const { id, vid } = parse(verIds, req.params);
    const { a, role: r } = await role(req, id, "editor");
    const [c] = await sql`select approval from courses where id = ${id}`;
    if (c.approval && r !== "owner") throw new ApiError(403, "Only an owner can do that");
    const v = await findVersion(id, vid, a.user.id);
    if (v.kind === "draft") throw new ApiError(400, "Bring a draft's checkpoint into your draft instead");
    const version = await sql.begin(async tx => {
      await keepCurrent(tx, id);
      const [done] = await tx`
        update courses set doc = ${tx.json(v.doc)}, name = ${v.doc.name ?? ""}, holes = ${(v.doc.holes ?? []).length},
          version = version + 1, updated_by = ${a.user.id}, updated_at = now()
        where id = ${id} returning version`;
      if (v.photo) await tx`insert into course_backgrounds (course_id, data) values (${id}, ${v.photo}) on conflict (course_id) do update set data = excluded.data, updated_at = now()`;
      else await tx`delete from course_backgrounds where course_id = ${id}`;
      await snapshot(tx, id, "restore", `Restored version ${v.version}`, a.user.id);
      // (your draft goes: it was on top of what was restored away)
      await tx`delete from course_drafts where course_id = ${id} and user_id = ${a.user.id}`;
      return done.version as number;
    });
    await audit(sql, req, "course.restored", { course: id, from: v.version, version });
    return { version };
  });
}
