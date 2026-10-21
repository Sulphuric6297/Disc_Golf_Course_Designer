// The history's versions of a course: the main version as it is, kept (with its aerial photo,
// stored once however many versions have it).
import type postgres from "postgres";
import { sha256 } from "./crypto.js";

type Tx = postgres.Sql | postgres.TransactionSql;

/** The autosaved versions kept for each course (the newest; the others go). */
const AUTOSAVES_KEPT = 100;

/** The main version into the history, if it isn't there yet (before something replaces it: the
 * owner's latest changes are never lost to a publish or a restore). */
export async function keepCurrent(tx: Tx, courseId: string) {
  const [c] = await tx`select version, updated_by from courses where id = ${courseId}`;
  const [v] = await tx`select version from course_versions where course_id = ${courseId} order by id desc limit 1`;
  if (!v || v.version !== c.version) await snapshot(tx, courseId, "autosave", "", c.updated_by);
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
    await tx`
      delete from course_versions where course_id = ${courseId} and kind = 'autosave'
        and id not in (select id from course_versions where course_id = ${courseId} and kind = 'autosave' order by id desc limit ${AUTOSAVES_KEPT})`;
  }
}
