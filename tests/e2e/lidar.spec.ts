import { test as plain, expect as plainExpect } from "@playwright/test";
import { readFileSync } from "fs";
import { createLazPerf } from "laz-perf";
import { test, expect, addHole, importSite, course, editorState, screenOf, withLidar, SITE } from "./fixtures";
import { createEmptyCourse, newHole } from "../../src/lib/course";
import { getGeoBounds } from "../../src/lib/geo/core";
import { emptyPoints, grownTree, saplings, fairwayTrees, findTrees, groundOnGrid, measureSite, readTile, siteBox, standingTrees, surveyYear, tilesOver, depthFor, type LazReader } from "../../src/lib/lidar";
import type { LidarTree } from "../../src/types";

const FT = 3.28084;
// The made-up survey's trees (tests/fixtures/lidar/make.py): meters east and north of the site's
// middle, height and crown radius (m), a conifer
const TREES = [[30, 20, 18, 4.5, 0], [-40, -10, 25, 2.6, 1], [60, -70, 22, 5, 0], ...[-60, -40, -20, 0, 20].map(x => [x, -40, 16, 3.5, 0])];
const W = 1200, H = 1000;
const ref = { ...getGeoBounds({ lat: SITE.lat, lon: SITE.lon, label: "" }, W, H), width: W, height: H };
const plan = (e: number, n: number) => ({ x: W / 2 + e * FT, y: H / 2 - n * FT });

plain("trees and ground from a LiDAR tile: each tree where it stands, as tall and wide as it is, conifers told apart; the ground's slope (pure logic)", async () => {
  const lp = (await createLazPerf()) as unknown as LazReader;
  const pts = emptyPoints();
  readTile(lp, new Uint8Array(readFileSync(new URL("../fixtures/lidar/ept-data/0-0-0-0.laz", import.meta.url))), ref, siteBox(ref), pts);
  plainExpect(pts.x.length).toBeGreaterThan(50_000);
  plainExpect(new Set(pts.cls)).toEqual(new Set([2, 5]));
  const m = measureSite(pts, W, H);
  const trees = findTrees(m);
  plainExpect(trees).toHaveLength(TREES.length);
  for (const [e, n, h, r, conifer] of TREES) {
    const p = plan(e, n);
    const t = trees.reduce((a, b) => (Math.hypot(b[0] - p.x, b[1] - p.y) < Math.hypot(a[0] - p.x, a[1] - p.y) ? b : a));
    plainExpect(Math.hypot(t[0] - p.x, t[1] - p.y)).toBeLessThan(5);
    plainExpect(Math.abs(t[2] - h * FT)).toBeLessThan(2.5);
    plainExpect(Math.abs(t[3] - r * FT)).toBeLessThan(5);
    plainExpect(t[4]).toBe(conifer);
  }
  // The ground: rising 2 ft in every 100 east, on the plan's grid (ft over its lowest point)
  const g = groundOnGrid(m, W, H, 10);
  plainExpect((g.heights["1000,500"] ?? 0) - (g.heights["200,500"] ?? 0)).toBeCloseTo(16, 0);
  plainExpect(g.min).toBeGreaterThan(180 * FT - 30);
  // Which tiles to read, how deep, and a survey's year from its name
  plainExpect(depthFor({ bounds: [0, 0, 0, 69934, 69934, 69934], span: 128, dataType: "laszip" })).toBe(9);
  const asked: string[] = [];
  const tiles = await tilesOver({ bounds: [0, 0, 0, 1024, 1024, 1024], span: 128, dataType: "laszip" }, [0, 0, 100, 100], 1, async key => {
    asked.push(key);
    return key === "0-0-0-0" ? { "0-0-0-0": 10, "1-0-0-0": -1, "1-1-1-0": 5 } : { "1-0-0-0": 7, "2-0-0-0": 3 };
  });
  plainExpect(tiles).toEqual([{ key: "0-0-0-0", points: 10 }, { key: "1-0-0-0", points: 7 }]);
  plainExpect(asked).toEqual(["0-0-0-0", "1-0-0-0"]);
  plainExpect(surveyYear("USGS_LPC_IL_WestCentral_2017_LAS_2019")).toBe(2019);
});

