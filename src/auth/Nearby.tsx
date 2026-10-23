// Other courses in the same park, or on the same ground (each its own course): their holes drawn
// on this course's map, each in its color with its numbers, when switched on in the Site step (off
// at first); the park a course is in (its owner names it); and where this course's holes cross or
// come close to theirs (the Review step).
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { courseStats } from "../lib/holeStats";
import { normalizeCourse } from "../lib/course";
import { safeDoc } from "../lib/safeDoc";
import { withGround, type GroundShare } from "../lib/sharedGround";
import { getDoc } from "../state/course";
import { toast } from "../state/toast";
import { getView } from "../state/view";
import { inputCls, Section } from "../components/ui";
import { useCourse } from "../state/course";
import type { CourseDoc, P } from "../types";
import { api } from "./api";
import { openServerCourse, useServerCourse } from "./courses";

type Bounds = { north: number; south: number; west: number; east: number };
interface Near { id: string; name: string; park: string; samePark: boolean; role: string; bounds: Bounds; canvas: { width: number; height: number }; lines: [number, number][][] }

const COLORS = ["#f472b6", "#a78bfa", "#facc15", "#22d3ee", "#fb923c", "#4ade80"];
/** Closer than this between two courses' holes is a safety concern, ft. */
const TOO_CLOSE = 50;

export const useNearby = create<{ list: Near[]; shown: string[] }>(() => ({ list: [], shown: [] }));
const load = (id: string) => api<Near[]>("GET", `courses/${id}/nearby`).then(l => useNearby.setState({ list: l, shown: useNearby.getState().shown.filter(s => l.some(n => n.id === s)) }), () => {});

/** Another course's plan point, in this course's plan (by where both are on the earth). */
const into = (p: [number, number], from: Near, doc: CourseDoc): P | null => {
  const b = doc.site.bounds;
  if (!b) return null;
  const lon = from.bounds.west + (p[0] / from.canvas.width) * (from.bounds.east - from.bounds.west);
  const lat = from.bounds.north - (p[1] / from.canvas.height) * (from.bounds.north - from.bounds.south);
  return { x: ((lon - b.west) / (b.east - b.west)) * doc.canvas.width, y: ((b.north - lat) / (b.north - b.south)) * doc.canvas.height };
};
const linesIn = (n: Near, doc: CourseDoc) => n.lines.map(l => l.map(p => into(p, n, doc)).filter((q): q is P => !!q));

/** Loads the courses near the open one, and keeps them drawn on its map. */
export function NearbyLayer() {
  const id = useServerCourse(s => s.id);
  const preview = useServerCourse(s => s.preview);
  const { list, shown } = useNearby();
  const doc = useCourse(s => s.doc);
  useEffect(() => {
    useNearby.setState({ list: [], shown: [] });
    if (id) void load(id);
  }, [id]);
  useEffect(() => {
    const v = getView();
    if (!v) return;
    v.setNearby(preview ? [] : list.filter(n => shown.includes(n.id)).map(n => ({ color: COLORS[list.indexOf(n) % COLORS.length], lines: linesIn(n, doc) })));
  }, [list, shown, doc.site.bounds, doc.canvas, preview]);
  useEffect(() => () => getView()?.setNearby([]), []);
  return null;
}

// --- Safety between courses

