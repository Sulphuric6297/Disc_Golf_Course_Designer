// Putting a draft into a course that changed meanwhile (three ways: what the draft started from,
// the course as it is now, and the draft). Holes, features and layouts are matched one by one by
// their id; each other part of the course (its style, terrain, rules…) as a whole. What only one
// side changed is kept; what both changed takes the draft's, and is listed.
import type { CourseDoc } from "../types";

type Doc = Record<string, unknown>;
type Entity = { id: string } & Record<string, unknown>;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The parts matched one by one. */
const LISTS = ["holes", "items", "layouts"] as const;
/** Never merged: the photo goes its own way. */
const SKIP = new Set(["background"]);

function mergeList(base: Entity[] = [], theirs: Entity[] = [], mine: Entity[] = [], clash: (id: string, e: Entity) => void) {
  const b = new Map(base.map(e => [e.id, e]));
  const t = new Map(theirs.map(e => [e.id, e]));
  const m = new Map(mine.map(e => [e.id, e]));
  const pick = (id: string): Entity | undefined => {
    const [x, y, z] = [b.get(id), t.get(id), m.get(id)];
    if (same(y, z)) return y;
    if (same(x, z)) return y; // only theirs changed (or removed it)
    if (same(x, y)) return z; // only mine changed (or removed it)
    clash(id, (z ?? y)!);
    return z;
  };
  // In the draft's order; what only the course has now goes where it is there
  const out: Entity[] = [];
  const seen = new Set<string>();
  for (const e of mine) { seen.add(e.id); const k = pick(e.id); if (k) out.push(k); }
  theirs.forEach((e, i) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    const k = pick(e.id);
    if (k) out.splice(Math.min(i, out.length), 0, k);
  });
  for (const e of base) if (!seen.has(e.id)) pick(e.id); // (gone on both sides: stays gone)
  return out;
}

export interface Merged { doc: CourseDoc; clashes: string[] }

export function mergeCourse(base: Doc, theirs: Doc, mine: Doc): Merged {
  const clashes: string[] = [];
  const out: Doc = {};
  const holeName = (e: Entity) => (typeof e.name === "string" && e.name) || "a hole";
  let features = 0;
  for (const key of new Set([...Object.keys(base), ...Object.keys(theirs), ...Object.keys(mine)])) {
    if (SKIP.has(key)) { out[key] = mine[key] ?? theirs[key]; continue; }
    if ((LISTS as readonly string[]).includes(key)) {
      out[key] = mergeList(base[key] as Entity[], theirs[key] as Entity[], mine[key] as Entity[], (_, e) => {
        if (key === "holes") clashes.push(holeName(e));
        else if (key === "items") features++;
        else clashes.push("a layout");
      });
      continue;
    }
    const [x, y, z] = [base[key], theirs[key], mine[key]];
    if (same(y, z) || same(x, z)) out[key] = y;
    else if (same(x, y)) out[key] = z;
    else { out[key] = z; clashes.push(key === "style" ? "the map's style" : key === "name" ? "the course's name" : `the course's ${key}`); }
  }
  if (features) clashes.push(features === 1 ? "a feature" : `${features} features`);
  return { doc: out as unknown as CourseDoc, clashes };
}

/** What a draft changes, counted: for the publish dialog. */
export function changesBetween(before: Doc, after: Doc) {
  // (tees and baskets are their holes': counted with them, not as features)
  const holePart = (e: Entity) => e.type === "tee" || e.type === "basket";
  const count = (key: "holes" | "items") => {
    const list = (d: Doc) => ((d[key] ?? []) as Entity[]).filter(e => key === "holes" || !holePart(e));
    const a = new Map(list(before).map(e => [e.id, e]));
    const b = new Map(list(after).map(e => [e.id, e]));
    let added = 0, removed = 0, changed = 0;
    for (const [id, e] of b) { const o = a.get(id); if (!o) added++; else if (!same(o, e)) changed++; }
    for (const id of a.keys()) if (!b.has(id)) removed++;
    return { added, removed, changed };
  };
  const other = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => !SKIP.has(k) && k !== "holes" && k !== "items" && !same(before[k], after[k]));
  return { holes: count("holes"), items: count("items"), other };
}
