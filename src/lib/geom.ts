// Plane geometry for the course: polygons, smooth throw lines and fairway corridors.
import type { P } from "../types";

export const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

export const pathLength = (pts: P[]) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
};

export const pointInPolygon = (pt: P, poly: P[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

export const polygonArea = (pts: P[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

export const centroid = (pts: P[]): P => {
  if (!pts.length) return { x: 0, y: 0 };
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  return { x: cx / (3 * a), y: cy / (3 * a) };
};

export const boundsOf = (pts: P[]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
};

export type Bounds = ReturnType<typeof boundsOf>;
/** How far apart two bounds are (0 when they overlap): no point of one is nearer the other. */
export const boundsGap = (a: Bounds, b: Bounds) => Math.hypot(Math.max(0, b.minX - a.maxX, a.minX - b.maxX), Math.max(0, b.minY - a.maxY, a.minY - b.maxY));
export const inBounds = (p: P, b: Bounds) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
/** How far a point is from bounds (0 inside them). */
export const pointBoundsGap = (p: P, b: Bounds) => Math.hypot(Math.max(0, b.minX - p.x, p.x - b.maxX), Math.max(0, b.minY - p.y, p.y - b.maxY));

/** Closest point on segment ab to p, with how far along (0..1) and the distance. */
export const nearestOnSegment = (p: P, a: P, b: P) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return { point: q, t, distance: dist(p, q) };
};

/** Distance from p to a polyline (open). */
export const distanceToPath = (p: P, pts: P[]) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, nearestOnSegment(p, pts[i - 1], pts[i]).distance);
  if (pts.length === 1) best = dist(p, pts[0]);
  return best;
};

/** Distance from p to a polygon's edge (0 inside it). */
export const distanceToPolygon = (p: P, poly: P[]) => {
  if (poly.length >= 3 && pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, nearestOnSegment(p, poly[i], poly[(i + 1) % poly.length]).distance);
  return best;
};

export const segmentsIntersect = (a: P, b: P, c: P, d: P) => {
  const cross = (o: P, p: P, q: P) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/** Whether two segments meet, a corner of one on the other counted (two lying along the same
 * line only where they overlap). */
const segmentsTouch = (a: P, b: P, c: P, d: P) => {
  const cross = (o: P, p: P, q: P) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (d1 === 0 && d2 === 0) return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
  return d1 * d2 <= 0 && d3 * d4 <= 0;
};

/** Whether a polyline crosses or enters a polygon. */
export const pathTouchesPolygon = (pts: P[], poly: P[]) => {
  const box = boundsOf(poly);
  if (poly.length < 3 || boundsGap(boundsOf(pts), box) > 0) return false;
  // (nothing outside the polygon's bounds is in it or crosses it)
  if (pts.some(p => inBounds(p, box) && pointInPolygon(p, poly))) return true;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.max(a.x, b.x) < box.minX || Math.min(a.x, b.x) > box.maxX || Math.max(a.y, b.y) < box.minY || Math.min(a.y, b.y) > box.maxY) continue;
    for (let j = 0; j < poly.length; j++) if (segmentsTouch(pts[i - 1], pts[i], poly[j], poly[(j + 1) % poly.length])) return true;
  }
  return false;
};

/** Length of a polyline that lies inside a polygon (sampled every `step` ft). */
export const lengthInside = (pts: P[], poly: P[], step = 2) => {
  let inside = 0;
  const box = boundsOf(poly);
  if (poly.length < 3 || boundsGap(boundsOf(pts), box) > 0) return inside;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = dist(a, b);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (inBounds(q, box) && pointInPolygon(q, poly)) inside += len / n;
    }
  }
  return inside;
};

/**
 * A smooth curve through the points (centripetal Catmull-Rom), as a polyline: a throw line through
 * its doglegs reads like a disc's flight instead of straight legs.
 */
export const smoothPath = (pts: P[], perSegment = 12): P[] => {
  if (pts.length < 3) return pts.map(p => ({ ...p }));
  const out: P[] = [];
  const get = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i === 0 ? { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y } : get(i - 1);
    const p1 = get(i), p2 = get(i + 1);
    const p3 = i + 2 >= pts.length ? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y } : get(i + 2);
    const tj = (a: P, b: P) => Math.max(1e-4, Math.sqrt(dist(a, b)));
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let k = 0; k < perSegment; k++) {
      const t = t1 + ((t2 - t1) * k) / perSegment;
      const lerp = (a: P, b: P, ta: number, tb: number) => {
        const w = (t - ta) / (tb - ta);
        return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
      };
      const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
};

