// Flyovers: the camera's path over a hole, flown by itself (from behind the tee, along the line of
// play, up over the trees and down toward the basket) or through keyframes made by hand. Pure: the
// map view draws the pictures, the Export step works out a video's length.
import type { CourseDoc, FlyKey, FlyoverSettings, P } from "../types";
import { pathLength, pointAlong } from "./geom";

export const FLYOVER_DEFAULTS: FlyoverSettings = { height: 10, speed: 1, fov: 62, behind: 60, side: 0, lookAhead: 120,
  title: true, badge: true, pinDistance: true, courseName: true, discFlight: true, playLine: true, circle: true, ob: true, otherHoles: true, walks: true
};

/** A course's flyover settings, filled in (with a hole's own over them). */
export const flyoverOf = (doc: Pick<CourseDoc, "flyover">, hole?: { flyover?: Partial<FlyoverSettings> } | null): FlyoverSettings => ({ ...FLYOVER_DEFAULTS, ...doc.flyover, ...hole?.flyover });

/**
 * How a flight of `dur` seconds plays: its motion slowing gently to a stop over the end (the last
 * 2 s of it, at most a third, played over twice as long) and, by itself (`easeIn`), getting going
 * gently too. `play` is how long it plays; `at(t)` is where along the flight (s of its own time)
 * it is `t` s into playing. Speeds change smoothly: no jolt where the slowing starts or stops.
 */
export const flightClock = (dur: number, easeIn: boolean) => {
  const out = Math.min(2, dur / 3), into = easeIn ? Math.min(1, dur * 0.15) : 0;
  const cruise = dur - out - into;
  const play = dur + out + into;
  const at = (t: number) => {
    if (t <= 0) return 0;
    if (t >= play) return dur;
    // Getting going: speed rising 0 to 1 over 2 * into
    if (t < 2 * into) {
      const u = t / (2 * into);
      return 2 * into * (u / 2 - Math.sin(Math.PI * u) / (2 * Math.PI));
    }
    if (t < 2 * into + cruise) return into + (t - 2 * into);
    // Slowing: speed falling 1 to 0 over 2 * out
    const u = (t - 2 * into - cruise) / (2 * out);
    return into + cruise + 2 * out * (u / 2 + Math.sin(Math.PI * u) / (2 * Math.PI));
  };
  return { play, at };
};

/** A point in the air: plan x, y and its height z (ft, the terrain's datum). */
export type Air = { x: number; y: number; z: number };

/** A flight sampled evenly in time: where the camera is, what it looks at, its field of view. */
export type Flight = { cam: Air[]; look: Air[]; fov: number[]; dur: number };

/** What stands over a spot: the lowest foliage (ft, the terrain's datum: a building or woods start
 * at the ground), the highest top, and the trunks close by. */
export type Canopy = { base: number; top: number; trunks: P[] };
/** What stands over a point, within `reach` ft of it (null: open sky). */
export type Obstacles = (p: P, reach: number) => Canopy | null;

/** Seconds a hole of this length takes to fly over by itself. */
export const autoSeconds = (length: number, set: FlyoverSettings) => Math.min(14, Math.max(6, length / 70)) / Math.max(0.1, set.speed);

/** How far it keeps from leaves (ft) and from trunks. */
const LEAVES = 5, TRUNKS = 7;

/**
 * The flight over a hole by itself, a low cinematic glide along its (smoothed) line of play, down
 * the fairway between the trees: from `behind` ft behind the tee, `side` ft off the line, about
 * `height` ft up (rising a little mid-hole, settling toward the basket), looking `lookAhead` ft down
 * the hole, then at the basket. Where a tree's crown hangs over the line it ducks under it when
 * there is room (rising over it when there isn't), and it eases around trunks; all in long,
 * smooth curves, never bobbing.
 */
