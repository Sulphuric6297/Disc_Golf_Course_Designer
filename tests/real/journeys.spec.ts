// The real-course checks: the demo course (18 holes, measured trees, buildings, woods, the photo)
// on a real server, used the way a person uses it. Each check is a problem that has really come up,
// so it would have caught it, and most have a speed limit. One page and one course for the run.
//
// Speed limits are for this test machine, which has no graphics card: the 3D drawing is left out
// of them (see kit.ts: draw), so they measure the app's own work, which is what has stalled.
import { test, expect, type Page } from "@playwright/test";
import { at, course, draw, editor, frame, frames, openDemo, profiled, saved, stalls, watch } from "./kit";

test.describe.configure({ mode: "serial" });

// A corner of the site kept for the picking checks: a house with a tree just behind it, a path just
// in front of another tree, and tall grass round a third (the measured trees there taken out)
const BOX = { minX: 1460, minY: 100, maxX: 1840, maxY: 520 };
const HOUSE = [{ x: 1600, y: 200 }, { x: 1680, y: 200 }, { x: 1680, y: 250 }, { x: 1600, y: 250 }];
const BEHIND = { x: 1640, y: 188 };
const PATH = [{ x: 1520, y: 331 }, { x: 1600, y: 331 }];
const BY_PATH = { x: 1560, y: 320 };
const GRASS = [{ x: 1700, y: 270 }, { x: 1790, y: 270 }, { x: 1790, y: 350 }, { x: 1700, y: 350 }];
const IN_GRASS = { x: 1745, y: 300 };
const inBox = (p: { x: number; y: number }) => p.x >= BOX.minX && p.x <= BOX.maxX && p.y >= BOX.minY && p.y <= BOX.maxY;

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await openDemo(page, doc => {
    // (the corner cleared of what was there, then the check's own things put in)
    doc.items = doc.items.filter((i: any) => !(i.points ?? [i]).some(inBox) || i.type === "tee" || i.type === "basket" || i.kind === "water");
    doc.lidar.removed = [...new Set([...(doc.lidar.removed ?? []), ...doc.lidar.trees.map((t: number[], k: number) => (inBox({ x: t[0], y: t[1] }) ? k : -1)).filter((k: number) => k >= 0)])];
    doc.items.push(
      { id: "t-house", type: "structure", kind: "building", points: HOUSE, x: 1640, y: 225, height: 12 },
      { id: "t-behind", type: "tree", x: BEHIND.x, y: BEHIND.y, radius: 14, height: 40, treeType: "deciduous" },
      { id: "t-path", type: "line", kind: "path", points: PATH, x: 1560, y: 331 },
      { id: "t-bypath", type: "tree", x: BY_PATH.x, y: BY_PATH.y, radius: 14, height: 40, treeType: "deciduous" },
      { id: "t-grass", type: "area", kind: "rough", points: GRASS, x: 1745, y: 310 },
      { id: "t-ingrass", type: "tree", x: IN_GRASS.x, y: IN_GRASS.y, radius: 14, height: 40, treeType: "deciduous" }
    );
  });
});
test.afterAll(async () => { await page?.close(); });

const pickAt = async (p: { x: number; y: number }) => {
  await page.evaluate(() => (window as any).__dgActions.select(null));
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await editor(page)).selectedId, { timeout: 10_000 }).not.toBeNull();
  const id = (await editor(page)).selectedId;
  // (what it is, when it's not one of the check's own: said, to see what got in the way)
  if (!String(id).startsWith("t-")) console.log("picked", id, await page.evaluate(id => { const c = (window as any).__dgCourse(); const i = c.items.find((x: any) => x.id === id); return i ? `${i.type} ${i.kind ?? ""} ${JSON.stringify(i.points?.slice(0, 3) ?? [i.x, i.y])}` : c.holes.some((h: any) => h.id === id) ? "a hole" : "not an item"; }, id));
  return id;
};

