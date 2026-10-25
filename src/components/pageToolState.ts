// Whether a phone's Map step tool is open (mobile/PageTools): the page's zoom buttons stand aside
// while one is (a pinch still zooms).
import { useSyncExternalStore } from "react";

let open = false;
const subs = new Set<() => void>();
export const setToolOpen = (v: boolean) => { if (v === open) return; open = v; subs.forEach(f => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useToolOpen = () => useSyncExternalStore(subscribe, () => open);