export const autoFlight = (line: P[], set: FlyoverSettings, ground: (x: number, y: number) => number, obstacles: Obstacles = () => null): Flight | null => {
  if (line.length < 2) return null;
  const len = pathLength(line);
  if (len < 1) return null;
  const start = line[0], end = line[line.length - 1];
  const a0 = pointAlong(line, 0).angle;
  const behind = Math.max(0, set.behind);
  // A sample about every 8 ft (at least 60)
  const n = Math.max(60, Math.ceil((len + behind) / 8));
  const step = (len - 25 + behind) / n;
  const reachAhead = Math.max(30, set.lookAhead) * Math.max(1, len / 350);
  const spots: { p: P; nrm: P }[] = [], want: number[] = [], floor: number[] = [], ceil: number[] = [], lift: number[] = [], push: number[] = [];
  const look: Air[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const d = -behind + t * (len - 25 + behind);
    const at = d < 0 ? { point: { x: start.x + Math.cos(a0) * d, y: start.y + Math.sin(a0) * d }, angle: a0 } : pointAlong(line, d);
    // Off to the side (right of the way it flies)
    const nrm = { x: -Math.sin(at.angle), y: Math.cos(at.angle) };
    const p = { x: at.point.x + nrm.x * set.side, y: at.point.y + nrm.y * set.side };
    const g = ground(p.x, p.y);
    // (rising a little mid-hole, by at most half the height asked)
    const alt = set.height + Math.sin(Math.PI * Math.min(1, t * 1.1)) * Math.min(20, len * 0.05, set.height * 0.5) - t * Math.min(15, set.height * 0.4);
    const z = g + Math.max(4, alt);
    want.push(z);
    floor.push(g + 4);
    // In the leaves of a tree over the line: under them when there's room, else over them
    const c = obstacles(p, 4);
    let under = Infinity, over = -Infinity, side = 0;
    if (c && z + LEAVES > c.base && z - LEAVES < c.top) {
      if (c.base - LEAVES >= g + 6) under = c.base - LEAVES;
      else over = c.top + LEAVES + 3;
    }
    // Clear of trunks (flying below the treetops): eased off to the side
    if (c && z < c.top) for (const tr of c.trunks) {
      const dx = p.x - tr.x, dy = p.y - tr.y, dd = Math.hypot(dx, dy);
      if (dd < TRUNKS) side += (dx * nrm.x + dy * nrm.y >= 0 ? 1 : -1) * (TRUNKS - dd + 2);
    }
    ceil.push(under);
    lift.push(over);
    push.push(side);
    spots.push({ p, nrm });
    const ahead = pointAlong(line, Math.min(len, Math.max(0, d) + reachAhead)).point;
    const toward = t > 0.75 ? end : ahead;
    look.push({ ...toward, z: ground(toward.x, toward.y) + 3 });
  }
  // Long, smooth curves, like a band pulled taut: the height asked with the ground's bumps
  // smoothed out, then smoothed again and again while held under the crowns it passes under, over
  // the ones it goes over and off the ground, so it dips and rises in good time and never hops
  const w = Math.max(2, Math.round(Math.max(40, len * 0.1) / Math.max(1, step)));
  const win = (a: number[], i: number, r: number) => a.slice(Math.max(0, i - r), i + r + 1);
  const held = (v: number, i: number) => Math.max(Number.isFinite(lift[i]) ? Math.max(v, lift[i]) : Number.isFinite(ceil[i]) ? Math.min(v, ceil[i]) : v, floor[i]);
  let z = smoothRun(want, w);
  for (let k = 0; k < 60; k++) z = smoothRun(z.map(held), Math.max(1, w >> 1), 1);
  z = z.map(held);
  const sway = smoothRun(push.map((_, i) => win(push, i, w).reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0)), w);
  const cam: Air[] = spots.map(({ p, nrm }, i) => ({ x: p.x + nrm.x * sway[i], y: p.y + nrm.y * sway[i], z: z[i] }));
  // (and what it looks at rises and falls gently with the ground)
  const lz = smoothRun(look.map(l => l.z), w);
  look.forEach((l, i) => (l.z = lz[i]));
  return { cam, look, fov: cam.map(() => set.fov), dur: autoSeconds(len, set) };
};

