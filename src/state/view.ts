// The live map view, for buttons and panels outside the map (fit, tee view, snapshots). Kept apart
// from the map's own module: the sign-in and the course list ask for it without loading the 3D view.
import type { CourseView } from "../viewport/CourseView";

let current: CourseView | null = null;
const listeners = new Set<(v: CourseView | null) => void>();
/** The live map view (null until the map is up). */
export const getView = () => current;
export const setLiveView = (v: CourseView | null) => { current = v; listeners.forEach(fn => fn(v)); };
/** Told when the map view comes up or goes (it loads after the page): returns how to stop. */
export const onLiveView = (fn: (v: CourseView | null) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