plain("trees on a fairway are cut down unless kept; taken out anywhere; a hole's fairway trees counted (pure logic)", () => {
  const trees: LidarTree[] = [[100, 300, 50, 12, 0], [200, 302, 50, 12, 0], [300, 298, 50, 12, 0], [200, 400, 50, 12, 0]];
  const doc = { ...createEmptyCourse(), lidar: { source: "USGS LiDAR 2019", trees } };
  // (the fairway: a strip along y = 300)
  const cleared = (p: { x: number; y: number }, reach: number) => Math.abs(p.y - 300) < 15 + reach;
  plainExpect(standingTrees(doc.lidar, cleared)).toEqual({ stand: [3], cut: [0, 1, 2] });
  doc.lidar = { ...doc.lidar, kept: [1], removed: [3] };
  plainExpect(standingTrees(doc.lidar, cleared)).toEqual({ stand: [1], cut: [0, 2, 3] });
  // (fairways left alone: only what was taken out by hand is down)
  plainExpect(standingTrees({ ...doc.lidar, clearFairways: false }, cleared)).toEqual({ stand: [0, 1, 2], cut: [3] });
  const hole = newHole({ fairwayWidth: 30 });
  plainExpect(fairwayTrees(doc, hole, [{ x: 50, y: 300 }, { x: 350, y: 300 }])).toEqual({ cut: [0, 2], kept: [1] });
});

