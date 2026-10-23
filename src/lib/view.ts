// 2D plan view math: fitting things on screen and the scale bar.
// The plan SVG has viewBox = canvas size; content is drawn with translate(pan) scale(zoom).

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 20;

export const boundsOfPoints = (pts: { x: number; y: number }[]): Bounds | null => {
  if (!pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
};

/**
 * Zoom and pan that show `b` centered in a canvas of `canvas` size, with some margin.
 * `minSpan` stops tiny things (one camera) from being zoomed in absurdly.
 */
export const fitBounds = (b: Bounds, canvas: { width: number; height: number }, opts: { margin?: number; minSpan?: number } = {}) => {
  const margin = opts.margin ?? 1.2;
  const minSpan = opts.minSpan ?? 0;
  const w = Math.max(b.maxX - b.minX, minSpan, 1e-6) * margin;
  const h = Math.max(b.maxY - b.minY, minSpan * (canvas.height / canvas.width), 1e-6) * margin;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(canvas.width / w, canvas.height / h)));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { zoom, pan: { x: canvas.width / 2 - cx * zoom, y: canvas.height / 2 - cy * zoom } };
};

/**
 * A scale bar with a round length (1, 2 or 5 × 10^n feet) close to `targetPx` on screen.
 * @param pxPerFoot on-screen pixels per real foot
 */
export const niceScaleBar = (pxPerFoot: number, targetPx = 120) => {
  if (!(pxPerFoot > 0) || !Number.isFinite(pxPerFoot)) return null;
  const rawFeet = targetPx / pxPerFoot;
  const pow = Math.pow(10, Math.floor(Math.log10(rawFeet)));
  const candidates = [1, 2, 5, 10].map(m => m * pow);
  const feet = candidates.reduce((best, c) => (Math.abs(c * pxPerFoot - targetPx) < Math.abs(best * pxPerFoot - targetPx) ? c : best));
  const label = feet >= 5280 && feet % 5280 === 0 ? `${feet / 5280} mi` : `${feet.toLocaleString()} ft`;
  return { feet, px: feet * pxPerFoot, label };
};

/** A picked wood's underbrush sections and tree patches, outlined on the map (and their swatch in its panel). */
export const BRUSH_SECTION = "#f59e0b", TREE_PATCH = "#a3e635";
