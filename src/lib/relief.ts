// Showing the lie of the land: contour lines and hill shading worked out from the terrain.
import { computeContourSegments, getContourInterval } from "./terrain";
import { heightAt, terrainStats } from "./terrainGrid";

export type Contours = { segments: { x1: number; y1: number; x2: number; y2: number; level: number }[]; interval: number };

/** Contour lines at a round interval (1, 2, 5, 10... ft) giving about 10 lines across the relief. */
export const contoursOf = (heights: Record<string, number>, grid: number, width: number, height: number, interval?: number): Contours => {
  const t = terrainStats(heights);
  if (t.relief < 0.5) return { segments: [], interval: 1 };
  const step = interval ?? Math.max(1, getContourInterval(t.relief));
  return { segments: computeContourSegments(heights, grid, width, height, step, t.min, t.max), interval: step };
};

/**
 * Joins contour segments into longer lines (for smooth printed contours): segments meeting end to
 * end at the same level are chained.
 */
export const chainContours = (segments: Contours["segments"]) => {
  const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const byLevel = new Map<number, Contours["segments"]>();
  segments.forEach(s => { const l = byLevel.get(s.level) ?? []; l.push(s); byLevel.set(s.level, l); });
  const out: { level: number; pts: { x: number; y: number }[] }[] = [];
  for (const [level, segs] of byLevel) {
    const ends = new Map<string, number[]>();
    segs.forEach((s, i) => {
      for (const k of [key(s.x1, s.y1), key(s.x2, s.y2)]) { const l = ends.get(k) ?? []; l.push(i); ends.set(k, l); }
    });
    const used = new Uint8Array(segs.length);
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const pts = [{ x: segs[i].x1, y: segs[i].y1 }, { x: segs[i].x2, y: segs[i].y2 }];
      // Grow both ways
      for (const forward of [true, false]) {
        for (;;) {
          const end = forward ? pts[pts.length - 1] : pts[0];
          const next = (ends.get(key(end.x, end.y)) ?? []).find(j => !used[j]);
          if (next === undefined) break;
          used[next] = 1;
          const s = segs[next];
          const a = { x: s.x1, y: s.y1 }, b = { x: s.x2, y: s.y2 };
          const p = key(a.x, a.y) === key(end.x, end.y) ? b : a;
          if (forward) pts.push(p); else pts.unshift(p);
        }
      }
      out.push({ level, pts });
    }
  }
  return out;
};

/**
 * Hill shading as an image: light from several directions (north-west strongest, as on most maps),
 * shadows dark and lit slopes light, flat ground clear. `exaggerate` steepens the look.
 */
export const hillshadeCanvas = (heights: Record<string, number>, grid: number, width: number, height: number, exaggerate = 2.5) => {
  const ftPerPx = Math.max(2, Math.max(width, height) / 1200);
  const w = Math.max(2, Math.round(width / ftPerPx));
  const h = Math.max(2, Math.round(height / ftPerPx));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const img = ctx.createImageData(w, h);
  const z = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) z[j * w + i] = heightAt(heights, grid, (i + 0.5) * ftPerPx, (j + 0.5) * ftPerPx) * exaggerate;
  const lights = [
    { az: 315, w: 0.5 },
    { az: 270, w: 0.2 },
    { az: 0, w: 0.2 },
    { az: 225, w: 0.1 }
  ].map(l => ({ x: Math.sin((l.az * Math.PI) / 180), y: -Math.cos((l.az * Math.PI) / 180), w: l.w }));
  const alt = (45 * Math.PI) / 180;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const zl = z[j * w + Math.max(0, i - 1)], zr = z[j * w + Math.min(w - 1, i + 1)];
      const zu = z[Math.max(0, j - 1) * w + i], zd = z[Math.min(h - 1, j + 1) * w + i];
      const dx = (zr - zl) / (2 * ftPerPx), dy = (zd - zu) / (2 * ftPerPx);
      // Surface normal (plan y points south)
      const len = Math.hypot(dx, dy, 1);
      const nx = -dx / len, ny = -dy / len, nz = 1 / len;
      let shade = 0;
      for (const l of lights) shade += l.w * Math.max(0, nx * l.x * Math.cos(alt) + ny * l.y * Math.cos(alt) + nz * Math.sin(alt));
      // Flat ground lights to sin(alt): darker than that is shadow, lighter is a sunlit slope
      const d = shade - Math.sin(alt);
      const k = (j * w + i) * 4;
      if (d < 0) {
        img.data[k] = 20; img.data[k + 1] = 26; img.data[k + 2] = 40;
        img.data[k + 3] = Math.min(255, -d * 900);
      } else {
        img.data[k] = 255; img.data[k + 1] = 250; img.data[k + 2] = 225;
        img.data[k + 3] = Math.min(200, d * 700);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};
