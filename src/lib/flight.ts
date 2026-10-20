// Flyovers: the camera's path over a hole, flown by itself (from behind the tee, along the line of
// play, up over the trees and down toward the basket) or through keyframes made by hand. Pure: the
// map view draws the pictures, the Export step works out a video's length.
import type { CourseDoc, FlyKey, FlyoverSettings, P } from "../types";
import { pathLength, pointAlong } from "./geom";

export const FLYOVER_DEFAULTS: FlyoverSettings = { height: 45, speed: 1, fov: 62, behind: 60, side: 0, lookAhead: 120 };

/** A course's flyover settings, filled in. */
export const flyoverOf = (doc: Pick<CourseDoc, "flyover">): FlyoverSettings => ({ ...FLYOVER_DEFAULTS, ...doc.flyover });

/** A point in the air: plan x, y and its height z (ft, the terrain's datum). */
export type Air = { x: number; y: number; z: number };

/** A flight sampled evenly in time: where the camera is, what it looks at, its field of view. */
export type Flight = { cam: Air[]; look: Air[]; fov: number[]; dur: number };

/** How high trees, buildings and the like stand near a point (ft, the terrain's datum), or -Infinity. */
export type Obstacles = (p: P, reach: number) => number;

/** Seconds a hole of this length takes to fly over by itself. */
export const autoSeconds = (length: number, set: FlyoverSettings) => Math.min(14, Math.max(6, length / 70)) / Math.max(0.1, set.speed);

/** How far it clears the treetops, ft. */
const CLEARANCE = 18;

/**
 * The flight over a hole by itself, along its (smoothed) line of play: from `behind` ft behind the
 * tee, `side` ft off the line, `height` ft up (a little higher mid-hole, lower toward the
 * basket), never lower than the treetops and roofs around it plus a margin (climbing early and
 * coming down gently), looking `lookAhead` ft down the hole, then at the basket.
 */
export const autoFlight = (line: P[], set: FlyoverSettings, ground: (x: number, y: number) => number, obstacles: Obstacles = () => -Infinity): Flight | null => {
  if (line.length < 2) return null;
  const len = pathLength(line);
  if (len < 1) return null;
  const start = line[0], end = line[line.length - 1];
  const a0 = pointAlong(line, 0).angle;
  const behind = Math.max(0, set.behind);
  // A sample about every 8 ft (at least 60)
  const n = Math.max(60, Math.ceil((len + behind) / 8));
  const step = (len - 25 + behind) / n;
  const cam: Air[] = [], look: Air[] = [], want: number[] = [], clear: number[] = [], floor: number[] = [];
  const reachAhead = Math.max(30, set.lookAhead) * Math.max(1, len / 350);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const d = -behind + t * (len - 25 + behind);
    const at = d < 0 ? { point: { x: start.x + Math.cos(a0) * d, y: start.y + Math.sin(a0) * d }, angle: a0 } : pointAlong(line, d);
    // Off to the side (right of the way it flies)
    const p = { x: at.point.x - Math.sin(at.angle) * set.side, y: at.point.y + Math.cos(at.angle) * set.side };
    const alt = set.height + Math.sin(Math.PI * Math.min(1, t * 1.1)) * Math.min(60, len * 0.12) - t * Math.min(25, set.height * 0.55);
    const g = ground(p.x, p.y);
    want.push(g + Math.max(3, alt));
    clear.push(obstacles(p, 35) + CLEARANCE);
    floor.push(g + 3);
    cam.push({ ...p, z: 0 });
    const ahead = pointAlong(line, Math.min(len, Math.max(0, d) + reachAhead)).point;
    const toward = t > 0.75 ? end : ahead;
    look.push({ ...toward, z: ground(toward.x, toward.y) + 3 });
  }
  // A steady height, never bobbing over each bump of the ground or each treetop: the height asked,
  // with the ground's bumps smoothed out; over trees and roofs, the highest it must clear over a
  // long stretch around, smoothed (so it is up in good time and comes down gently); never under
  // what it must clear
  const w = Math.max(2, Math.round(Math.max(50, len * 0.12) / Math.max(1, step)));
  const steady = smoothRun(want, w);
  const over = smoothRun(clear.map((_, i) => Math.max(steady[i], ...clear.slice(Math.max(0, i - 3 * w), i + 3 * w + 1))), w);
  cam.forEach((c, i) => (c.z = Math.max(steady[i], over[i], clear[i], floor[i])));
  // (and what it looks at rises and falls gently with the ground)
  const lz = smoothRun(look.map(l => l.z), w);
  look.forEach((l, i) => (l.z = lz[i]));
  return { cam, look, fov: cam.map(() => set.fov), dur: autoSeconds(len, set) };
};

/** Values smoothed over `w` samples either side (three passes of a running mean). */
const smoothRun = (v: number[], w: number) => {
  let z = v;
  for (let pass = 0; pass < 3; pass++) {
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

/** Keyframes to start from: the flight it flies by itself, at a few moments (to change by hand). */
export const keysFromFlight = (f: Flight, ground: (x: number, y: number) => number, count = 4): FlyKey[] =>
  Array.from({ length: count }, (_, k) => {
    const i = Math.round((k / (count - 1)) * (f.cam.length - 1));
    const c = f.cam[i], l = f.look[i];
    return { x: round1(c.x), y: round1(c.y), alt: round1(c.z - ground(c.x, c.y)), lookX: round1(l.x), lookY: round1(l.y) };
  });

/** A keyframe halfway between two (to add one). */
export const keyBetween = (a: FlyKey, b: FlyKey): FlyKey => ({
  x: round1((a.x + b.x) / 2), y: round1((a.y + b.y) / 2), alt: round1((a.alt + b.alt) / 2),
  lookX: round1((a.lookX + b.lookX) / 2), lookY: round1((a.lookY + b.lookY) / 2)
});

const round1 = (v: number) => Math.round(v * 10) / 10;
