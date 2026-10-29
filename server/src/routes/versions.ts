// A course's history. Everyone who can change a course changes it live, and the course keeps its
// versions as it goes: when it's made, now and then while it's changed, and each restore. Looking
// at one changes nothing; restoring one makes a new version, so nothing is lost.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteCtx } from "../app.js";
import { ApiError, audit, parse } from "../http.js";
import { keepCurrent, snapshot } from "../history.js";
import { ids, roleOn, type Id } from "./courses.js";

export async function versionRoutes(app: FastifyInstance, { sql, live }: RouteCtx) {
  const role = roleOn(sql);

  app.get<Id>("/api/courses/:id/versions", async req => {
    const { id } = parse(ids, req.params);
    await role(req, id, "editor");
    // (drafts' checkpoints from before live editing: their author's alone, not the course's)
    const rows = await sql`
      select v.id, v.version, v.kind, v.note, v.created_at, v.summary, u.display_name as by, ap.display_name as approved_by
      from course_versions v left join users u on u.id = v.by_user left join users ap on ap.id = v.approved_by
      where v.course_id = ${id} and v.kind <> 'draft' order by v.id desc limit 300`;
    return rows.map(v => ({ id: Number(v.id), version: v.version, kind: v.kind, note: v.note, at: v.created_at, by: v.by, approvedBy: v.approved_by, summary: v.summary }));
  });

  type Ver = { Params: { id: string; vid: string } };
  const verIds = z.object({ id: z.uuid("Not found"), vid: z.coerce.number().int().positive() });
  const findVersion = async (courseId: string, vid: number) => {
    const [v] = await sql`
      select v.version, v.doc, v.kind, p.data as photo from course_versions v left join course_photos p on p.course_id = v.course_id and p.sha = v.photo_sha
      where v.id = ${vid} and v.course_id = ${courseId} and v.kind <> 'draft'`;
    if (!v) throw new ApiError(404, "Not found");
    return v;
  };

  app.get<Ver>("/api/courses/:id/versions/:vid", async req => {
    const { id, vid } = parse(verIds, req.params);
    await role(req, id, "editor");
    const v = await findVersion(id, vid);
    return { version: v.version, doc: v.doc, photo: v.photo ?? null };
  });

  app.post<Ver>("/api/courses/:id/versions/:vid/restore", async req => {
    const { id, vid } = parse(verIds, req.params);
    const { a } = await role(req, id, "editor");
    const v = await findVersion(id, vid);
    // (what's open live goes in first, then into the history before it's replaced)
    await live.settle(id);
    const version = await sql.begin(async tx => {
      await keepCurrent(tx, id);
      const [done] = await tx`
        update courses set doc = ${tx.json(v.doc)}, name = ${v.doc.name ?? ""}, holes = ${(v.doc.holes ?? []).length},
          version = version + 1, updated_by = ${a.user.id}, updated_at = now()
        where id = ${id} returning version`;
      if (v.photo) await tx`insert into course_backgrounds (course_id, data) values (${id}, ${v.photo}) on conflict (course_id) do update set data = excluded.data, updated_at = now()`;
      else await tx`delete from course_backgrounds where course_id = ${id}`;
      await snapshot(tx, id, "restore", `Restored version ${v.version}`, a.user.id);
      return done.version as number;
    });
    await live.changed(id);
    live.photo(id);
    await audit(sql, req, "course.restored", { course: id, from: v.version, version });
    return { version };
  });
}
