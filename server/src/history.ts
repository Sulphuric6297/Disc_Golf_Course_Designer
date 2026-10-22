// The history's versions of a course: the main version as it is, kept (with its aerial photo,
// stored once however many versions have it).
import type postgres from "postgres";
import { sha256 } from "./crypto.js";

type Tx = postgres.Sql | postgres.TransactionSql;

/** The autosaved versions kept for each course (the newest; the others go), and after how long
 * the automatic ones (autosaves, drafts' checkpoints) are thinned to one a day. */
const AUTOSAVES_KEPT = 100;
const THIN_AFTER = "30 days";
/** A draft's checkpoint at most this often. */
export const DRAFT_EVERY = 10 * 60_000;

/** Old automatic versions thinned to the last of each day (published, restored: kept). */
const thin = (tx: Tx, courseId: string) => tx`
  delete from course_versions v where v.course_id = ${courseId} and v.kind in ('autosave', 'draft')
    and v.created_at < now() - ${THIN_AFTER}::interval
    and v.id <> (select max(w.id) from course_versions w where w.course_id = v.course_id and w.kind = v.kind
      and coalesce(w.by_user::text, '') = coalesce(v.by_user::text, '') and date_trunc('day', w.created_at) = date_trunc('day', v.created_at))`;

/** A checkpoint of someone's draft (theirs alone to see), at most every ten minutes. */
export async function draftCheckpoint(tx: Tx, courseId: string, userId: string) {
  const [last] = await tx`select created_at from course_versions where course_id = ${courseId} and kind = 'draft' and by_user = ${userId} order by id desc limit 1`;
  if (last && Date.now() - last.created_at.getTime() < DRAFT_EVERY) return;
  const [d] = await tx`select doc, base_version, summary from course_drafts where course_id = ${courseId} and user_id = ${userId}`;
  if (!d) return;
  await tx`insert into course_versions (course_id, version, doc, summary, kind, by_user) values (${courseId}, ${d.base_version}, ${tx.json(d.doc)}, ${tx.json(d.summary)}, 'draft', ${userId})`;
  await thin(tx, courseId);
}

/** The main version into the history, if it isn't there yet (before something replaces it: the
 * owner's latest changes are never lost to a publish or a restore). */
export async function keepCurrent(tx: Tx, courseId: string) {
  const [c] = await tx`select version, updated_by from courses where id = ${courseId}`;
  const [v] = await tx`select version from course_versions where course_id = ${courseId} order by id desc limit 1`;
  if (!v || v.version !== c.version) await snapshot(tx, courseId, "autosave", "", c.updated_by);
}

/** Someone's draft saved by hand, named (theirs alone to see, kept like the others). */
export async function saveDraft(tx: Tx, courseId: string, userId: string, note: string) {
  const [d] = await tx`select doc, base_version, summary from course_drafts where course_id = ${courseId} and user_id = ${userId}`;
  if (!d) return false;
  await tx`insert into course_versions (course_id, version, doc, summary, kind, note, by_user) values (${courseId}, ${d.base_version}, ${tx.json(d.doc)}, ${tx.json(d.summary)}, 'draft', ${note}, ${userId})`;
  return true;
}

/** The main version as it is now, into the history. */
export async function snapshot(tx: Tx, courseId: string, kind: "created" | "autosave" | "publish" | "restore", note: string, by: string | null, approvedBy: string | null = null) {
  const [c] = await tx`select version, doc, summary from courses where id = ${courseId}`;
  const [b] = await tx`select data from course_backgrounds where course_id = ${courseId}`;
  let sha: Buffer | null = null;
  if (b) {
    sha = sha256(b.data);
    await tx`insert into course_photos (course_id, sha, data) values (${courseId}, ${sha}, ${b.data}) on conflict do nothing`;
  }
  await tx`
    insert into course_versions (course_id, version, doc, photo_sha, summary, kind, note, by_user, approved_by)
    values (${courseId}, ${c.version}, ${tx.json(c.doc)}, ${sha}, ${tx.json(c.summary)}, ${kind}, ${note}, ${by}, ${approvedBy})`;
  if (kind === "autosave") {
    await thin(tx, courseId);
    await tx`
      delete from course_versions where course_id = ${courseId} and kind = 'autosave'
        and id not in (select id from course_versions where course_id = ${courseId} and kind = 'autosave' order by id desc limit ${AUTOSAVES_KEPT})`;
  }
}
