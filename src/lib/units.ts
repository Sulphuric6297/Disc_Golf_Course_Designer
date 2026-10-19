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