/** A smooth closed curve through a shape's corners (centripetal Catmull-Rom, all the way round). */
export const smoothClosed = (pts: P[], perSegment = 6): P[] => {
  const n = pts.length;
  if (n < 3) return pts.map(p => ({ ...p }));
  const out: P[] = [];
  const tj = (a: P, b: P) => Math.max(1e-4, Math.sqrt(dist(a, b)));
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let k = 0; k < perSegment; k++) {
      const t = t1 + ((t2 - t1) * k) / perSegment;
      const lerp = (a: P, b: P, ta: number, tb: number) => {
        const w = (t - ta) / (tb - ta);
        return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
      };
      const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  return out;
};

/** Point and direction at a distance along a polyline. */
export const pointAlong = (pts: P[], d: number) => {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    if (acc + len >= d || i === pts.length - 1) {
      const t = len > 0 ? Math.max(0, Math.min(1, (d - acc) / len)) : 0;
      const a = pts[i - 1], b = pts[i];
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    acc += len;
  }
  return { point: pts[0] ?? { x: 0, y: 0 }, angle: 0 };
};

/** The part of a polyline from `a` to `b` of the way along it (0 its start, 1 its end). */
export const subPath = (pts: P[], a: number, b: number): P[] => {
  const total = pathLength(pts);
  if (pts.length < 2 || total <= 0) return pts.slice();
  const d0 = Math.max(0, Math.min(a, b)) * total, d1 = Math.min(1, Math.max(a, b)) * total;
  const out: P[] = [pointAlong(pts, d0).point];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i]);
    if (acc > d0 && acc < d1) out.push(pts[i]);
  }
  out.push(pointAlong(pts, d1).point);
  return out;
};

/** A polyline moved `d(t)` ft to its right (left when negative), `t` how far along it (0..1). */
export const offsetPath = (pts: P[], d: (t: number) => number): P[] => {
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + dist(pts[i - 1], pts[i]));
  const total = along[along.length - 1] || 1;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, off = d(along[i] / total);
    return { x: p.x - (dy / len) * off, y: p.y + (dx / len) * off };
  });
};

/** A polyline with points put in between, at most `step` ft apart. */
export const densify = (pts: P[], step: number): P[] => {
  const out: P[] = pts.length ? [pts[0]] : [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
};

/** The point of a polyline nearest p: how far along it that is (0..1), and how far from p. */
export const nearestAlong = (pts: P[], p: P) => {
  const total = pathLength(pts) || 1;
  let best = { t: 0, distance: Infinity }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]), n = nearestOnSegment(p, pts[i - 1], pts[i]);
    if (n.distance < best.distance) best = { t: (acc + n.t * len) / total, distance: n.distance };
    acc += len;
  }
  return best;
};

/**
 * A corridor of the given width around a polyline: an outline with round ends and smooth turns
 * (a fairway along a throw line). The width can change along the way: a function of how far
 * along the line (0 at its start, 1 at its end). Returned as one closed polygon.
 */
export const corridor = (pts: P[], width: number | ((t: number) => number), roundSteps = 10, shift?: (t: number) => number): P[] => {
  const widthAt = typeof width === "number" ? () => width : width;
  let line = pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 1e-6);
  // A width that changes: divide the line finely, so the outline follows it between the points
  if ((typeof width !== "number" || shift) && line.length >= 2) {
    const len = line.slice(1).reduce((a, p, i) => a + dist(line[i], p), 0);
    const step = Math.max(1, len / 80);
    const fine: P[] = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], n = Math.max(1, Math.ceil(dist(a, b) / step));
      for (let k = 1; k <= n; k++) fine.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    line = fine;
  }
  if (line.length < 2) {
    const c = line[0] ?? { x: 0, y: 0 };
    const half = widthAt(0) / 2;
    return Array.from({ length: 24 }, (_, i) => ({ x: c.x + Math.cos((i / 24) * Math.PI * 2) * half, y: c.y + Math.sin((i / 24) * Math.PI * 2) * half }));
  }
  const along = [0];
  for (let i = 1; i < line.length; i++) along.push(along[i - 1] + dist(line[i - 1], line[i]));
  const total = along[along.length - 1] || 1;
  const halves = along.map(d => widthAt(d / total) / 2);
  const normals = line.map((_, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const len = dist(a, b) || 1;
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  });
  // (its middle moved off the line, sideways)
  if (shift) line = line.map((p, i) => { const d = shift(along[i] / total); return { x: p.x + normals[i].x * d, y: p.y + normals[i].y * d }; });
  const left = line.map((p, i) => ({ x: p.x + normals[i].x * halves[i], y: p.y + normals[i].y * halves[i] }));
  const right = line.map((p, i) => ({ x: p.x - normals[i].x * halves[i], y: p.y - normals[i].y * halves[i] }));
  const cap = (c: P, n: P, from: number, half: number): P[] => {
    // Half a circle from one side to the other, bulging away from the line
    const a0 = Math.atan2(n.y, n.x);
    const out: P[] = [];
    for (let k = 1; k < roundSteps; k++) {
      const a = a0 + from * (Math.PI * k) / roundSteps;
      out.push({ x: c.x + Math.cos(a) * half, y: c.y + Math.sin(a) * half });
    }
    return out;
  };
  const end = line.length - 1;
  // left side forward, round end cap (from +n to -n through the forward direction), right side back, start cap
  return [
    ...left,
    ...cap(line[end], normals[end], -1, halves[end]),
    ...right.reverse(),
    ...cap(line[0], { x: -normals[0].x, y: -normals[0].y }, -1, halves[0])
  ];
};

