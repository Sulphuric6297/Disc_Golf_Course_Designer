// Which layout fits the screen:
// - "phone": a phone held upright (the map, a bottom sheet, the steps in a bar at the bottom);
// - "rail": a phone on its side, or a tablet held upright (the steps in a rail on the left, the
//   panel beside it, the map on the right);
// - "desktop": a computer or a tablet on its side (the layout with the top bar and side panel).
import { useSyncExternalStore } from "react";

export type Layout = "phone" | "rail" | "desktop";

const PHONE = "(max-width: 767px)";
const MEDIUM = "(min-width: 768px) and (max-width: 1023px)";
// (An aspect ratio, not the orientation: a phone's keyboard can make an upright page wider than tall)
const SHORT = "(max-height: 500px) and (min-aspect-ratio: 3/2)";
const TOUCH = "(pointer: coarse)";

const mq = (q: string) => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q) : null);

export const currentLayout = (): Layout => (mq(SHORT)?.matches || mq(MEDIUM)?.matches ? "rail" : mq(PHONE)?.matches ? "phone" : "desktop");

const subscribe = (fn: () => void) => {
  const list = [PHONE, MEDIUM, SHORT, TOUCH].map(mq).filter(Boolean) as MediaQueryList[];
  list.forEach(m => m.addEventListener("change", fn));
  return () => list.forEach(m => m.removeEventListener("change", fn));
};

export const useLayout = () => useSyncExternalStore(subscribe, currentLayout, () => "desktop" as Layout);

/** A touch screen is the main pointer (bigger targets, "tap" instead of "click", no keyboard keys). */
export const isTouch = () => !!mq(TOUCH)?.matches;
export const useTouch = () => useSyncExternalStore(subscribe, isTouch, () => false);
