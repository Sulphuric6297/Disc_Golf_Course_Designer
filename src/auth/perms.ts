// What can be shown of a course: to a viewer on it, or through a public link (the server's
// PARTS in server/src/routes/public.ts). The app shows a viewer only what they may see; a link
// gets only the published site's parts it allows, from the server.
import { useServerCourse } from "./courses";

export const PARTS = ["map", "view3d", "flyovers", "printedMap", "teeSigns", "scorecard", "stats", "downloads", "copy", "comments"] as const;
export type Part = (typeof PARTS)[number];
export type Perms = Partial<Record<Part, boolean>>;

export const PART_LABELS: Record<Part, string> = {
  map: "The map (top-down)",
  view3d: "3D and views from the tees",
  flyovers: "Flyovers",
  printedMap: "The course map (printed look)",
  teeSigns: "Tee signs",
  scorecard: "Scorecard",
  stats: "Hole numbers (par, length, elevation)",
  downloads: "Downloads (GPS files, prints)",
  copy: "Make a copy",
  comments: "Comments"
};

/** A viewer on the course, unless the owner chose otherwise: everything but downloads. */
export const VIEWER_DEFAULT: Perms = { map: true, view3d: true, flyovers: true, printedMap: true, teeSigns: true, scorecard: true, stats: true, downloads: false, copy: true, comments: true };
/** A new public link: the pictures and numbers, not the course itself. */
export const LINK_DEFAULT: Perms = { map: false, view3d: false, flyovers: false, printedMap: true, teeSigns: true, scorecard: true, stats: true, downloads: false, copy: false, comments: false };
/** What a link can't have (comments need someone signed in). */
export const LINK_PARTS = PARTS.filter(p => p !== "comments" && p !== "copy");

/** What the open course lets you see (owners and editors: everything). */
export const allowed = (part: Part) => {
  const c = useServerCourse.getState();
  if (c.role !== "viewer") return true;
  return (c.perms ?? VIEWER_DEFAULT)[part] ?? VIEWER_DEFAULT[part] ?? false;
};
export const useAllowed = (part: Part) => useServerCourse(c => (c.role !== "viewer" ? true : ((c.perms ?? VIEWER_DEFAULT)[part] ?? VIEWER_DEFAULT[part] ?? false)));
