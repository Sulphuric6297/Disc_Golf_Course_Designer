// Painting the ground: grass, dirt, gravel, mulch, concrete or asphalt brushed onto the map, over
// the photo (or on a plan without one). Stored in the plan as one material per square foot.
type P = { x: number; y: number };

/** The materials, in the order they are stored (0 is "not painted"). `detail` is the ground
 * texture pattern each one uses (0 grass, 1 concrete, 2 asphalt, 3 soil/stones). */
export const GROUND_MATERIALS = [
  { id: "grass", label: "Grass", color: "#5f8f3e", detail: 0 },
  { id: "dirt", label: "Dirt", color: "#8b6b4b", detail: 3 },
  { id: "gravel", label: "Gravel", color: "#a7a195", detail: 3 },
  { id: "mulch", label: "Mulch", color: "#6e4a30", detail: 3 },
  { id: "concrete", label: "Concrete", color: "#c2bdb3", detail: 1 },
  { id: "asphalt", label: "Asphalt", color: "#3e4144", detail: 2 }
] as const;
export type GroundMaterialId = (typeof GROUND_MATERIALS)[number]["id"];

/** Size of one painted square, in feet. */
export const PAINT_CELL_FT = 1;

export const paintKey = (i: number, j: number) => `${i},${j}`;

/**
 * The paint after one dab of the brush: every square whose middle is inside the circle gets the
 * material (its number, 1-based), or loses its paint (0). Returns the same object when nothing
 * changed, so nothing redraws for nothing.
 */
export const paintCircle = (paint: Record<string, number>, center: P, radius: number, material: number, upf = 1, own = false): Record<string, number> => {
  const cell = PAINT_CELL_FT * upf;
  const i0 = Math.floor((center.x - radius) / cell), i1 = Math.floor((center.x + radius) / cell);
  const j0 = Math.floor((center.y - radius) / cell), j1 = Math.floor((center.y + radius) / cell);
  // (`own`: the paint is already a copy of our own, changed in place)
  let next: Record<string, number> | null = own ? paint : null;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const cx = (i + 0.5) * cell, cy = (j + 0.5) * cell;
      if (Math.hypot(cx - center.x, cy - center.y) > radius) continue;
      const key = paintKey(i, j);
      const have = paint[key] ?? 0;
      if (have === material) continue;
      next ??= { ...paint };
      if (material) next[key] = material;
      else delete next[key];
    }
  }
  return next ?? paint;
};

/**
 * The paint after the brush moved from `a` to `b`: dabs close enough together along the way that the
 * stroke is one solid band, however fast the pointer moved.
 */
export const paintStroke = (paint: Record<string, number>, a: P, b: P, radius: number, material: number, upf = 1): Record<string, number> => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(len / Math.max(radius * 0.4, 0.25 * upf)));
  let next = paint;
  // One copy for the whole stroke, made the first time a dab changes something
  for (let k = 0; k <= steps; k++) next = paintCircle(next, { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps }, radius, material, upf, next !== paint);
  return next;
};

/** The painted material at a plan point (its entry in GROUND_MATERIALS), or null. */
export const paintAt = (paint: Record<string, number>, p: P, upf = 1) => {
  const cell = PAINT_CELL_FT * upf;
  const m = paint[paintKey(Math.floor(p.x / cell), Math.floor(p.y / cell))];
  return m ? GROUND_MATERIALS[m - 1] : null;
};
