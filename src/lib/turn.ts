// Which things turn: the Inspector's Turn buttons, the map's turn handle and a two-finger twist.
import type { CourseItem } from "../types";

/** Long shapes drawn along the ground (a road, a creek, woods, a fairway): turning one a few
 * degrees is no use, so they don't turn. */
export const NO_TURN = new Set<string>(["water", "woods", "rough", "fairway", "sand", "road", "path", "walk", "stream"]);

/** Whether a thing turns (locked or not). */
export const turnable = (item: CourseItem) =>
  item.type === "area" || item.type === "line" ? item.points.length >= 2 && !NO_TURN.has(item.kind) : item.type === "structure" ? item.points.length >= 2 : item.type !== "tree" && item.type !== "basket";
