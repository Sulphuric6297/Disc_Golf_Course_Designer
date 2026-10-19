import type { AmenityKind, AreaKind, LineKind, PinPosition, TeeLevel, TeeSurface } from "./types";

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const generateId = () => Math.random().toString(36).slice(2, 11);

export const FT_PER_M = 3.28084;

/** A new blank course: a rectangle of open ground, ft. */
export const DEFAULT_CANVAS = { width: 1600, height: 1100 };
export const OBJECT_ELEVATION_OFFSET = 0.08;
export const MAP_OVERLAY_OFFSET = 0.02;

/** Eye height of a player on the tee, ft (tee views and flyovers). */
export const EYE_HEIGHT_FT = 5.5;
/** The putting circle ("Circle 1"): 10 m around the basket. */
export const CIRCLE_ONE_FT = 10 * FT_PER_M;
/** Circle 2: 20 m. */
export const CIRCLE_TWO_FT = 20 * FT_PER_M;

/** Tee colors: the PDGA's skill levels, with the player ratings they are for. */
export const TEE_LEVELS: Record<TeeLevel, { label: string; skill: string; rating: string; color: string; ink: string }> = {
  gold: { label: "Gold", skill: "Pro", rating: "970+", color: "#e3b505", ink: "#1c1917" },
  blue: { label: "Blue", skill: "Advanced", rating: "925+", color: "#2563eb", ink: "#ffffff" },
  white: { label: "White", skill: "Intermediate", rating: "875+", color: "#f8fafc", ink: "#1c1917" },
  red: { label: "Red", skill: "Recreational", rating: "825+", color: "#dc2626", ink: "#ffffff" },
  green: { label: "Green", skill: "Novice / juniors", rating: "under 825", color: "#16a34a", ink: "#ffffff" }
};
export const TEE_ORDER: TeeLevel[] = ["gold", "blue", "white", "red", "green"];

export const TEE_SURFACES: Record<TeeSurface, { label: string; color: string }> = {
  concrete: { label: "Concrete", color: "#cfcac0" },
  turf: { label: "Artificial turf", color: "#3f8f4a" },
  rubber: { label: "Rubber mat", color: "#2b2b2e" },
  pavers: { label: "Pavers", color: "#b7a08a" },
  gravel: { label: "Gravel", color: "#a7a195" },
  natural: { label: "Natural (grass/dirt)", color: "#8b7b5c" }
};

/** Typical tee pad: 5 ft wide, 12 ft long (PDGA: at least 4 x 10 ft; 6 x 13 ft at long tees). */
export const DEFAULT_PAD = { width: 5, length: 12 };
export const MIN_PAD = { width: 4, length: 10 };
/** Nothing in the way this close in front of a tee (PDGA design guide), ft. */
export const CLEAR_IN_FRONT_FT = 20;
/** Usual fairway width in the woods (PDGA: 15 ft pinch points up to 40 ft), ft. */
export const DEFAULT_FAIRWAY_FT = 30;

export const PIN_POSITIONS: PinPosition[] = ["A", "B", "C", "D"];

export const AREA_KINDS: Record<AreaKind, { label: string; color: string; fill: number; help: string }> = {
  ob: { label: "Out of bounds (OB)", color: "#ef4444", fill: 0.22, help: "Landing inside is out of bounds: one penalty throw." },
  hazard: { label: "Hazard", color: "#eab308", fill: 0.2, help: "A penalty area that is not OB: play it where it lies, plus one throw (PDGA marks hazards yellow)." },
  water: { label: "Water", color: "#2b8fd6", fill: 0.55, help: "Ponds and streams (usually OB too)." },
  fairway: { label: "Fairway", color: "#8fd16a", fill: 0.35, help: "A fairway shape drawn by hand." },
  green: { label: "Green / landing zone", color: "#b7ec8a", fill: 0.4, help: "The area around a basket." },
  woods: { label: "Woods", color: "#2f5d34", fill: 0.45, help: "Dense trees (shown as canopy on the map)." },
  rough: { label: "Rough / tall grass", color: "#a8a35a", fill: 0.3, help: "Long grass or brush." },
  nogo: { label: "Out of play (no-go)", color: "#7c3aed", fill: 0.22, help: "Keep out: playgrounds, gardens, private land." },
  parking: { label: "Parking lot", color: "#6b7280", fill: 0.5, help: "Parking." },
  building: { label: "Building", color: "#a8a29e", fill: 0.7, help: "A building or shelter." },
  sand: { label: "Sand / dirt", color: "#d9c48f", fill: 0.5, help: "Sand, dirt or a bare area." }
};

export const LINE_KINDS: Record<LineKind, { label: string; color: string; width: number; help: string }> = {
  ob: { label: "OB line", color: "#ef4444", width: 0, help: "The line itself is out of bounds (the side away from play)." },
  path: { label: "Walking path", color: "#c8a06a", width: 5, help: "A trail between holes." },
  walk: { label: "Next-tee route", color: "#ffffff", width: 0, help: "How to walk to the next tee." },
  road: { label: "Road", color: "#6b7280", width: 22, help: "A road or drive." },
  fence: { label: "Fence", color: "#78716c", width: 0, help: "A fence or wall." },
  stream: { label: "Stream", color: "#2b8fd6", width: 6, help: "A creek or ditch." }
};

export const AMENITY_KINDS: Record<AmenityKind, { label: string; letter: string; color: string }> = {
  bench: { label: "Bench", letter: "B", color: "#a16207" },
  trash: { label: "Trash can", letter: "T", color: "#475569" },
  sign: { label: "Tee sign", letter: "S", color: "#0f766e" },
  kiosk: { label: "Course kiosk / map board", letter: "i", color: "#0e7490" },
  restroom: { label: "Restroom", letter: "WC", color: "#2563eb" },
  parking: { label: "Parking", letter: "P", color: "#1d4ed8" },
  water: { label: "Drinking water", letter: "W", color: "#0284c7" },
  practice: { label: "Practice basket", letter: "PB", color: "#ea580c" },
  shelter: { label: "Shelter", letter: "SH", color: "#7c2d12" },
  bridge: { label: "Bridge", letter: "BR", color: "#78350f" }
};

export const TREE_COLORS = ["#4a7a3a", "#3d6b2f", "#5c8a3c", "#2f5d34", "#7a9a3a"];
