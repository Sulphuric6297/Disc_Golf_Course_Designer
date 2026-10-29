// What changed between two versions of a course (History's Compare): holes, features and layouts
// matched one by one by their id; each other part of the course (its style, terrain, rules…) as a
// whole.
type Doc = Record<string, unknown>;
type Entity = { id: string } & Record<string, unknown>;

// (each object's JSON made once: the terrain and ground paint stay the same objects from one
// change to the next, and are big)
const json = new WeakMap<object, string>();
const text = (v: unknown) => {
  if (!v || typeof v !== "object") return JSON.stringify(v);
  let t = json.get(v);
  if (t === undefined) json.set(v, (t = JSON.stringify(v)));
  return t;
};
const same = (a: unknown, b: unknown) => a === b || text(a) === text(b);

/** Never compared: the photo goes its own way. */
const SKIP = new Set(["background"]);

/** What changed, counted. */
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
  // (a hole whose tee or basket moved, came or went changed too, though the hole itself didn't:
  // counted once, and only for a hole on both sides)
  const holes = count("holes");
  const was = new Map(((before.holes ?? []) as Entity[]).map(h => [h.id, h]));
  const touched = new Set([...holesChanged(before, after), ...holesChanged(after, before)]);
  for (const h of (after.holes ?? []) as Entity[]) if (touched.has(h.id) && was.has(h.id) && same(was.get(h.id), h)) holes.changed++;
  return { holes, items: count("items"), other };
}

/** "Holes: 1 added, 2 changed · On the map: 3 changed" (a version's name, when none is given) */
export function describeChanges(before: object, after: object) {
  const c = changesBetween(before as Doc, after as Doc);
  const part = (x: { added: number; removed: number; changed: number }, what: string) => {
    const bits = [x.added && `${x.added} added`, x.changed && `${x.changed} changed`, x.removed && `${x.removed} removed`].filter(Boolean);
    return bits.length ? `${what}: ${bits.join(", ")}` : "";
  };
  return [part(c.holes, "Holes"), part(c.items, "On the map"), c.other.length ? "Course settings changed" : ""].filter(Boolean).join(" · ") || "No changes";
}

/** The holes that changed (their ids; a hole whose tee or basket moved counts). */
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
