// A hole's numbers, as the viewer panel and the public page list them.
import { fmtDist, fmtElev } from "../lib/units";
import type { Units } from "../types";

/** What a hole's facts are made from (a hole's stats, or what a public site keeps of them). */
export interface HoleNumbers {
  par: number; length: number; playsLike: number; elevation: number;
  teeElevation?: number; basketElevation?: number; climb?: number; descent?: number;
  shape?: string; obInPlay?: boolean; treesOnLine?: number; difficulty?: number; maxSlope?: number;
}

const SHAPE: Record<string, string> = { straight: "Straight", left: "Turns left", right: "Turns right", "s-curve": "S-curve" };

export function holeFacts(h: HoleNumbers, u: Units): [string, string][] {
  const out: [string, string][] = [
    ["Par", String(h.par)],
    ["Length", fmtDist(h.length, u)],
    ["Plays like", fmtDist(h.playsLike, u)],
    ["Elevation", fmtElev(h.elevation, u)]
  ];
  if (h.teeElevation !== undefined && h.basketElevation !== undefined) out.push(["Tee / basket", `${fmtDist(h.teeElevation, u)} / ${fmtDist(h.basketElevation, u)}`]);
  if (h.climb !== undefined) out.push(["Climb / drop", `${fmtDist(h.climb, u)} / ${fmtDist(h.descent ?? 0, u)}`]);
  if (h.maxSlope !== undefined) out.push(["Steepest", `${Math.round(h.maxSlope)}%`]);
  if (h.shape) out.push(["Shape", SHAPE[h.shape] ?? h.shape]);
  if (h.obInPlay !== undefined) out.push(["OB in play", h.obInPlay ? "Yes" : "No"]);
  if (h.treesOnLine !== undefined) out.push(["Trees on the line", String(h.treesOnLine)]);
  if (h.difficulty !== undefined) out.push(["Difficulty", `${h.difficulty} of 5`]);
  return out;
}