/** Turn angle (degrees, 0 = straight on) at each inner point of a polyline. */
export const turnAngles = (pts: P[]) => {
  const out: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    const b = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
    let d = ((b - a) * 180) / Math.PI;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    out.push(d);
  }
  return out;
};

/** Douglas-Peucker simplification (for drawn lines and exported shapes). */
export const simplify = (pts: P[], tolerance: number): P[] => {
  if (pts.length <= 2) return pts;
  let maxD = 0, index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = nearestOnSegment(pts[i], pts[0], pts[pts.length - 1]).distance;
    if (d > maxD) { maxD = d; index = i; }
  }
  if (maxD <= tolerance) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(pts.slice(index), tolerance)];
};

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The part of a segment inside a rectangle (Liang-Barsky), or null; its ends are a and b themselves where they are inside. */
const clipSegment = (a: P, b: P, r: Rect): [P, P] | null => {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  const at = (t: number) => (t === 0 ? a : t === 1 ? b : { x: a.x + t * dx, y: a.y + t * dy });
  return t1 - t0 > 1e-9 ? [at(t0), at(t1)] : null;
};

/** The pieces of a path inside a rectangle (a path that leaves and comes back is two pieces). */
export const clipPathToRect = (pts: P[], r: Rect): P[][] => {
  const pieces: P[][] = [];
  let cur: P[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const seg = clipSegment(pts[i], pts[i + 1], r);
    if (seg && cur.length && cur[cur.length - 1] === seg[0]) {
      cur.push(seg[1]);
      continue;
    }
    if (cur.length >= 2) pieces.push(cur);
    cur = seg ? [seg[0], seg[1]] : [];
  }
  if (cur.length >= 2) pieces.push(cur);
  return pieces;
};

/** A polygon cut to a rectangle (Sutherland-Hodgman: where it was cut, it runs along the rectangle's edge). */
export const clipPolygonToRect = (poly: P[], r: Rect): P[] => {
  const sides: [(p: P) => boolean, (a: P, b: P) => P][] = [
    [p => p.x >= r.x0, (a, b) => ({ x: r.x0, y: a.y + ((b.y - a.y) * (r.x0 - a.x)) / (b.x - a.x) })],
    [p => p.x <= r.x1, (a, b) => ({ x: r.x1, y: a.y + ((b.y - a.y) * (r.x1 - a.x)) / (b.x - a.x) })],
    [p => p.y >= r.y0, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.y0 - a.y)) / (b.y - a.y), y: r.y0 })],
    [p => p.y <= r.y1, (a, b) => ({ x: a.x + ((b.x - a.x) * (r.y1 - a.y)) / (b.y - a.y), y: r.y1 })]
  ];
  let pts = poly;
  for (const [inside, cut] of sides) {
    const next: P[] = [];
    pts.forEach((b, i) => {
      const a = pts[(i + pts.length - 1) % pts.length];
      if (inside(b)) {
        if (!inside(a)) next.push(cut(a, b));
        next.push(b);
      } else if (inside(a)) next.push(cut(a, b));
    });
    pts = next;
    if (pts.length < 3) return [];
  }
  return pts;
};

export const rotatePoint = (p: P, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

/** Corners of a rotated rectangle (a tee pad) around its middle. */
export const rectCorners = (c: P, length: number, width: number, angleDeg: number): P[] =>
  [[-length / 2, -width / 2], [length / 2, -width / 2], [length / 2, width / 2], [-length / 2, width / 2]].map(([x, y]) => {
    const r = rotatePoint({ x, y }, angleDeg);
    return { x: c.x + r.x, y: c.y + r.y };
  });
