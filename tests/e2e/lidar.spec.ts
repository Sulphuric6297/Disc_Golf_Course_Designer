import { test as plain, expect as plainExpect } from "@playwright/test";
import { readFileSync } from "fs";
import { createLazPerf } from "laz-perf";
import { test, expect, addHole, blankCourse, importSite, course, editorState, screenOf, withLidar, SITE } from "./fixtures";
import { createEmptyCourse, newHole } from "../../src/lib/course";
import { getGeoBounds } from "../../src/lib/geo/core";
import { emptyPoints, grownTree, saplings, fairwayTrees, findTrees, groundOnGrid, measureSite, readTile, siteBox, standingTrees, surveyYear, tilesOver, depthFor, type LazReader } from "../../src/lib/lidar";
import type { LidarTree } from "../../src/types";
import { treeStands } from "../../src/lib/geo/detect";
import { pointInPolygon } from "../../src/lib/geom";

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
  // (stumps away from the hole picked show close up when asked for, in Layers; never on a map only looked at)
  await page.evaluate(([x, y]) => { const v = (window as any).__dgView; v.controls.moveTo(x, v.h(x, y), y, false); v.controls.dollyTo(120, false); v.invalidate(); }, [here.x, here.y]);
  await expect(page.locator(`[data-stump="${lone}"]`)).toBeHidden();
  await page.getByTestId("scene-button").click();
  await page.getByTestId("scene-panel").getByRole("checkbox", { name: "Stumps of cut-down trees" }).check();
  await page.getByTestId("scene-button").click();
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

plain("saplings since the survey: none at once, more with the years, in the gaps (never under or against a crown), fast and narrow (pure logic)", () => {
  // (a wood with gaps: trees 50 ft apart, crowns 15 ft round)
  const woods: [number, number, number, number, 0 | 1][] = Array.from({ length: 200 }, (_, k) => [(k % 20) * 50, Math.floor(k / 20) * 50, 50, 15, 0]);
  plainExpect(saplings(woods, 0)).toEqual([]);
  const ten = saplings(woods, 10), twenty = saplings(woods, 20);
  plainExpect(ten.length).toBeGreaterThan(10);
  plainExpect(twenty.length).toBeGreaterThan(ten.length);
  const grownWoods = woods.map(t => grownTree(t, 10));
  for (const s of ten) {
    plainExpect(s[2]).toBeGreaterThanOrEqual(6);
    plainExpect(s[2]).toBeLessThan(40);
    plainExpect(s[3] / s[2]).toBeLessThan(15 / 50);
    // (clear of every crown, and near the wood it grows from)
    for (const t of grownWoods) plainExpect(Math.hypot(t[0] - s[0], t[1] - s[1])).toBeGreaterThanOrEqual(t[3] + 3 - 0.2);
    plainExpect(grownWoods.some(t => Math.hypot(t[0] - s[0], t[1] - s[1]) <= t[3] * 2 + 18.5)).toBe(true);
    for (const q of ten) if (q !== s) plainExpect(Math.hypot(q[0] - s[0], q[1] - s[1])).toBeGreaterThanOrEqual(8 - 0.2);
  }
  plainExpect(saplings(woods, 10)).toEqual(ten);
  // (a wood with no gaps: none)
  const dense: [number, number, number, number, 0 | 1][] = Array.from({ length: 100 }, (_, k) => [(k % 10) * 12 + 200, Math.floor(k / 10) * 12 + 200, 50, 15, 0]);
  plainExpect(saplings(dense, 10).filter(s => s[0] > 215 && s[0] < 293 && s[1] > 215 && s[1] < 293)).toEqual([]);
});

