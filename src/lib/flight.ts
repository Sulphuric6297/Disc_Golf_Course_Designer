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

/** A tree's crown: where its trunk stands, how far its leaves reach round it, and how high they
 * hang (from `base` to `top`, ft on the terrain's datum). */
export type Crown = { x: number; y: number; r: number; base: number; top: number };
/** What stands over a spot: the lowest foliage (ft, the terrain's datum: a building starts at the
 * ground), the highest top, the trunks close by, and (when known) each tree's crown. */
export type Canopy = { base: number; top: number; trunks: P[]; crowns?: Crown[] };
/** What stands over a point, within `reach` ft of it (null: open sky). */
export type Obstacles = (p: P, reach: number) => Canopy | null;

/** Seconds a hole of this length takes to fly over by itself. */
export const autoSeconds = (length: number, set: FlyoverSettings) => Math.min(14, Math.max(6, length / 70)) / Math.max(0.1, set.speed);

/** How far it keeps from leaves (ft) and from trunks; how far it slips sideways round a crown it
 * can't pass under (more than that: over it). */
const LEAVES = 5, TRUNKS = 7, AROUND = 15;

/** Where the camera must be in the air at a spot: no lower than `lo` (over a crown it can't pass
 * under, off the ground) and no higher than `hi` (under one it passes beneath), ft. */
const limitsAt = (p: P, g: number, z: number, alt: number, obstacles: Obstacles) => {
  let lo = g + Math.min(4, alt), hi = Infinity, above = -Infinity;
  const c = obstacles(p, 4);
  if (c && z + LEAVES > c.base && z - LEAVES < c.top) {
    // (`above`: how high it must be to go over them instead)
    above = c.top + LEAVES + 3;
    if (c.base - LEAVES >= g + 6) hi = c.base - LEAVES;
    else lo = Math.max(lo, above);
  }
  return { lo, hi, above };
};

/** How steeply it climbs or comes down round what's in the way (ft up per ft along), and how
 * sharply it slips aside (ft aside per ft along). */
const CLIMB = 0.35, SLIP = 0.2;

/**
 * Heights along a camera's way: `alt[i]` ft over the ground under it (the ground's small bumps
 * smoothed, about `stepFt` between spots), under the leaves it passes beneath when there's room
 * (a dip only as deep as needed), over the ones it can't and never nearer the ground than 4 ft:
 * climbing and coming down in good time round each, then straight back to its height.
 */
const holdHeights = (spots: P[], alt: number[], stepFt: number, ground: (x: number, y: number) => number, obstacles: Obstacles) => {
  const g = spots.map(p => ground(p.x, p.y));
  const step = Math.max(0.5, stepFt);
  // (the ground carried on past both ends as it runs there, so it isn't pulled down or up at them)
  const w = Math.max(1, Math.round(12 / step)), pad = Math.min(g.length - 1, 2 * w);
  const ext = [...g.slice(1, pad + 1).reverse().map(v => 2 * g[0] - v), ...g, ...g.slice(-pad - 1, -1).reverse().map(v => 2 * g[g.length - 1] - v)];
  const want = smoothRun(ext, w, 2).slice(pad, pad + g.length).map((v, i) => v + alt[i]);
  const lim = spots.map((p, i) => limitsAt(p, g[i], want[i], alt[i], obstacles));
  // Off its height only near what it must clear: a slope up to each crown it goes over and down
  // after, and the same into and out of each dip. Where it climbs anyway it goes over the crowns
  // there too, rather than dropping under them between climbs
  const reach = Math.ceil(80 / step);
  const cone = (amount: (j: number) => number) => {
    const out = want.map(() => 0);
    lim.forEach((_, j) => {
      const a = amount(j);
      if (a > 0) for (let i = Math.max(0, j - reach); i <= Math.min(want.length - 1, j + reach); i++) out[i] = Math.max(out[i], a - CLIMB * Math.abs(i - j) * step);
    });
    return out;
  };
  let up = cone(j => lim[j].lo - want[j]);
  for (let round = 0; round < 8; round++) {
    let more = false;
    lim.forEach((l, i) => {
      if (up[i] > 0 && Number.isFinite(l.hi)) {
        lim[i] = { lo: Math.max(l.lo, l.above), hi: Infinity, above: l.above };
        more = true;
      }
    });
    if (!more) break;
    up = cone(j => lim[j].lo - want[j]);
  }
  const down = cone(j => want[j] - lim[j].hi);
  // (corners rounded, then each limit held exactly)
  const e = smoothRun(want.map((_, i) => (up[i] > 0 ? up[i] : -down[i])), Math.max(1, Math.round(6 / step)), 2);
  return want.map((v, i) => Math.max(Math.min(v + e[i], lim[i].hi), lim[i].lo));
};

