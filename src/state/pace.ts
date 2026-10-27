// Work that can wait (a painting made ahead, the course's picture for the list): done only while
// nobody is using the page and the map is still, with the browser idle, a few ms at a time, so
// using the map never stalls for it.
import { getView } from "./view";

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
type Idle = (f: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => void;

// Someone using the page: a button or finger held down, the pointer moving, the wheel turned, a key
// pressed (moving the camera, typing). Watched for the whole page, whatever is used.
let held = 0, lastUsed = 0;
if (typeof window !== "undefined") {
  const used = () => { lastUsed = performance.now(); };
  window.addEventListener("pointerdown", () => { held++; used(); }, true);
  const up = () => { held = Math.max(0, held - 1); used(); };
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("pointermove", e => { if (e.buttons || held) used(); }, true);
  window.addEventListener("wheel", used, { capture: true, passive: true });
  window.addEventListener("keydown", used, true);
  // (a press that never comes back up, the window left mid-drag: not held for ever)
  window.addEventListener("blur", () => { held = 0; });
}

/** Waits for a moment to spare (nobody using the page or moving the map for a little while, the
 * browser idle) and says how many ms the next slice of work may take; `now()` true: no waiting,
 * a usual slice. */
export const spareMoment = async (now: () => boolean = () => false): Promise<number> => {
  for (;;) {
    if (now()) { await sleep(0); return 8; }
    // (the page in use, or the map moving: later)
    if (held || performance.now() - lastUsed < 800 || (getView()?.stillFor() ?? Infinity) < 800) { await sleep(250); continue; }
    const idle = (window as { requestIdleCallback?: Idle }).requestIdleCallback;
    if (!idle) { await sleep(30); return 4; }
    const left = await new Promise<number>(res => idle(d => res(d.timeRemaining()), { timeout: 1000 }));
    if (now()) return 8;
    if (left >= 3) return Math.min(10, left - 1);
    await sleep(16);
  }
};