test("autosave: edits made quickly, and two saves asked for at once, all reach the server with no clash", async () => {
  const before = (await saved(page)).version;
  await page.evaluate(() => (window as any).__dgActions.updateItem("t-house", { label: "Clubhouse" }));
  await page.evaluate(() => (window as any).__dgActions.updateItem("t-path", { label: "Lane" }));
  // (as the app does when the course is left while a save is waiting)
  await page.evaluate(() => Promise.all([(window as any).__dgServer.saveNow(), (window as any).__dgServer.saveNow()]));
  await page.evaluate(() => (window as any).__dgActions.updateItem("t-grass", { label: "Meadow" }));
  await expect.poll(async () => (await saved(page)).status, { timeout: 15_000 }).toBe("saved");
  const s = await saved(page);
  expect(s.conflict).toBe("");
  expect(s.version).toBeGreaterThan(before);
  const onServer = await (await page.request.get(`/api/courses/${s.id}`)).json();
  const doc = onServer.doc ?? onServer.course?.doc ?? onServer;
  const label = (id: string) => doc.items.find((i: any) => i.id === id)?.label;
  expect([label("t-house"), label("t-path"), label("t-grass")]).toEqual(["Clubhouse", "Lane", "Meadow"]);
});

test("picking in 3D: a roof in front of a tree picks the house; the path in front of a tree, the path; the tall grass round a tree, the grass", async () => {
  await page.evaluate(() => (window as any).__dgEditor().set({ step: "design", tool: "select" }));
  await page.keyboard.press("3");
  await frame(page, BOX);
  await page.waitForTimeout(1500);
  await draw(page, false);
  expect(await pickAt(await at(page, 1640, 238, 14))).toBe("t-house");
  expect(await pickAt(await at(page, 1532, 331, 0))).toBe("t-path");
  // (a spot in the grass inside the tree's reach but with no leaves drawn under it)
  const c = await at(page, IN_GRASS.x, IN_GRASS.y, 25);
  const spot = await page.evaluate(([x, y]) => {
    const v = (window as any).__dgView;
    for (let r = 2; r <= 160; r += 1.5) for (let a = 0; a < 6.28; a += 0.1) {
      const p = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }, hit = v.treeUnder(v.ray(p.x, p.y)), g = v.groundAt(p.x, p.y);
      if (hit && !hit.drawn && g && g.x > 1705 && g.x < 1785 && g.z > 275 && g.z < 345) return p;
    }
    return null;
  }, [c.x, c.y] as const);
  if (spot) expect(await pickAt(spot)).toBe("t-grass");
  expect(await pickAt(await at(page, BEHIND.x, BEHIND.y, 36))).toBe("t-behind");
});

test("dragging a house: each step quick, letting go quick, back with one undo", async () => {
  await draw(page, false);
  const was = (await course(page)).items.find((i: any) => i.id === "t-house").points[0];
  await page.evaluate(() => (window as any).__dgActions.select("t-house"));
  // (off the middle of the roof: its height handle is there in 3D)
  const c = await at(page, 1612, 242, 12);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  const steps: number[] = [];
  const { top, app } = await profiled(page, async () => {
    for (let i = 1; i <= 10; i++) {
      const s = Date.now();
      await page.mouse.move(c.x + i * 4, c.y + i * 2);
      await frames(page);
      steps.push(Date.now() - s);
    }
  });
  const s = Date.now();
  await page.mouse.up();
  await frames(page);
  const letGo = Date.now() - s;
  const perStep = app / steps.length;
  console.log("drag steps ms", steps.join(" "), "· the app's own work", Math.round(perStep), "ms a step · let go", letGo);
  if (perStep >= 60) console.log("where the drag's time went:\n" + top.join("\n"));
  expect(perStep).toBeLessThan(60);
  expect(letGo).toBeLessThan(1500);
  const now = (await course(page)).items.find((i: any) => i.id === "t-house").points[0];
  expect(Math.hypot(now.x - was.x, now.y - was.y)).toBeGreaterThan(3);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).items.find((i: any) => i.id === "t-house").points[0].x).toBeCloseTo(was.x, 1);
});