/** The camera's way and heights: straight on, or slipped aside round what's in the way, whichever
 * keeps nearer its height over the ground all along (ducking under a crown, say, rather than
 * slipping aside into others it would have to climb over). */
const flyAlong = (spots: P[], alt: number[], step: number, ground: (x: number, y: number) => number, obstacles: Obstacles) => {
  const off = (way: P[], z: number[]) => way.reduce((t, p, i) => t + Math.abs(z[i] - ground(p.x, p.y) - alt[i]), 0);
  const straight = { way: spots, z: holdHeights(spots, alt, step, ground, obstacles) };
  const moved = slipAside(spots, alt, step, ground, obstacles);
  if (moved === spots) return straight;
  const aside = { way: moved, z: holdHeights(moved, alt, step, ground, obstacles) };
  return off(aside.way, aside.z) <= off(straight.way, straight.z) ? aside : straight;
};

/**
 * A camera's way moved aside round what's in the way at its height (`alt[i]` ft over the ground),
 * at most 15 ft: crowns whose leaves it would fly into (rather than duck under or climb over them)
 * and trunks of the trees it passes beneath. Aside in good time, as far as each needs, easing back
 * after; the corners rounded. Where there's no way round it stays put (to go under or over).
 */
const slipAside = (spots: P[], alt: number[], stepFt: number, ground: (x: number, y: number) => number, obstacles: Obstacles): P[] => {
  const step = Math.max(0.5, stepFt);
  // (right of the way it flies)
  const nrm = spots.map((_, i) => {
    const a = spots[Math.max(0, i - 1)], b = spots[Math.min(spots.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  });
  const push = spots.map((p, i) => {
    const g = ground(p.x, p.y), z = g + alt[i], n = nrm[i];
    const c = obstacles(p, AROUND + 4);
    if (c?.crowns) {
      const keep = c.crowns.map(k => (z + LEAVES > k.base && z - LEAVES < k.top ? k.r + 6 : z < k.top ? TRUNKS + 2 : 0));
      const clear = (l: number) => c.crowns!.every((k, j) => Math.hypot(p.x + n.x * l - k.x, p.y + n.y * l - k.y) >= keep[j]);
      if (clear(0)) return 0;
      for (let s = 1; s <= AROUND; s++) {
        const l = [s, -s].find(clear);
        if (l !== undefined) return l;
      }
      return 0;
    }
    // (only how high things stand known: eased off the trunks it passes beneath)
    let side = 0;
    if (c && z < c.top) for (const tr of obstacles(p, 4)?.trunks ?? []) {
      const dx = p.x - tr.x, dy = p.y - tr.y, dd = Math.hypot(dx, dy);
      if (dd < TRUNKS) side += (dx * n.x + dy * n.y >= 0 ? 1 : -1) * (TRUNKS - dd + 2);
    }
    return side;
  });
  const reaches = (v: number, i: number, j: number) => Math.abs(v) - SLIP * Math.abs(i - j) * step;
  const place = () => {
    const env = push.map(() => 0);
    push.forEach((v, j) => {
      if (!v) return;
      for (let i = 0; i < env.length; i++) {
        const m = reaches(v, i, j);
        if (m > Math.abs(env[i])) env[i] = Math.sign(v) * m;
      }
    });
    const sway = smoothRun(env, Math.max(1, Math.round(8 / step)), 2).map((v, i) => (push[i] && Math.abs(v) < Math.abs(push[i]) ? push[i] : v));
    return spots.map((p, i) => ({ x: p.x + nrm[i].x * sway[i], y: p.y + nrm[i].y * sway[i] }));
  };
  // (never aside into trees it would have to climb over where it went straight past them: then it
  // keeps its way there, to duck under what it slipped round)
  const over = (p: P, i: number) => {
    const g = ground(p.x, p.y);
    return limitsAt(p, g, g + alt[i], alt[i], obstacles).lo > g + alt[i] + 1e-6;
  };
  if (push.every(v => !v)) return spots;
  const was = spots.map(over);
  for (let round = 0; round < 12; round++) {
    const moved = place();
    let changed = false;
    moved.forEach((q, i) => {
      if (was[i] || !over(q, i)) return;
      push.forEach((v, j) => {
        if (v && reaches(v, i, j) > 0) {
          push[j] = 0;
          changed = true;
        }
      });
    });
    if (!changed) return moved;
  }
  // (still into trees somewhere: its own way, then)
  return spots;
};

/**
 * The flight over a hole by itself, a low cinematic glide along its (smoothed) line of play, down
 * the fairway between the trees: from `behind` ft behind the tee, `side` ft off the line, `height`
 * ft over the ground the whole way, looking `lookAhead` ft down the hole, then at the basket. A
 * crown in its way it slips round (15 ft aside at most), else ducks under when there is room, else
 * rises over; it eases round trunks; all in smooth curves, back to its height after.
 */
export const autoFlight = (line: P[], set: FlyoverSettings, ground: (x: number, y: number) => number, obstacles: Obstacles = () => null): Flight | null => {
  if (line.length < 2) return null;
  const len = pathLength(line);
  if (len < 1) return null;
  const start = line[0], end = line[line.length - 1];
  const a0 = pointAlong(line, 0).angle;
  const H = Math.max(1, set.height);
  const back = (d: number) => {
    const p = { x: start.x + Math.cos(a0) * d - Math.sin(a0) * set.side, y: start.y + Math.sin(a0) * d + Math.cos(a0) * set.side };
    const g = ground(p.x, p.y);
    return { p, g, ...limitsAt(p, g, g + H, H, obstacles) };
  };
  // From behind the tee, unless trees stand there it can't pass under: then from just past them
  let behind = Math.max(0, set.behind);
  for (let d = -behind; d < 0; d += 8) {
    const b = back(d);
    if (b.lo > b.g + H + 1e-6) behind = Math.max(0, -d - 8);
  }
  // A sample about every 8 ft (at least 60)
  const n = Math.max(60, Math.ceil((len + behind) / 8));
  const step = (len - 25 + behind) / n;
  const reachAhead = Math.max(30, set.lookAhead) * Math.max(1, len / 350);
  const spots: P[] = [];
  const look: Air[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const d = -behind + t * (len - 25 + behind);
    const at = d < 0 ? { point: { x: start.x + Math.cos(a0) * d, y: start.y + Math.sin(a0) * d }, angle: a0 } : pointAlong(line, d);
    // Off to the side (right of the way it flies)
    const nrm = { x: -Math.sin(at.angle), y: Math.cos(at.angle) };
    const p = { x: at.point.x + nrm.x * set.side, y: at.point.y + nrm.y * set.side };
    spots.push(p);
    const ahead = pointAlong(line, Math.min(len, Math.max(0, d) + reachAhead)).point;
    const toward = t > 0.75 ? end : ahead;
    look.push({ ...toward, z: ground(toward.x, toward.y) + 3 });
  }
  // Round what's in the way, then the height over the ground there
  const w = Math.max(2, Math.round(Math.max(40, len * 0.1) / Math.max(1, step)));
  const { way, z } = flyAlong(spots, spots.map(() => H), step, ground, obstacles);
  const cam: Air[] = way.map((p, i) => ({ ...p, z: z[i] }));
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
export const keyFlight = (keys: FlyKey[], set: FlyoverSettings, ground: (x: number, y: number) => number, obstacles: Obstacles = () => null): Flight | null => {
  if (keys.length < 2) return null;
  // (the camera's spots with their height over the ground: between two it keeps to the ground's
  // rise and fall, as high over it as they are, and clear of the trees on the way)
  const spots = keys.map(k => ({ x: k.x, y: k.y, z: k.alt }));
  const looks = keys.map(k => ({ x: k.lookX, y: k.lookY, z: ground(k.lookX, k.lookY) + 3 }));
  const secs = keySeconds(keys, set, ground);
  const dur = secs.reduce((a, b) => a + b, 0);
  const n = Math.max(60, Math.ceil(dur * 30));
  const way: Air[] = [], look: Air[] = [], fov: number[] = [];
  for (let j = 0; j <= n; j++) {
    let t = (j / n) * dur, i = 0;
    while (i < secs.length - 1 && t > secs[i]) t -= secs[i++];
    const u = Math.min(1, Math.max(0, t / secs[i]));
    way.push(through(spots, i, u));
    look.push(through(looks, i, u));
    fov.push((keys[i].fov ?? set.fov) * (1 - u) + (keys[i + 1].fov ?? set.fov) * u);
  }
  const flown = flyAlong(way, way.map(w => w.z), pathLength(way) / n, ground, obstacles);
  return { cam: flown.way.map((w, j) => ({ x: w.x, y: w.y, z: flown.z[j] })), look, fov, dur };
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