test("trees measured from the air on import: cut down on a fairway, a stump to bring each back, all at once from the hole; cut down by hand; flyovers keep clear", async ({ page }) => {
  test.setTimeout(240_000);
  await withLidar(page);
  await importSite(page);
  const doc = await course(page);
  expect(doc.lidar.source).toBe("USGS LiDAR 2019");
  expect(doc.lidar.trees).toHaveLength(TREES.length);
  expect(doc.site.elevationSource).toBe("USGS LiDAR 2019");
  // (none guessed from the photo as well)
  expect(doc.items.filter((i: any) => i.type === "tree" || (i.type === "area" && i.kind === "woods"))).toHaveLength(0);
  const W2 = doc.canvas.width, H2 = doc.canvas.height;
  const at = (e: number, n: number) => ({ x: W2 / 2 + e * FT, y: H2 / 2 - n * FT });
  const nearest = (p: { x: number; y: number }) => doc.lidar.trees.findIndex((t: number[]) => Math.hypot(t[0] - p.x, t[1] - p.y) < 6);
  // A hole down the row of five trees: they're cut down, stumps where they stood
  const forest = () => page.evaluate(() => (window as any).__dgView.forestInfo().trees);
  const row = [-60, -40, -20, 0, 20].map(e => nearest(at(e, -40)));
  expect(row.every(k => k >= 0)).toBe(true);
  const hole = await addHole(page, at(-75, -40), at(35, -40));
  await page.keyboard.press("Escape");
  await page.evaluate(id => (window as any).__dgActions.select(id), hole.id);
  for (const k of row) await expect(page.locator(`[data-stump="${k}"]`)).toHaveAttribute("data-testid", "stump");
  await expect(page.getByTestId("fairway-trees")).toContainText("5 cut down");
  const before = await forest() + 5;
  // One brought back with a click on its stump (one undo step); one not under the hole's label or handles
  const free = await page.evaluate(row => row.find(k => {
    const el = document.querySelector(`[data-stump="${k}"]`) as HTMLElement | null;
    if (!el || el.offsetParent === null || getComputedStyle(el).visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
  }) ?? null, row);
  expect(free).not.toBeNull();
  await page.locator(`[data-stump="${free}"]`).click();
  await expect.poll(async () => (await course(page)).lidar.kept).toEqual([free]);
  await expect.poll(forest).toBe(before - 4);
  await expect(page.getByTestId("kept-tree")).toHaveCount(1);
  await expect(page.getByTestId("fairway-trees")).toContainText("4 cut down · 1 kept");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).lidar.kept).toBeUndefined();
  // All at once from the hole, and down again
  await page.getByTestId("trees-back").click();
  await expect.poll(async () => (await course(page)).lidar.kept).toEqual([...row].sort((a, b) => a - b));
  await expect.poll(forest).toBe(before);
  await page.getByTestId("trees-down").click();
  await expect.poll(async () => (await course(page)).lidar.kept).toBeUndefined();
  // A tree off the fairway cut down from its right-click menu, and back with its stump
  await page.keyboard.press("Escape");
  // (one standing: not on the footpath across the site)
  const spots = [at(60, -70), at(-40, -10), at(30, 20)];
  const standing = await page.evaluate(qs => qs.map(q => (window as any).__dgView.lidarTreeAt(q)), spots);
  const here = spots[standing.findIndex((k: number | null) => k !== null)];
  expect(here).toBeTruthy();
  const lone = nearest(here);
  const p = await screenOf(page, here.x, here.y);
  await page.mouse.click(p.x, p.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Cut down this tree" }).click();
  await expect.poll(async () => (await course(page)).lidar.removed).toEqual([lone]);
  await expect.poll(forest).toBe(before - 6);
  // (stumps away from the hole picked show close up)
  await page.evaluate(([x, y]) => { const v = (window as any).__dgView; v.controls.moveTo(x, v.h(x, y), y, false); v.controls.dollyTo(120, false); v.invalidate(); }, [here.x, here.y]);
  await page.locator(`[data-stump="${lone}"]`).click();
  await expect.poll(async () => (await course(page)).lidar.removed).toBeUndefined();
  // Flyovers keep clear of the trees standing: one measured tree's crown, as tall as it is
  const crown = await page.evaluate(p => (window as any).__dgView.canopyAt(p, 4), here);
  expect(crown.top - (await page.evaluate(p => (window as any).__dgView.h(p.x, p.y), here))).toBeGreaterThan(55);
  expect((await editorState(page)).step).toBe("holes");
});

test("an existing course measured from the air from the Site step (Undo takes it back)", async ({ page }) => {
  test.setTimeout(180_000);
  await importSite(page, { trees: false, osm: false });
  expect((await course(page)).lidar).toBeUndefined();
  await withLidar(page);
  await page.getByRole("button", { name: /^1\s*Site$/ }).click();
  await page.getByTestId("measure-lidar").click();
  await expect.poll(async () => (await course(page)).lidar?.trees.length ?? 0, { timeout: 60_000 }).toBe(TREES.length);
  await expect(page.getByTestId("lidar-info")).toContainText(`${TREES.length} trees measured from the air · USGS LiDAR 2019`);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).lidar).toBeUndefined();
});

plain("measured trees never stand where no tree does (in water, on a road): cut, unless kept (pure logic)", () => {
  const lidar = { source: "test", trees: [[10, 10, 40, 12, 0], [100, 100, 40, 12, 0], [200, 200, 40, 12, 0]] as LidarTree[], kept: [2] };
  // (the second is in a river, the third on a road but kept by hand)
  const inRiverOrRoad = (p: { x: number; y: number }) => p.x > 50;
  const { stand, cut } = standingTrees(lidar, () => false, inRiverOrRoad);
  plainExpect(stand).toEqual([0, 2]);
  plainExpect(cut).toEqual([1]);
});

