// A course's changes as the parts they change, for editing it together live: the holes, features
// and layouts one by one (by their id), and each of the course's other parts (its style, its
// name, the ground…) as a whole. The photo goes its own way. The server puts them in the same way
// (server/src/live.ts).
import type { CourseDoc } from "../types";

export const LISTS = ["holes", "items", "layouts"] as const;
type List = (typeof LISTS)[number];
type Entity = { id: string } & Record<string, unknown>;
type Doc = Record<string, unknown>;

export type Change =
  | { op: "put"; list: List; value: Entity }
  | { op: "del"; list: List; id: string }
  | { op: "order"; list: List; ids: string[] }
  | { op: "set"; key: string; value: unknown };

/** Parts never sent as changes (the photo is sent on its own; the id is the course's). */
const SKIP = new Set<string>(["background", "id", ...LISTS]);
const listOf = (d: Doc, l: List) => ((d[l] ?? []) as Entity[]);

/** What turns `from` into `to`. Parts compared as the same object (a change makes a new one), so
 * it costs little however big the course. */
export function changesBetween(from: CourseDoc, to: CourseDoc): Change[] {
  const a = from as unknown as Doc, b = to as unknown as Doc;
  const out: Change[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (SKIP.has(k) || a[k] === b[k]) continue;
    out.push({ op: "set", key: k, value: b[k] });
  }
  for (const l of LISTS) {
    const x = listOf(a, l), y = listOf(b, l);
    if (x === y) continue;
    const was = new Map(x.map(e => [e.id, e]));
    const now = new Set(y.map(e => e.id));
    for (const e of y) if (was.get(e.id) !== e) out.push({ op: "put", list: l, value: e });
    for (const e of x) if (!now.has(e.id)) out.push({ op: "del", list: l, id: e.id });
    // (moved about, not only added or taken out: the new order)
    const kept = x.filter(e => now.has(e.id)).map(e => e.id), seen = new Set(kept);
    const expected = [...kept, ...y.filter(e => !seen.has(e.id)).map(e => e.id)];
    if (expected.length !== y.length || expected.some((id, i) => id !== y[i].id)) out.push({ op: "order", list: l, ids: y.map(e => e.id) });
  }
  return out;
}

/** The changes put into a course (a new one: what didn't change stays the same object). */
export function applyChanges(doc: CourseDoc, changes: Change[]): CourseDoc {
  if (!changes.length) return doc;
  const d = { ...(doc as unknown as Doc) };
  const copied = new Set<List>();
  const list = (l: List) => {
    if (!copied.has(l)) { d[l] = [...listOf(d, l)]; copied.add(l); }
    return d[l] as Entity[];
  };
  for (const c of changes) {
    if (c.op === "set") {
      if (c.value === undefined) delete d[c.key];
      else d[c.key] = c.value;
    } else if (c.op === "put") {
      const xs = list(c.list), i = xs.findIndex(e => e.id === c.value.id);
      if (i >= 0) xs[i] = c.value;
      else xs.push(c.value);
    } else if (c.op === "del") {
      const xs = list(c.list), i = xs.findIndex(e => e.id === c.id);
      if (i >= 0) xs.splice(i, 1);
    } else {
      const at = new Map(c.ids.map((x, i) => [x, i]));
      list(c.list).sort((p, q) => (at.get(p.id) ?? Infinity) - (at.get(q.id) ?? Infinity));
    }
  }
  return d as unknown as CourseDoc;
}

/** The part of a course a change is to ("items:abc", "set:style", "order:holes"). */
export const partOf = (c: Change) => (c.op === "set" ? `set:${c.key}` : c.op === "order" ? `order:${c.list}` : `${c.list}:${c.op === "put" ? c.value.id : c.id}`);

/** That part of a course as it is (compared as the same object; an order as its ids). */
export function partIn(doc: CourseDoc, part: string): unknown {
  const d = doc as unknown as Doc;
  const [kind, rest] = [part.slice(0, part.indexOf(":")), part.slice(part.indexOf(":") + 1)];
  if (kind === "set") return d[rest];
  if (kind === "order") return listOf(d, rest as List).map(e => e.id).join("\n");
  return listOf(d, kind as List).find(e => e.id === rest);
}

/**
 * Someone else's changes put into a document of ours, leaving the parts we've changed and not
 * sent yet (or sent, and not taken yet) as ours: the server takes ours after theirs, so ours stay.
 * `server`: the course as the server had it before these changes.
 */
export function theirsInto(doc: CourseDoc, server: CourseDoc, changes: Change[]) {
  const take = changes.filter(c => { const p = partOf(c); return partIn(doc, p) === partIn(server, p); });
  return take.length === changes.length ? applyChanges(doc, changes) : applyChanges(doc, take);
}
