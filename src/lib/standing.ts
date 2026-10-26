// The measured trees standing now (the 3D view works them out: the survey's, less those cut for
// the holes, by hand, or under paths and buildings), so the painted map paints the same ones.
import type { AreaItem, LidarTree } from "../types";

let standing: { key: string; trees: LidarTree[] } | null = null;
const told = new Set<() => void>();

export const measuredStanding = () => standing;
export const setMeasuredStanding = (v: { key: string; trees: LidarTree[] } | null) => { standing = v; told.forEach(f => f()); };
/** Called when the standing trees change; returns the call to stop. */
export const onStanding = (f: () => void) => { told.add(f); return () => { told.delete(f); }; };

/** Woods that show the survey's trees, each where it stands (it came in with the survey, or is set
 * to its measured trees); the rest, drawn by hand or set to Planted, get the app's own trees. */
export const showsMeasured = (a: Pick<AreaItem, "trees" | "importSource">) => a.trees === "measured" || (a.trees === undefined && !!a.importSource);
