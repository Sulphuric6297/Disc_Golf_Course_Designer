// A park's fields, courts and play areas: their kinds, their usual outlines (put down with one
// click), where a ball field's home plate is, and how many courts an outline holds.
import { FIELD_KINDS } from "../constants";
import type { AreaItem, FieldKind, P } from "../types";
import { createArea } from "./course";
import { dist } from "./geom";
import { orientedBox } from "./structures";

export const isBallField = (k: FieldKind) => k === "baseball" || k === "softball";
export const COURT_FIELDS: FieldKind[] = ["tennis", "pickleball", "basketball", "volleyball"];
/** The kinds in the order they're offered. */
export const FIELD_ORDER = Object.keys(FIELD_KINDS) as FieldKind[];
/** The kinds with markings that can be turned from the outline's long side. */
export const MARKED_FIELDS: FieldKind[] = ["soccer", "football", "multi", "tennis", "pickleball", "basketball", "volleyball", "track", "pool", "skate", "playground", "garden"];

/** What a field is (unset: a plain sports field). */
export const fieldKindOf = (a: Pick<AreaItem, "field">): FieldKind => a.field ?? "multi";
/** A field's kind in a sentence ("throws across a ball field"). */
export const fieldWord = (k: FieldKind) => (isBallField(k) ? "ball field" : FIELD_KINDS[k].label.toLowerCase());

/** A field's outline at its usual size round `at`, north up: a ball field as a fan from home plate
 * (at the bottom left, the foul lines out north and east), the rest as rectangles. */
export const fieldOutline = (k: FieldKind, at: P): P[] => {
  const [w, h] = FIELD_KINDS[k].size;
  if (isBallField(k)) {
    const home = { x: at.x - w / 2, y: at.y + h / 2 };
    const arc = Array.from({ length: 7 }, (_, i) => {
      const a = -(i / 6) * (Math.PI / 2);
      return { x: home.x + Math.cos(a) * w, y: home.y + Math.sin(a) * h };
    });
    return [home, ...arc];
  }
  return [{ x: at.x - w / 2, y: at.y - h / 2 }, { x: at.x + w / 2, y: at.y - h / 2 }, { x: at.x + w / 2, y: at.y + h / 2 }, { x: at.x - w / 2, y: at.y + h / 2 }];
};

/** A new field with this outline, in play or out of it as its kind usually is. */
export const createField = (k: FieldKind, points: P[], holeId?: string): AreaItem => ({
  ...createArea("field", points, holeId), field: k, ...(FIELD_KINDS[k].outOfPlay ? { outOfPlay: true } : {})
});

/** Fields no tree stands in (a playground, a dog park or a garden can have trees). */
export const treelessField = (k: FieldKind) => k !== "playground" && k !== "dog" && k !== "garden";
export const fieldKeepsTreesOut = (a: Pick<AreaItem, "kind" | "field">) => a.kind === "field" && treelessField(fieldKindOf(a));

/** Whether players stay out of it: its own setting, or what its kind starts with. */
export const fieldOutOfPlay = (a: Pick<AreaItem, "kind" | "field" | "outOfPlay">) => a.kind === "field" && (a.outOfPlay ?? !!FIELD_KINDS[fieldKindOf(a)].outOfPlay);

/** How far an outline runs on straight from corner `i`, one way round (`dir` 1 or -1). */
const straightRun = (pts: P[], i: number, dir: 1 | -1) => {
  const n = pts.length;
  const at = (k: number) => pts[(((i + k * dir) % n) + n) % n];
  const first = Math.atan2(at(1).y - at(0).y, at(1).x - at(0).x);
  let run = 0;
  for (let k = 0; k < n - 1; k++) {
    const a = at(k), b = at(k + 1);
    const turn = Math.atan2(b.y - a.y, b.x - a.x) - first;
    if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > (12 * Math.PI) / 180) break;
    run += dist(a, b);
  }
  return run;
};

/** A ball field's home plate: the corner nearest a right angle with long straight sides from it
 * (the point of a fan-shaped field, its foul lines). */
export const homeCorner = (pts: P[]) => {
  if (pts.length < 3) return 0;
  const long = 2 * orientedBox(pts).a || 1;
  let best = 0, bestScore = Infinity;
  pts.forEach((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    const ax = prev.x - p.x, ay = prev.y - p.y, bx = next.x - p.x, by = next.y - p.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-6 || lb < 1e-6) return;
    const angle = (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI;
    const run = Math.min(straightRun(pts, i, 1), straightRun(pts, i, -1));
    const score = Math.abs(angle - 90) / 45 + Math.max(0, 1 - run / long);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
};

/** A ball field's home plate corner: as set, or found. */
export const fieldHome = (a: Pick<AreaItem, "points" | "home">) => (a.home !== undefined && a.home >= 0 && a.home < a.points.length ? a.home : homeCorner(a.points));

/** How many courts of this kind an outline holds (side by side or end to end, as they fit best). */
export const courtCount = (k: FieldKind, pts: P[]) => {
  if (!COURT_FIELDS.includes(k) || pts.length < 3) return 1;
  return courtGrid(k, pts).n;
};

/** How courts lie in an outline: `nx` along its long side, `ny` across, and whether each court's
 * length runs across the outline (`across`). */
export const courtGrid = (k: FieldKind, pts: P[]) => {
  const box = orientedBox(pts);
  const long = box.a * 2, short = box.b * 2;
  const [cl, cw] = FIELD_KINDS[k].size;
  const fit = (alongLong: number, alongShort: number) => {
    const nx = Math.max(1, Math.round(long / alongLong)), ny = Math.max(1, Math.round(short / alongShort));
    return { nx, ny, n: nx * ny, miss: Math.abs(long - nx * alongLong) / long + Math.abs(short - ny * alongShort) / short };
  };
  const across = fit(cw, cl), along = fit(cl, cw);
  const best = across.miss <= along.miss ? { ...across, across: true } : { ...along, across: false };
  return { ...best, n: Math.min(12, best.n) };
};
