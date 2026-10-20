// Distances are stored in feet; shown in feet or meters.
import { FT_PER_M } from "../constants";
import type { Units } from "../types";

export const toUnits = (ft: number, units: Units) => (units === "m" ? ft / FT_PER_M : ft);

/** "312 ft" / "95 m". */
export const fmtDist = (ft: number, units: Units, withUnit = true) => {
  const v = Math.round(toUnits(ft, units));
  return withUnit ? `${v.toLocaleString()} ${units}` : v.toLocaleString();
};

/** Elevation change with its sign: "+12 ft", "−4 ft", "level". */
export const fmtElev = (ft: number, units: Units) => {
  const v = toUnits(ft, units);
  const r = Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  if (Math.abs(r) < 0.5) return "level";
  return `${r > 0 ? "+" : "−"}${Math.abs(r)} ${units}`;
};

/** Both units, for signs: "312 ft / 95 m". */
export const fmtBoth = (ft: number) => `${Math.round(ft)} ft / ${Math.round(ft / FT_PER_M)} m`;

/** An area: "4,200 sq ft" or "1.3 acres" / "390 m²" or "1.2 ha". */
export const fmtArea = (sqft: number, units: Units) => {
  if (units === "m") {
    const m2 = sqft / (FT_PER_M * FT_PER_M);
    return m2 >= 10000 ? `${(m2 / 10000).toFixed(1)} ha` : `${Math.round(m2).toLocaleString()} m²`;
  }
  return sqft >= 43560 / 4 ? `${(sqft / 43560).toFixed(sqft >= 43560 * 10 ? 0 : 1)} acres` : `${Math.round(sqft).toLocaleString()} sq ft`;
};
