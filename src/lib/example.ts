// The demo's example course: a whole course to look round (its holes, woods, signs and maps), the
// first thing a new visitor gets. It's a course like any other once it's open, kept in this browser
// with the rest. Nothing in it places it on the earth: an example course is cleaned of that (its
// spot, its bounds, where its photo came from) before it's ever kept or published.
import type { CourseDoc } from "../types";
import { normalizeCourse } from "./course";

export const EXAMPLE_ID = "example-thunder-hollow";
export const EXAMPLE_URL = `${import.meta.env.BASE_URL}example/course.json`;
export const EXAMPLE_THUMB = `${import.meta.env.BASE_URL}example/thumb.jpg`;
/** Where the example lives in the code (what the back door replaces). */
export const EXAMPLE_PATHS = { course: "public/example/course.json", thumb: "public/example/thumb.jpg" };

/** Set by the tests: the app starts empty, with no dashboard and no example. */
export const START_BLANK_KEY = "hyzerlab-start-blank";
export const startsBlank = () => {
  try { return localStorage.getItem(START_BLANK_KEY) === "1"; } catch { return false; }
};

/** A course with nothing that places it on the earth, as the example. */
export const asExample = (doc: CourseDoc): CourseDoc => {
  return {
    ...doc,
    id: EXAMPLE_ID,
    seed: doc.seed ?? doc.id ?? EXAMPLE_ID,
    site: { ...doc.site, location: null, bounds: null, ...(doc.site?.imagerySource ? { imagerySource: "Aerial photo" } : {}), ...(doc.site?.elevationSource ? { elevationSource: "Terrain survey" } : {}) },
    // (its measured trees kept; the aerial survey's own name says where it was flown)
    lidar: doc.lidar ? { ...doc.lidar, source: "Aerial survey" } : undefined,
    items: doc.items.map(i => ("importSource" in i && i.importSource === "osm" ? { ...i, importSource: undefined } : i)) as CourseDoc["items"]
  };
};

let fetching: Promise<CourseDoc> | null = null;
/** The example as published, fresh. */
export const fetchExample = () =>
  (fetching ??= fetch(EXAMPLE_URL)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(raw => asExample(normalizeCourse(raw)))
    .catch(err => { fetching = null; throw err; }));