test("any tree the app planted in a wood acts like a tree placed by hand: picked by a click, the same panel, deleted; a look only is no change", async ({ page }) => {
  test.setTimeout(180_000);
  await blankCourse(page);
  await page.evaluate(() => {
    (window as any).__dgEditor().set({ areaKind: "woods" });
    (window as any).__dgActions.addDrawn("area", [{ x: 300, y: 300 }, { x: 800, y: 300 }, { x: 800, y: 700 }, { x: 300, y: 700 }]);
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const forest = () => page.evaluate(() => (window as any).__dgView.forestInfo().trees as number);
  await expect.poll(forest, { timeout: 40_000 }).toBeGreaterThan(50);
  const spot = async (cx: number, cy: number) => page.evaluate(([cx, cy]) => {
    const v = (window as any).__dgView;
    const spots = v.itemsGroup.children.flatMap((g: any) => g.userData.spots ?? []);
    const s = spots.sort((a: any, b: any) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    return { x: s.x, y: s.y, height: s.height, at: v.toClient(s.x, s.y, s.height * 0.6) };
  }, [cx, cy]);
  const trees = async () => (await course(page)).items.filter((i: any) => i.type === "tree");
  const before = await forest();
  // A click: the tree is picked, with the Tree panel, where it stood and as tall
  const a = await spot(550, 500);
  await page.mouse.click(a.at.x, a.at.y);
  await expect.poll(async () => (await trees()).length).toBe(1);
  const item = (await trees())[0];
  expect(Math.hypot(item.x - a.x, item.y - a.y)).toBeLessThan(0.5);
  expect(Math.abs(item.height - a.height)).toBeLessThanOrEqual(0.5);
  expect((await editorState(page)).selectedId).toBe(item.id);
  await expect(page.getByTestId("inspector")).toContainText("Tree");
  await expect.poll(forest).toBe(before - 1);
  // Let go without a change: as it was (looking isn't an edit)
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await trees()).length).toBe(0);
  await expect.poll(forest).toBe(before);
  // Picked and deleted: it stays gone
  await page.mouse.click(a.at.x, a.at.y);
  await expect.poll(async () => (await trees()).length).toBe(1);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await trees()).length).toBe(0);
  await expect.poll(forest).toBe(before - 1);
  await expect.poll(async () => (await course(page)).cutTrees?.length ?? 0).toBe(1);
  // Picked and made taller: kept, as a tree of the course's own
  const b = await spot(380, 380);
  await page.mouse.click(b.at.x, b.at.y);
  await expect.poll(async () => (await trees()).length).toBe(1);
  await page.getByRole("slider", { name: "Height" }).fill("60");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await trees()).map((t: any) => t.height)).toEqual([60]);
});

plain("the trees measured from the air in stands: crowns close together are one woods, a clearing between splits them, a tree alone stands on its own (pure logic)", async () => {
  // Two stands of 3 by 3 trees, 18 ft apart in each, 200 ft between the stands; one tree alone
  const stand = (x0: number, y0: number) => Array.from({ length: 9 }, (_, k) => ({ x: x0 + (k % 3) * 18, y: y0 + Math.floor(k / 3) * 18, r: 10 }));
  const a = stand(100, 100), b = stand(360, 120), lone = { x: 600, y: 500, r: 10 };
  const { cell, stands } = treeStands([...a, ...b, lone], 800, 700);
  plainExpect(stands).toHaveLength(2);
  const outlines = stands.map(s => s.outline.map(p => ({ x: p.x * cell, y: p.y * cell })));
  const inStand = (t: { x: number; y: number }) => outlines.findIndex(o => pointInPolygon(t, o));
  const ia = inStand(a[4]), ib = inStand(b[4]);
  plainExpect(ia).toBeGreaterThanOrEqual(0);
  plainExpect(ib).toBeGreaterThanOrEqual(0);
  plainExpect(ia).not.toBe(ib);
  for (const t of a) plainExpect(inStand(t)).toBe(ia);
  for (const t of b) plainExpect(inStand(t)).toBe(ib);
  plainExpect(inStand(lone)).toBe(-1);
  plainExpect(stands.map(s => s.trees).sort()).toEqual([9, 9]);
});

test("a drag box takes in the measured trees inside it: each made the course's own and picked together; let go untouched, they're as they were", async ({ page }) => {
  test.setTimeout(180_000);
  await withLidar(page);
  await importSite(page);
  const doc = await course(page);
  const W2 = doc.canvas.width, H2 = doc.canvas.height;
  const at = (e: number, n: number) => ({ x: W2 / 2 + e * FT, y: H2 / 2 - n * FT });
  const trees = async () => (await course(page)).items.filter((i: any) => i.type === "tree");
  await page.keyboard.press("Escape");
  // The row of five, in a Shift+drag box
  const from = await screenOf(page, at(-75, -25).x, at(-75, -25).y), to = await screenOf(page, at(35, -55).x, at(35, -55).y);
  await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await trees()).length).toBe(5);
  const picked = ((await editorState(page)).group as string[]).slice().sort();
  plainExpect(picked).toEqual((await trees()).map((t: any) => t.id).sort());
  plainExpect((await course(page)).lidar.removed).toHaveLength(5);
  await expect(page.getByTestId("inspector-title")).toHaveText("5 selected");
  // Let go without a change: the measured trees again, no items
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await trees()).length).toBe(0);
  plainExpect((await course(page)).lidar.removed).toBeUndefined();
});