test("looking round 3D with a hole picked and the course at rest: no stall over 0.2 s", async () => {
  await draw(page, false);
  const hole = (await course(page)).holes[0];
  await page.evaluate(id => (window as any).__dgActions.select(id), hole.id);
  await page.evaluate(() => (window as any).__dgView.fitSite(false));
  // (at rest long enough for the ground to start painting ahead for a flyover)
  await page.waitForTimeout(3000);
  await watch(page);
  const turn = setInterval(() => void page.evaluate(() => { const v = (window as any).__dgView; v.controls.rotate(0.03, 0, false); v.invalidate(); }).catch(() => {}), 30);
  await page.waitForTimeout(8000);
  clearInterval(turn);
  const s = await stalls(page);
  console.log("stalls while turning, ms", s.all.join(" ") || "none");
  expect(s.over).toBe(0);
});

test("the Trees tool has leafy trees, pines, bushes, woods and hedges; a wood drawn with it is there", async () => {
  await draw(page, false);
  await page.keyboard.press("2");
  await page.evaluate(() => (window as any).__dgEditor().set({ step: "design", tool: "select" }));
  await page.keyboard.press("r");
  for (const id of ["tree-kind-deciduous", "tree-kind-conifer", "tree-kind-bush", "area-kind-woods", "line-kind-hedge"]) await expect(page.getByTestId(id)).toBeVisible();
  const n = (await course(page)).items.filter((i: any) => i.type === "area" && i.kind === "woods").length;
  await page.getByTestId("area-kind-woods").click();
  await frame(page, BOX);
  await page.waitForTimeout(800);
  for (const p of [{ x: 1520, y: 140 }, { x: 1580, y: 140 }, { x: 1580, y: 180 }, { x: 1520, y: 180 }]) {
    const c = await at(page, p.x, p.y);
    await page.mouse.click(c.x, c.y);
  }
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "area" && i.kind === "woods").length).toBe(n + 1);
  await page.keyboard.press("Escape");
});

test("a hole's trees in the way: said, cleared when asked (and said), brought back", async () => {
  const doc = await course(page);
  let found = false;
  for (const h of doc.holes) {
    await page.evaluate(id => (window as any).__dgActions.select(id), h.id);
    const card = page.getByTestId("fairway-trees");
    if (!(await card.isVisible().catch(() => false)) || !/in the way/.test(await card.innerText())) continue;
    found = true;
    await page.getByTestId("trees-clear").click();
    await expect(card).toContainText("cut down");
    await expect(page.getByText(/^Cut down \d+ trees? on hole \d+/)).toBeVisible();
    await page.getByTestId("trees-back").click();
    await expect(card).toContainText("in the way");
    break;
  }
  expect(found).toBe(true);
});

test("a pond made a hazard: never OB as well", async () => {
  const pond = (await course(page)).items.find((i: any) => i.type === "area" && i.kind === "water");
  await page.evaluate(id => (window as any).__dgActions.select(id), pond.id);
  await page.getByRole("radiogroup", { name: "Penalty" }).getByRole("radio", { name: "Hazard" }).click();
  await expect.poll(async () => { const p = (await course(page)).items.find((i: any) => i.id === pond.id); return [p.hazard, p.ob]; }).toEqual([true, false]);
  await page.keyboard.press("Control+z");
});

test("the painted map: Where to paint the woods is there with measured trees, and the map paints in time", async () => {
  await page.evaluate(() => (window as any).__dgEditor().set({ step: "map", tool: "select" }));
  const trees = page.getByTestId("part-trees");
  if ((await trees.getAttribute("aria-expanded")) !== "true") await trees.click();
  await expect(page.getByTestId("forest-options")).toBeVisible();
  const s = Date.now();
  await page.waitForFunction(() => !(window as any).__dgPainting(), null, { timeout: 150_000 });
  console.log("map painted in", Math.round((Date.now() - s) / 1000), "s");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("design-page").first()).toHaveScreenshot("painted-map.png");
});