plain("measured trees smaller than the course keeps are cut, unless kept by hand (pure logic)", () => {
  const lidar = { source: "test", trees: [[10, 10, 12, 6, 0], [100, 100, 40, 12, 0], [200, 200, 8, 4, 0]] as LidarTree[], kept: [2], minHeight: 15 };
  const { stand, cut } = standingTrees(lidar, () => false);
  plainExpect(stand).toEqual([1, 2]);
  plainExpect(cut).toEqual([0]);
});

plain("measured trees grown since the survey: small ones the most, tall ones hardly, crowns with them (pure logic)", () => {
  const small = grownTree([0, 0, 10, 4, 0], 9), mid = grownTree([0, 0, 50, 15, 0], 9), tall = grownTree([0, 0, 95, 25, 0], 9);
  plainExpect(small[2] - 10).toBeGreaterThan(mid[2] - 50);
  plainExpect(mid[2] - 50).toBeGreaterThan(tall[2] - 95);
  plainExpect(small[2]).toBeGreaterThan(25);
  plainExpect(tall[2]).toBeLessThan(100);
  plainExpect(mid[3]).toBeGreaterThan(15);
  plainExpect(grownTree([0, 0, 40, 12, 1], 0)).toEqual([0, 0, 40, 12, 1]);
});

plain("saplings since the survey: none at once, more with the years, near the measured trees, fast and narrow (pure logic)", () => {
  const woods: [number, number, number, number, 0 | 1][] = Array.from({ length: 200 }, (_, k) => [(k % 20) * 30, Math.floor(k / 20) * 30, 50, 15, 0]);
  plainExpect(saplings(woods, 0)).toEqual([]);
  const ten = saplings(woods, 10), twenty = saplings(woods, 20);
  plainExpect(ten.length).toBeGreaterThan(10);
  plainExpect(twenty.length).toBeGreaterThan(ten.length);
  for (const s of ten) {
    plainExpect(s[2]).toBeGreaterThanOrEqual(6);
    plainExpect(s[2]).toBeLessThan(40);
    plainExpect(s[3] / s[2]).toBeLessThan(15 / 50);
    const near = woods.some(t => Math.hypot(t[0] - s[0], t[1] - s[1]) <= 15 * 2.4);
    plainExpect(near).toBe(true);
  }
  plainExpect(saplings(woods, 10)).toEqual(ten);
});

test("bring trees back in an area: a freehand loop round the stumps puts the measured trees back (one undo step)", async ({ page }) => {
  test.setTimeout(240_000);
  await withLidar(page);
  await importSite(page);
  const doc = await course(page);
  const W2 = doc.canvas.width, H2 = doc.canvas.height;
  const at = (e: number, n: number) => ({ x: W2 / 2 + e * FT, y: H2 / 2 - n * FT });
  const nearest = (p: { x: number; y: number }) => doc.lidar.trees.findIndex((t: number[]) => Math.hypot(t[0] - p.x, t[1] - p.y) < 6);
  const row = [-60, -40, -20, 0, 20].map(e => nearest(at(e, -40)));
  await addHole(page, at(-75, -40), at(35, -40));
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await course(page)).lidar.kept).toBeUndefined();
  // The Site step's button, then a loop drawn round the row with the mouse held down
  await page.getByRole("button", { name: /Site/ }).click();
  await page.getByTestId("lasso-keep").click();
  const loop = [at(-75, -25), at(35, -25), at(35, -55), at(-75, -55), at(-75, -28)];
  const s0 = await screenOf(page, loop[0].x, loop[0].y);
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  for (const p of loop.slice(1)) { const s = await screenOf(page, p.x, p.y); await page.mouse.move(s.x, s.y, { steps: 8 }); }
  await page.mouse.up();
  await expect.poll(async () => (await course(page)).lidar.kept).toEqual([...row].sort((a, b) => a - b));
  // (no woods area was made)
  expect((await course(page)).items.filter((i: any) => i.type === "area" && i.kind === "woods")).toHaveLength(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).lidar.kept).toBeUndefined();
});
