// Putting a draft into a course that changed meanwhile (three ways: what the draft started from,
// the course as it is now, and the draft). Holes, features and layouts are matched one by one by
// their id; each other part of the course (its style, terrain, rules…) as a whole. What only one
// side changed is kept; what both changed is a clash: the draft's is taken unless the person
// picks the course's (`keepTheirs`).
import type { CourseDoc } from "../types";

type Doc = Record<string, unknown>;
type Entity = { id: string } & Record<string, unknown>;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The parts matched one by one. */
const LISTS = ["holes", "items", "layouts"] as const;
type List = (typeof LISTS)[number];
/** Never merged: the photo goes its own way. */
const SKIP = new Set(["background"]);

/** A part both sides changed: what it is called, and both of its versions (undefined: removed). */
export interface Clash { list: List | null; id: string; label: string; mine: unknown; theirs: unknown }

const holeName = (e: Entity | undefined, doc: Doc) => {
  if (e && typeof e.name === "string" && e.name) return e.name;
  const i = ((doc.holes ?? []) as Entity[]).findIndex(h => h.id === e?.id);
  return i >= 0 ? `Hole ${i + 1}` : "A hole";
};
const KIND: Record<string, string> = { tee: "A tee", basket: "A basket", area: "An area", line: "A line", tree: "A tree", amenity: "An amenity", label: "A label", mando: "A mando", dropzone: "A drop zone", structure: "A structure" };
const keyName = (k: string) => (k === "style" ? "The map's style" : k === "name" ? "The course's name" : k === "terrainHeights" ? "The ground" : `The course's ${k}`);

function mergeList(list: List, base: Entity[] = [], theirs: Entity[] = [], mine: Entity[] = [], clashes: Clash[], label: (e: Entity) => string) {
  const b = new Map(base.map(e => [e.id, e]));
  const t = new Map(theirs.map(e => [e.id, e]));
  const m = new Map(mine.map(e => [e.id, e]));
  const pick = (id: string): Entity | undefined => {
    const [x, y, z] = [b.get(id), t.get(id), m.get(id)];
    if (same(y, z)) return y;
    if (same(x, z)) return y; // only theirs changed (or removed it)
    if (same(x, y)) return z; // only mine changed (or removed it)
    clashes.push({ list, id, label: label((z ?? y)!), mine: z, theirs: y });
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

export interface Merged { doc: CourseDoc; clashes: Clash[] }

export function mergeCourse(base: Doc, theirs: Doc, mine: Doc): Merged {
  const clashes: Clash[] = [];
  const out: Doc = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(theirs), ...Object.keys(mine)])) {
    if (SKIP.has(key)) { out[key] = mine[key] ?? theirs[key]; continue; }
    if ((LISTS as readonly string[]).includes(key)) {
      const list = key as List;
      out[key] = mergeList(list, base[key] as Entity[], theirs[key] as Entity[], mine[key] as Entity[], clashes,
        e => (list === "holes" ? holeName(e, mine.holes ? mine : theirs) : list === "layouts" ? `A layout${typeof e.name === "string" ? ` (${e.name})` : ""}` : KIND[String(e.type)] ?? "A feature"));
      continue;
    }
    const [x, y, z] = [base[key], theirs[key], mine[key]];
    if (same(y, z) || same(x, z)) out[key] = y;
    else if (same(x, y)) out[key] = z;
    else { out[key] = z; clashes.push({ list: null, id: key, label: keyName(key), mine: z, theirs: y }); }
  }
  return { doc: out as unknown as CourseDoc, clashes };
}

/** The merged course with the course's version kept for the clashes picked (by index). */
export function keepTheirs(m: Merged, picked: Set<number>): CourseDoc {
  if (!picked.size) return m.doc;
  const out = { ...(m.doc as unknown as Doc) };
  m.clashes.forEach((c, i) => {
    if (!picked.has(i)) return;
    if (!c.list) { out[c.id] = c.theirs; return; }
    const list = [...((out[c.list] ?? []) as Entity[])];
    const at = list.findIndex(e => e.id === c.id);
    if (c.theirs === undefined) { if (at >= 0) list.splice(at, 1); }
    else if (at >= 0) list[at] = c.theirs as Entity;
    else list.push(c.theirs as Entity);
    out[c.list] = list;
  });
  return out as unknown as CourseDoc;
}

/** What a draft changes, counted. */
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

/** "Holes: 1 added, 2 changed · Features: 3 changed" (a version's name, when none is given) */
export function describeChanges(before: object, after: object) {
  const c = changesBetween(before as Doc, after as Doc);
  const part = (x: { added: number; removed: number; changed: number }, what: string) => {
    const bits = [x.added && `${x.added} added`, x.changed && `${x.changed} changed`, x.removed && `${x.removed} removed`].filter(Boolean);
    return bits.length ? `${what}: ${bits.join(", ")}` : "";
  };
  return [part(c.holes, "Holes"), part(c.items, "Features"), c.other.length ? "Course settings changed" : ""].filter(Boolean).join(" · ") || "No changes";
}

/** The holes a draft changes (their ids; a hole whose tee or basket moved counts). */
export function holesChanged(before: Doc, after: Doc) {
  const out = new Set<string>();
  const a = new Map(((before.holes ?? []) as Entity[]).map(e => [e.id, e]));
  for (const h of (after.holes ?? []) as Entity[]) if (!same(a.get(h.id), h)) out.add(h.id);
  const ai = new Map(((before.items ?? []) as Entity[]).map(e => [e.id, e]));
  for (const it of (after.items ?? []) as Entity[]) {
    if ((it.type === "tee" || it.type === "basket") && typeof it.holeId === "string" && !same(ai.get(it.id), it)) out.add(it.holeId);
  }
  return out;
}
