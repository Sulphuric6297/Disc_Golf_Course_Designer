// Other courses on the same ground (a park with several courses, each its own course): their
// holes drawn on this course's map, each in its color, when switched on in the Site step (off at
// first).
import { useEffect, useMemo } from "react";
import { courseStats } from "../lib/holeStats";
import { create } from "zustand";
import { getView } from "../components/MapViewport";
import { Section } from "../components/ui";
import { useCourse } from "../state/course";
import type { CourseDoc, P } from "../types";
import { api } from "./api";
import { openServerCourse, useServerCourse } from "./courses";

type Bounds = { north: number; south: number; west: number; east: number };
interface Near { id: string; name: string; role: string; bounds: Bounds; canvas: { width: number; height: number }; lines: [number, number][][] }

const COLORS = ["#f472b6", "#a78bfa", "#facc15", "#22d3ee", "#fb923c", "#4ade80"];

export const useNearby = create<{ list: Near[]; shown: string[] }>(() => ({ list: [], shown: [] }));

/** Another course's plan point, in this course's plan (by where both are on the earth). */
const into = (p: [number, number], from: Near, doc: CourseDoc): P | null => {
  const b = doc.site.bounds;
  if (!b) return null;
  const lon = from.bounds.west + (p[0] / from.canvas.width) * (from.bounds.east - from.bounds.west);
  const lat = from.bounds.north - (p[1] / from.canvas.height) * (from.bounds.north - from.bounds.south);
  return { x: ((lon - b.west) / (b.east - b.west)) * doc.canvas.width, y: ((b.north - lat) / (b.north - b.south)) * doc.canvas.height };
};

/** Loads the courses near the open one, and keeps them drawn on its map. */
export function NearbyLayer() {
  const id = useServerCourse(s => s.id);
  const preview = useServerCourse(s => s.preview);
  const { list, shown } = useNearby();
  const doc = useCourse(s => s.doc);
  useEffect(() => {
    useNearby.setState({ list: [], shown: [] });
    if (id) void api<Near[]>("GET", `courses/${id}/nearby`).then(l => useNearby.setState({ list: l, shown: [] }), () => {});
  }, [id]);
  useEffect(() => {
    const v = getView();
    if (!v) return;
    const draw = preview ? [] : list.filter(n => shown.includes(n.id)).map(n => ({
      color: COLORS[list.indexOf(n) % COLORS.length],
      lines: n.lines.map(l => l.map(p => into(p, n, doc)).filter((q): q is P => !!q))
    }));
    v.setNearby(draw);
  }, [list, shown, doc.site.bounds, doc.canvas, preview]);
  useEffect(() => () => getView()?.setNearby([]), []);
  return null;
}

const crosses = (a: P, b: P, c: P, d: P) => {
  const o = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
};
/** How many of another course's holes this course's throw lines cross (a safety concern). */
const crossings = (mine: P[][], theirs: P[][]) => theirs.filter(t => mine.some(m => {
  for (let i = 1; i < m.length; i++) for (let j = 1; j < t.length; j++) if (crosses(m[i - 1], m[i], t[j - 1], t[j])) return true;
  return false;
})).length;

/** The Site step's list of them (nothing when there are none), and where they cross this one. */
export function NearbyCourses() {
  const { list, shown } = useNearby();
  const doc = useCourse(s => s.doc);
  const crossed = useMemo(() => {
    const mine = courseStats(doc).filter(s => s.complete).map(s => s.line);
    return list.map(n => crossings(mine, n.lines.map(l => l.map(p => into(p, n, doc)).filter((q): q is P => !!q))));
  }, [list, doc]);
  if (!list.length) return null;
  return (
    <Section title="Other courses here" testid="nearby">
      <ul className="space-y-1">
        {list.map((n, i) => (
          <li key={n.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shown.includes(n.id)} aria-label={`Show ${n.name}`}
              onChange={e => useNearby.setState({ shown: e.target.checked ? [...shown, n.id] : shown.filter(x => x !== n.id) })} />
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 min-w-0 truncate text-zinc-200">{n.name}{crossed[i] > 0 && <span className="block text-[11px] text-amber-300" data-testid="nearby-cross">This course crosses {crossed[i]} of its hole{crossed[i] === 1 ? "" : "s"}</span>}</span>
            <button className="text-xs text-orange-300 hover:text-orange-200" onClick={() => void openServerCourse(n.id)}>Open</button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
