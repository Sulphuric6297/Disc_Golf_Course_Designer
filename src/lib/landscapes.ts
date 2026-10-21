// Landscapes: what the land is like (a wooded park, open parkland, pine forest, dry grass,
// autumn, desert), as natural colors for the grass, trees, water and dirt, how thick the woods
// are and how many of their trees are pines, and how the grass grows. The 3D view always shows
// the course in these natural colors; the painted Forest map takes them too when one is picked.
import type { MapStyle } from "../types";

export type LandscapeId = "woods" | "park" | "pines" | "dry" | "autumn" | "desert";

export type Landscape = {
  label: string;
  blurb: string;
  colors: Pick<MapStyle, "fairway" | "rough" | "trees" | "water" | "path">;
  /** Woods painted on the map: how thick (see MapStyle.treeCover). */
  treeCover: number;
  /** Share of the trees in the woods that are pines (0..1). */
  conifers: number;
  /** The grass between holes: blade height (ft) and how thick it grows (0..1). */
  grass: { lawn: number; density: number };
  /** Treetops in several colors, tree by tree (autumn's oranges, reds and golds). */
  mix?: string[];
};

export const LANDSCAPES: Record<LandscapeId, Landscape> = {
  woods: {
    label: "Wooded park",
    blurb: "Thick broadleaf woods, mown fairways",
    colors: { fairway: "#6f9255", rough: "#4d6a3c", trees: "#354a2c", water: "#23677f", path: "#6e5b38" },
    treeCover: 1,
    conifers: 0.22,
    grass: { lawn: 0.4, density: 1 }
  },
  park: {
    label: "Open park",
    blurb: "Lawns with trees in clumps",
    colors: { fairway: "#7a9d58", rough: "#668845", trees: "#3c5531", water: "#2a6f86", path: "#8a7552" },
    treeCover: 0.35,
    conifers: 0.15,
    grass: { lawn: 0.3, density: 1 }
  },
  pines: {
    label: "Pine forest",
    blurb: "Mountain or northern woods, mostly pines",
    colors: { fairway: "#6b8a55", rough: "#55703f", trees: "#2a3d2e", water: "#215d78", path: "#7a6a52" },
    treeCover: 0.9,
    conifers: 0.85,
    grass: { lawn: 0.5, density: 0.85 }
  },
  dry: {
    label: "Dry grass",
    blurb: "Late summer, golden grass, prairie",
    colors: { fairway: "#8f9a5a", rough: "#a39561", trees: "#47532f", water: "#2f6a78", path: "#9a7d55" },
    treeCover: 0.3,
    conifers: 0.1,
    grass: { lawn: 0.9, density: 0.9 }
  },
  autumn: {
    label: "Autumn",
    blurb: "Fall colors in the woods",
    colors: { fairway: "#7a8e50", rough: "#6a7542", trees: "#7a4b26", water: "#2a5d73", path: "#6e5634" },
    treeCover: 0.95,
    conifers: 0.15,
    grass: { lawn: 0.4, density: 1 },
    mix: ["#7a4b26", "#8c6a24", "#6e2f20", "#80582a", "#3f4a2b", "#93782e"]
  },
  desert: {
    label: "Desert",
    blurb: "Sand, scrub and sparse grass",
    colors: { fairway: "#a9a374", rough: "#b9a682", trees: "#5a6a3c", water: "#3a7f8a", path: "#b08a5a" },
    treeCover: 0.15,
    conifers: 0.05,
    grass: { lawn: 0.5, density: 0.25 }
  }
};

export const LANDSCAPE_ORDER: LandscapeId[] = ["woods", "park", "pines", "dry", "autumn", "desert"];

/** The course's landscape (older courses: the wooded park). */
export const landscapeOf = (s: Pick<MapStyle, "landscape">): Landscape => LANDSCAPES[(s.landscape as LandscapeId) ?? "woods"] ?? LANDSCAPES.woods;

/** The color of tall grass on the map: as set, or the grass's own, lighter and straw yellow. */
export const tallGrassOf = (s: Pick<MapStyle, "rough" | "tallGrass">) => {
  if (s.tallGrass) return s.tallGrass;
  const m = /^#?([0-9a-f]{6})$/i.exec(s.rough);
  if (!m) return "#a8a35a";
  const v = parseInt(m[1], 16);
  const to = (c: number, t: number) => Math.round(c + (t - c) * 0.55);
  const r = to((v >> 16) & 255, 0xb8), g = to((v >> 8) & 255, 0xae), b = to(v & 255, 0x62);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};
