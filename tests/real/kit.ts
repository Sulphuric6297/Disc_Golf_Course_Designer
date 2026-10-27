// What the real-course checks share: signing up on the test server, the demo course opened and
// saved there, the map's own hooks, and the speed probes.
import { expect, type Page } from "@playwright/test";
import { SETUP_CODE } from "../../playwright.real.config";

type W = Record<string, any>;

/** The first account made on the emptied test server, signed in, and the demo course (with
 * `change` made to it first) started and saved there, open in the editor. */
export async function openDemo(page: Page, change: (doc: W) => void = () => {}) {
  page.on("pageerror", e => console.log("[page error]", e.message));
  await page.goto("/");
  const r = await page.request.post("/api/setup", { data: { code: SETUP_CODE, username: "tester", displayName: "Tester", password: "a long test password 1" } });
  expect(r.ok(), await r.text()).toBe(true);
  await page.goto("/");
  await expect(page.getByTestId("home")).toBeVisible();
  const doc = await (await page.request.get("/example/course.json")).json();
  change(doc);
  await page.evaluate(d => (window as W).__dgServer.start(d), doc);
  await page.waitForFunction(() => !!(window as W).__dgView && (window as W).__dgCourse?.()?.holes?.length > 0, null, { timeout: 60_000 });
  await page.evaluate(() => (window as W).__dgServer.saveNow());
  await expect.poll(() => page.evaluate(() => (window as W).__dgServer.state().id), { timeout: 30_000 }).toBeTruthy();
  return doc;
}

export const course = (page: Page) => page.evaluate(() => (window as W).__dgCourse()) as Promise<W>;
export const editor = (page: Page) => page.evaluate(() => { const e = (window as W).__dgEditor(); return { step: e.step, tool: e.tool, selectedId: e.selectedId, view: e.view, flyKey: e.flyKey }; });
export const saved = (page: Page) => page.evaluate(() => { const s = (window as W).__dgServer.state(); return { id: s.id, status: s.status, version: s.version, conflict: s.conflict }; });

/** Where a plan point is on screen, `lift` ft up (the map at rest). */
export const at = (page: Page, x: number, y: number, lift = 0) => page.evaluate(([x, y, lift]) => (window as W).__dgView.toClient(x, y, lift), [x, y, lift] as const) as Promise<{ x: number; y: number }>;

/** The map framed on a box of the plan, at once. */
export const frame = (page: Page, b: { minX: number; minY: number; maxX: number; maxY: number }) => page.evaluate(b => (window as W).__dgView.fitBounds(b, { animate: false }), b);

/** Two frames drawn: what was asked for is on screen. */
export const frames = (page: Page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));

/**
 * The app's own work timed, without the drawing (this machine has no graphics card, so drawing a
 * frame takes seconds here and says nothing about a real computer): the 3D view draws nothing
 * until `draw(true)`.
 */
export const draw = (page: Page, on: boolean) => page.evaluate(on => {
  const v = (window as W).__dgView, r = v.renderer;
  r.__render ??= r.render.bind(r);
  r.render = on ? r.__render : () => {};
  v.invalidate();
}, on);

/** From now on, every stretch the page couldn't answer for longer than 50 ms (a long task), kept
 * until `stalls` reads them. */
export const watch = (page: Page) => page.evaluate(() => {
  const w = window as W;
  w.__stalls = [];
  w.__stallObs?.disconnect();
  w.__stallObs = new PerformanceObserver(l => l.getEntries().forEach(e => w.__stalls.push(Math.round(e.duration))));
  w.__stallObs.observe({ type: "longtask", buffered: false });
});
/** The longest stall since `watch`, ms, and how many there were over `over` ms. */
export const stalls = async (page: Page, over = 200) => {
  const all = (await page.evaluate(() => (window as W).__stalls as number[])) ?? [];
  return { longest: Math.max(0, ...all), over: all.filter(d => d > over).length, all };
};
