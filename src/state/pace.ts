// Work that can wait (a painting made ahead, the course's picture for the list): done only while
// the map is still and the browser has time to spare, a few ms at a time, so using the map never
// stalls for it.
import { getView } from "./view";

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));
type Idle = (f: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => void;

/** Waits for a moment to spare (the map still for a little while, the browser idle) and says how
 * many ms the next slice of work may take; `now()` true: no waiting, a usual slice. */
export const spareMoment = async (now: () => boolean = () => false): Promise<number> => {
  for (;;) {
    if (now()) { await sleep(0); return 8; }
    // (the map moving, or something dragged on it: later)
    if ((getView()?.stillFor() ?? Infinity) < 800) { await sleep(250); continue; }
    const idle = (window as { requestIdleCallback?: Idle }).requestIdleCallback;
    if (!idle) { await sleep(30); return 4; }
    const left = await new Promise<number>(res => idle(d => res(d.timeRemaining()), { timeout: 1000 }));
    if (now()) return 8;
    if (left >= 3) return Math.min(10, left - 1);
    await sleep(16);
  }
};