/** Values smoothed over `w` samples either side (`passes` of a running mean). */
const smoothRun = (v: number[], w: number, passes = 3) => {
  let z = v;
  for (let pass = 0; pass < passes; pass++) {
    const sum = [0];
    for (const x of z) sum.push(sum[sum.length - 1] + x);
    z = z.map((_, i) => {
      const a = Math.max(0, i - w), b = Math.min(z.length - 1, i + w);
      return (sum[b + 1] - sum[a]) / (b - a + 1);
    });
  }
  return z;
};

/** Seconds from each keyframe to the next. */
export const keySeconds = (keys: FlyKey[], set: FlyoverSettings, ground: (x: number, y: number) => number) =>
  keys.slice(1).map((k, i) => {
    if (k.secs && k.secs > 0) return k.secs;
    const a = keys[i];
    const d = Math.hypot(k.x - a.x, k.y - a.y, ground(k.x, k.y) + k.alt - (ground(a.x, a.y) + a.alt));
    // (at the pace a hole flies by itself)
    return Math.max(0.5, (d / 70) * 1.6 / Math.max(0.1, set.speed));
  });

/** A smooth curve through points (Catmull-Rom), at `u` (0..1) between points i and i + 1. */
const through = (pts: Air[], i: number, u: number): Air => {
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(pts.length - 1, i + 1)], p3 = pts[Math.min(pts.length - 1, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) };
};

/** The flight through keyframes made by hand: a smooth curve through the camera's spots and
 * through what it looks at, each stretch taking its keyframe's seconds. */
export const keyFlight = (keys: FlyKey[], set: FlyoverSettings, ground: (x: number, y: number) => number): Flight | null => {
  if (keys.length < 2) return null;
  const spots = keys.map(k => ({ x: k.x, y: k.y, z: ground(k.x, k.y) + k.alt }));
  const looks = keys.map(k => ({ x: k.lookX, y: k.lookY, z: ground(k.lookX, k.lookY) + 3 }));
  const secs = keySeconds(keys, set, ground);
  const dur = secs.reduce((a, b) => a + b, 0);
  const n = Math.max(60, Math.ceil(dur * 30));
  const cam: Air[] = [], look: Air[] = [], fov: number[] = [];
  for (let j = 0; j <= n; j++) {
    let t = (j / n) * dur, i = 0;
    while (i < secs.length - 1 && t > secs[i]) t -= secs[i++];
    const u = Math.min(1, Math.max(0, t / secs[i]));
    cam.push(through(spots, i, u));
    look.push(through(looks, i, u));
    fov.push((keys[i].fov ?? set.fov) * (1 - u) + (keys[i + 1].fov ?? set.fov) * u);
  }
  return { cam, look, fov, dur };
};

/** Keyframes to start from: the flight it flies by itself, at a few moments (to change by hand),
 * each `alt` ft up (the flyover's height; unset: as high as that flight is there), under or over
 * the leaves of what stands there as the flight itself goes. */
export const keysFromFlight = (f: Flight, ground: (x: number, y: number) => number, count = 4, alt?: number, obstacles: Obstacles = () => null): FlyKey[] =>
  Array.from({ length: count }, (_, k) => {
    const i = Math.round((k / (count - 1)) * (f.cam.length - 1));
    const c = f.cam[i], l = f.look[i];
    const g = ground(c.x, c.y);
    let up = alt ?? c.z - g;
    const o = alt === undefined ? null : obstacles(c, 4);
    if (o && g + up + LEAVES > o.base && g + up - LEAVES < o.top) up = o.base - LEAVES >= g + 6 ? o.base - LEAVES - g : o.top + LEAVES + 3 - g;
    return { x: round1(c.x), y: round1(c.y), alt: round1(up), lookX: round1(l.x), lookY: round1(l.y) };
  });

/** A keyframe halfway between two (to add one). */
export const keyBetween = (a: FlyKey, b: FlyKey): FlyKey => ({
  x: round1((a.x + b.x) / 2), y: round1((a.y + b.y) / 2), alt: round1((a.alt + b.alt) / 2),
  lookX: round1((a.lookX + b.lookX) / 2), lookY: round1((a.lookY + b.lookY) / 2)
});

const round1 = (v: number) => Math.round(v * 10) / 10;
