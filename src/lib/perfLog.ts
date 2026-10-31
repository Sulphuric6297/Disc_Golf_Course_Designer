// The lag recorder: with #perf in the page's address (or hyzerlab-perf=1 kept in the browser),
// the app's big jobs are timed (the 3D scene made again, each wood made, a tree grown, a step of
// the ground's painting, a frame drawn), and every frame that comes late (over 100 ms) is noted
// with the jobs that ran in it. components/PerfPanel shows them, to copy and send. Off, it costs
// nothing but a check.

let on: boolean | null = null;
export const perfOn = () => {
  if (on !== null) return on;
  try { on = typeof location !== "undefined" && (location.hash.includes("perf") || localStorage.getItem("hyzerlab-perf") === "1"); } catch { on = false; }
  return on;
};

type Job = { name: string; at: number; ms: number };
const jobs: Job[] = [];
export type LateFrame = { at: number; ms: number; jobs: { name: string; ms: number }[] };
const late: LateFrame[] = [];
const listeners = new Set<() => void>();

/** `fn` timed under `name` (when the recorder is on; a job under 8 ms isn't kept). */
export const timed = <T>(name: string, fn: () => T): T => {
  if (!perfOn()) return fn();
  const at = performance.now();
  try { return fn(); } finally {
    const ms = performance.now() - at;
    if (ms >= 8) { jobs.push({ name, at, ms }); if (jobs.length > 5000) jobs.splice(0, 1000); }
  }
};

/** Starts noting late frames (once). */
let started = false;
export const startPerf = () => {
  if (started || !perfOn() || typeof requestAnimationFrame === "undefined") return;
  started = true;
  let last = performance.now();
  const frame = (t: number) => {
    const ms = t - last;
    if (ms > 100) {
      // (the jobs that ran in the gap, the same ones added up)
      const by = new Map<string, number>();
      for (const j of jobs) if (j.at + j.ms > last && j.at < t) by.set(j.name, (by.get(j.name) ?? 0) + j.ms);
      late.push({ at: Math.round(last), ms: Math.round(ms), jobs: [...by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, m]) => ({ name, ms: Math.round(m) })) });
      if (late.length > 60) late.shift();
      listeners.forEach(fn => fn());
    }
    last = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

export const lateFrames = () => late;
/** Each job's time in all, and how many times it ran, since the page opened (of the ones kept). */
export const jobTotals = () => {
  const by = new Map<string, { ms: number; n: number }>();
  for (const j of jobs) { const t = by.get(j.name) ?? { ms: 0, n: 0 }; t.ms += j.ms; t.n++; by.set(j.name, t); }
  return [...by].sort((a, b) => b[1].ms - a[1].ms).map(([name, t]) => ({ name, ms: Math.round(t.ms), n: t.n }));
};
if (typeof window !== "undefined") (window as unknown as { __perf: unknown }).__perf = { jobTotals, lateFrames };
export const onLate = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const clearLate = () => { late.length = 0; listeners.forEach(fn => fn()); };
/** What to send: the late frames, the device, the page's size. */
export const perfReport = () => JSON.stringify({ when: new Date().toISOString(), agent: navigator.userAgent, screen: [screen.width, screen.height, devicePixelRatio], cores: navigator.hardwareConcurrency, late }, null, 1);