const side = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
const crosses = (a: P, b: P, c: P, d: P) => side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
const toSegment = (p: P, a: P, b: P) => {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
/** The closest two lines come (0 when they cross). */
const gap = (m: P[], t: P[]) => {
  let best = Infinity;
  for (let i = 1; i < m.length; i++) for (let j = 1; j < t.length; j++) {
    if (crosses(m[i - 1], m[i], t[j - 1], t[j])) return 0;
    best = Math.min(best, toSegment(m[i - 1], t[j - 1], t[j]), toSegment(m[i], t[j - 1], t[j]), toSegment(t[j - 1], m[i - 1], m[i]), toSegment(t[j], m[i - 1], m[i]));
  }
  return best;
};

/** For each other course: this course's holes that cross or come close to its holes. */
function useConcerns() {
  const { list } = useNearby();
  const doc = useCourse(s => s.doc);
  return useMemo(() => {
    const mine = courseStats(doc).filter(s => s.complete);
    return list.map(n => {
      const theirs = linesIn(n, doc);
      const out: { mine: string; theirs: number; ft: number }[] = [];
      for (const s of mine) theirs.forEach((t, k) => { const g = gap(s.line, t); if (g < TOO_CLOSE) out.push({ mine: s.label, theirs: k + 1, ft: Math.round(g) }); });
      return out;
    });
  }, [list, doc]);
}

// --- One ground for the park: this course's terrain (and measured trees) copied to others

/** This course's ground into the others picked: straight in for an owner publishing as they go,
 * else into their draft. */
async function shareGround(ids: string[], trees: GroundShare) {
  const from = getDoc();
  let done = 0;
  for (const id of ids) {
    const c = await api<{ version: number; role: string; live: boolean; doc: CourseDoc }>("GET", `courses/${id}`);
    if (c.role === "viewer") continue;
    const to = withGround(normalizeCourse(safeDoc({ ...c.doc, background: null })), from, trees);
    const doc = { ...to, background: null };
    if (c.role === "owner" && c.live) await api("PUT", `courses/${id}`, { doc, version: c.version });
    else {
      const d = await api<{ draft: { doc: CourseDoc } | null }>("GET", `courses/${id}/draft`);
      const draft = d.draft ? { ...withGround(normalizeCourse(safeDoc({ ...d.draft.doc, background: null })), from, trees), background: null } : doc;
      await api("PUT", `courses/${id}/draft`, { doc: draft, base: d.draft ? undefined : { doc: { ...c.doc, background: null }, version: c.version } });
    }
    done++;
  }
  toast(done ? `This ground is in ${done} other course${done === 1 ? "" : "s"} now.` : "Nothing changed.", done ? "success" : "info");
}

/** The Site step: the park, and the other courses here (each with a switch). */
export function NearbyCourses() {
  const { list, shown } = useNearby();
  const { id, role, park } = useServerCourse();
  const concerns = useConcerns();
  const [parks, setParks] = useState<string[]>([]);
  const [sharing, setSharing] = useState<Set<string> | null>(null);
  const [withTrees, setWithTrees] = useState(true);
  const [withPlanted, setWithPlanted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState("");
  const [value, setValue] = useState(park);
  useEffect(() => { setValue(park); }, [park]);
  useEffect(() => { if (role === "owner") void api<{ park: string }[]>("GET", "courses").then(l => setParks([...new Set(l.map(c => c.park).filter(Boolean))]), () => {}); }, [role]);
  const savePark = async () => {
    if (!id || value.trim() === park) return;
    try { await api("POST", `courses/${id}/park`, { park: value.trim() }); } catch (e) { toast(`The park wasn't saved: ${e instanceof Error ? e.message : "try again"}.`, "error"); return; }
    useServerCourse.setState({ park: value.trim() });
    void load(id);
  };
  if (!id) return null;
  return (
    <Section title="Park" testid="nearby">
      {role === "owner" ? (
        <label className="block mb-2">
          <span className="sr-only">Park</span>
          <input className={inputCls} list="parks" placeholder="The park it's in (courses there show each other)" value={value} onChange={e => setValue(e.target.value)} onBlur={() => void savePark()}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Park" data-testid="park" />
          <datalist id="parks">{parks.map(p => <option key={p} value={p} />)}</datalist>
        </label>
      ) : park ? <p className="text-sm text-zinc-300 mb-2">{park}</p> : null}
      {list.length > 0 && (
        <>
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mt-2 mb-1">Other courses here</div>
          <ul className="space-y-1">
            {list.map((n, i) => (
              <li key={n.id} className="flex items-center gap-2 text-sm" data-testid="nearby-course">
                <input type="checkbox" checked={shown.includes(n.id)} aria-label={`Show ${n.name}`}
                  onChange={e => useNearby.setState({ shown: e.target.checked ? [...shown, n.id] : shown.filter(x => x !== n.id) })} />
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="flex-1 min-w-0 truncate text-zinc-200">{n.name}
                  <span className="block text-[11px] text-zinc-500">{n.samePark ? "Same park" : "On the same ground"}</span>
                  {concerns[i]?.length > 0 && <span className="block text-[11px] text-amber-300" data-testid="nearby-cross">{concerns[i].length} close call{concerns[i].length === 1 ? "" : "s"} with its holes</span>}
                </span>
                <button className="text-xs text-orange-300 hover:text-orange-200 disabled:opacity-50" disabled={opening === n.id} onClick={() => { setOpening(n.id); void openServerCourse(n.id).finally(() => setOpening("")); }}>{opening === n.id ? "Opening…" : "Open"}</button>
              </li>
            ))}
          </ul>
          {sharing ? (
            <div className="mt-3 rounded-lg border border-white/[0.12] p-3 space-y-2" data-testid="share-ground">
              <p className="text-sm text-zinc-200">This course's ground into:</p>
              {list.filter(n => n.role !== "viewer").map(n => (
                <label key={n.id} className="flex items-center gap-2 text-sm text-zinc-200">
                  <input type="checkbox" checked={sharing.has(n.id)} onChange={e => { const s = new Set(sharing); if (e.target.checked) s.add(n.id); else s.delete(n.id); setSharing(s); }} /> {n.name}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={withTrees} onChange={e => setWithTrees(e.target.checked)} /> And the measured trees</label>
              <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={withPlanted} onChange={e => setWithPlanted(e.target.checked)} data-testid="share-planted" /> And the trees planted by hand</label>
              <p className="text-[11px] text-zinc-500">Their holes, OB and everything drawn stay as they are. A tree cut down on one course stays on the others.</p>
              <div className="flex gap-2 justify-end">
                <button className="px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.09] rounded-lg" onClick={() => setSharing(null)}>Cancel</button>
                <button className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-400 text-zinc-950 disabled:opacity-50" disabled={busy || !sharing.size}
                  onClick={() => { setBusy(true); void shareGround([...sharing], { trees: withTrees, planted: withPlanted }).then(() => setSharing(null), e => toast(`The ground wasn't copied to every course: ${e instanceof Error ? e.message : "try again"}.`, "error")).finally(() => setBusy(false)); }} data-testid="share-ground-go">{busy ? "Copying…" : "Copy the ground"}</button>
              </div>
            </div>
          ) : list.some(n => n.role !== "viewer") && (
            <button className="mt-3 text-sm text-orange-300 hover:text-orange-200" onClick={() => setSharing(new Set(list.filter(n => n.role !== "viewer" && n.samePark).map(n => n.id)))} data-testid="share-ground-open">Share this ground with them…</button>
          )}
        </>
      )}
    </Section>
  );
}

/** The Review step: where this course's holes cross or come close to other courses' holes. */
export function NearbySafety() {
  const { list } = useNearby();
  const concerns = useConcerns();
  const any = concerns.some(c => c.length);
  if (!list.length) return null;
  return (
    <Section title="Other courses here" testid="nearby-safety">
      {!any ? <p className="text-xs text-zinc-400">No hole crosses or comes within {TOO_CLOSE} ft of theirs.</p> : (
        <ul className="space-y-1.5 text-sm">
          {list.map((n, i) => concerns[i].map(c => (
            <li key={`${n.id}:${c.mine}:${c.theirs}`} className="text-amber-200">
              Hole {c.mine} {c.ft === 0 ? "crosses" : `comes within ${c.ft} ft of`} {n.name}'s hole {c.theirs}
            </li>
          )))}
        </ul>
      )}
    </Section>
  );
}
