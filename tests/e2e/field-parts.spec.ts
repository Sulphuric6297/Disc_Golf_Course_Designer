import { test, expect, blankCourse, course, screenOf } from "./fixtures";
import { test as plain, expect as plainExpect } from "@playwright/test";
import { fieldPartAt, fieldPlan, LEAGUES } from "../../src/lib/fieldPlan";
import { fieldOutline } from "../../src/lib/fields";

// Ball fields and courts made of their parts: a size by league, each part picked (in the panel or
// on the map), hidden, and set to look like the real one.

const field = (page: import("@playwright/test").Page) => page.evaluate(() => (window as any).__dgCourse().items.find((i: any) => i.type === "area" && i.kind === "field"));
const part = (page: import("@playwright/test").Page) => page.evaluate(() => (window as any).__dgEditor().fieldPart ?? null);

test("a ball field: Little League size, a part picked in the panel and on the map, hidden and shown, its backstop and clay set", async ({ page }) => {
  await blankCourse(page);
  await page.evaluate(() => { const E = (window as any).__dgEditor(); E.set({ fieldKind: "baseball" }); (window as any).__dgActions.placeAt("add-field", { x: 500, y: 450 }); });
  const f0 = await field(page);
  await page.evaluate(id => (window as any).__dgActions.select(id), f0.id);
  // The size: Little League makes the fence 200 ft out, home plate where it was
  await page.getByTestId("field-league").getByText("Little League").click();
  await expect.poll(async () => (await field(page)).league).toBe("little");
  const f1 = await field(page);
  const home = f0.points[0];
  const reach = Math.max(...f1.points.map((p: any) => Math.hypot(p.x - home.x, p.y - home.y)));
  expect(reach).toBeCloseTo(LEAGUES.little.fence + LEAGUES.little.backstop + 2, 0);
  // Its parts: the backstop picked in the panel, its settings under the list
  await expect(page.getByTestId("field-parts")).toBeVisible();
  await page.getByTestId("part-backstop").click();
  expect(await part(page)).toBe("backstop");
  await expect(page.getByTestId("part-settings")).toContainText("Backstop height");
  // Hidden: gone from the plan; shown again
  await page.getByTestId("part-dugouts-eye").click();
  await expect.poll(async () => (await field(page)).parts?.dugouts?.off).toBe(true);
  expect(fieldPlan(await field(page))!.props.some(p => p.k === "dugout")).toBe(false);
  await page.getByTestId("part-dugouts-eye").click();
  await expect.poll(async () => (await field(page)).parts?.dugouts?.off).toBeUndefined();
  // A click on the infield on the map picks the infield; its clay set to tan
  const f = await field(page);
  const plan = fieldPlan(f)!;
  // (the dirt just past second base, clear of home plate's handle)
  const plate = plan.home!;
  const second = (plan.marks.filter(m => m.part === "infield" && m.k === "disc") as any[]).reduce((a, m) => (Math.hypot(m.c.x - plate.x, m.c.y - plate.y) > Math.hypot(a.c.x - plate.x, a.c.y - plate.y) ? m : a)).c;
  const dx = second.x - plate.x, dy = second.y - plate.y, l = Math.hypot(dx, dy);
  const spot = { x: second.x + (dx / l) * 3.5, y: second.y + (dy / l) * 3.5 };
  expect(fieldPartAt(f, spot)).toBe("infield");
  const s = await screenOf(page, spot.x, spot.y);
  await page.mouse.click(s.x, s.y);
  await expect.poll(() => part(page)).toBe("infield");
  await page.getByTestId("part-settings").getByText("Tan").click();
  await expect.poll(async () => (await field(page)).parts?.infield?.c).toBe("tan");
  expect(fieldPlan(await field(page))!.marks.some(m => m.part === "infield" && m.ink === "dirtTan")).toBe(true);
  // Another thing picked: no part
  await page.evaluate(() => (window as any).__dgActions.select(null));
  await expect.poll(() => part(page)).toBeNull();
  expect((await course(page)).items.length).toBe(1);
});

test("a ball field's home plate dragged to where it really is: the field turns to follow; Next corner puts it back", async ({ page }) => {
  await blankCourse(page);
  await page.evaluate(() => { const E = (window as any).__dgEditor(); E.set({ fieldKind: "baseball" }); (window as any).__dgActions.placeAt("add-field", { x: 500, y: 450 }); });
  const f0 = await field(page);
  await page.evaluate(id => (window as any).__dgActions.select(id), f0.id);
  await expect(page.getByTestId("field-home")).toContainText("Corner");
  // Home plate's handle, on the plate
  const H0 = fieldPlan(f0)!.home!;
  const handle = page.getByTestId("handle-plate");
  await expect(handle).toBeVisible();
  const at = await screenOf(page, H0.x, H0.y), box = (await handle.boundingBox())!;
  expect(Math.hypot(box.x + box.width / 2 - at.x, box.y + box.height / 2 - at.y)).toBeLessThan(6);
  // Dragged 40 ft into the field and 25 ft to one side
  const mid = { x: f0.points.reduce((s: number, p: any) => s + p.x, 0) / f0.points.length, y: f0.points.reduce((s: number, p: any) => s + p.y, 0) / f0.points.length };
  const dx = mid.x - H0.x, dy = mid.y - H0.y, l = Math.hypot(dx, dy);
  const to = { x: H0.x + (dx / l) * 40 - (dy / l) * 25, y: H0.y + (dy / l) * 40 + (dx / l) * 25 };
  const s1 = await screenOf(page, to.x, to.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move((at.x + s1.x) / 2, (at.y + s1.y) / 2, { steps: 3 });
  await page.mouse.move(s1.x, s1.y, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => !!(await field(page)).plate).toBe(true);
  const f1 = await field(page);
  const plan = fieldPlan(f1)!;
  expect(Math.hypot(plan.home!.x - to.x, plan.home!.y - to.y)).toBeLessThan(3);
  // (the field faces the middle of its outline from there: the mound on that line)
  const mound = plan.marks.find(m => m.part === "mound" && m.k === "disc") as any;
  const ax = mound.c.x - plan.home!.x, ay = mound.c.y - plan.home!.y, bx = mid.x - plan.home!.x, by = mid.y - plan.home!.y;
  expect(Math.abs(ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by))).toBeLessThan(0.02);
  expect(f1.points).toEqual(f0.points);
  await expect(page.getByTestId("field-home")).toContainText("Placed by hand");
  // Next corner: back at a corner
  await page.getByTestId("field-home-next").click();
  await expect.poll(async () => (await field(page)).plate).toBeUndefined();
  await expect(page.getByTestId("field-home")).toContainText("Corner");
});

test("a ball field's mound and backstop dragged on the map to where they really are, a tip saying how far", async ({ page }) => {
  await blankCourse(page);
  await page.evaluate(() => { const E = (window as any).__dgEditor(); E.set({ fieldKind: "baseball" }); (window as any).__dgActions.placeAt("add-field", { x: 500, y: 450 }); });
  const f0 = await field(page);
  await page.evaluate(id => (window as any).__dgActions.select(id), f0.id);
  const plan = fieldPlan(f0)!, L = LEAGUES[plan.league!];
  let H = plan.home!, f = plan.facing!;
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const a = await screenOf(page, from.x, from.y), b = await screenOf(page, to.x, to.y);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
    await page.mouse.move(b.x, b.y, { steps: 3 });
    await expect(page.getByTestId("stand-tip")).toBeVisible();
    const said = await page.getByTestId("stand-tip").textContent();
    await page.mouse.up();
    return said;
  };
  // The mound picked: its handle on the rubber; dragged 5 ft nearer home
  await page.evaluate(() => (window as any).__dgEditor().set({ fieldPart: "mound" }));
  const handle = page.getByTestId("handle-part");
  await expect(handle).toBeVisible();
  const rubber = { x: H.x + f.x * L.pitch, y: H.y + f.y * L.pitch };
  const at = await screenOf(page, rubber.x, rubber.y), box = (await handle.boundingBox())!;
  expect(Math.hypot(box.x + box.width / 2 - at.x, box.y + box.height / 2 - at.y)).toBeLessThan(6);
  const said = await drag(rubber, { x: H.x + f.x * (L.pitch - 5), y: H.y + f.y * (L.pitch - 5) });
  expect(said).toContain("from home to the rubber");
  await expect.poll(async () => (await field(page)).parts?.mound?.d).toBeCloseTo(L.pitch - 5, 0);
  // The backstop: no handle while home plate sits by the corner; placed by hand, behind home, dragged
  // 10 ft farther back (home staying put)
  await page.evaluate(() => (window as any).__dgEditor().set({ fieldPart: "backstop" }));
  await expect(handle).toBeHidden();
  await page.evaluate(id => (window as any).__dgActions.updateItem(id, { plate: { x: 70, y: 0 } }), f0.id);
  const placed = fieldPlan(await field(page))!;
  H = placed.home!;
  f = placed.facing!;
  const back = { x: H.x - f.x * L.backstop, y: H.y - f.y * L.backstop };
  await expect.poll(async () => { const b = (await handle.boundingBox())!, s = await screenOf(page, back.x, back.y); return Math.hypot(b.x + b.width / 2 - s.x, b.y + b.height / 2 - s.y); }).toBeLessThan(6);
  expect(await drag(back, { x: H.x - f.x * (L.backstop + 10), y: H.y - f.y * (L.backstop + 10) })).toBe(`${L.backstop + 10} ft behind home`);
  await expect.poll(async () => (await field(page)).parts?.backstop?.d).toBeCloseTo(L.backstop + 10, 0);
  // (one undo step a drag)
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await field(page)).parts?.backstop?.d ?? L.backstop).toBeCloseTo(L.backstop, 0);
});

test("in 3D, a picked tree's top dragged up makes it taller (none in 2D)", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).__dgActions.placeAt("add-tree", { x: 500, y: 450 }));
  const tree = () => page.evaluate(() => (window as any).__dgCourse().items.find((i: any) => i.type === "tree"));
  const t0 = await tree();
  await page.evaluate(id => (window as any).__dgActions.select(id), t0.id);
  // (2D: no handle for up and down)
  await expect(page.getByTestId("handle-height")).toBeHidden();
  await page.evaluate(() => (window as any).__dgEditor().set({ view: "3d" }));
  await page.waitForTimeout(300);
  await expect.poll(() => page.evaluate(() => (window as any).__dgView.settled()), { timeout: 15000 }).toBe(true);
  await page.evaluate(id => (window as any).__dgView.reveal(id), t0.id);
  await expect.poll(() => page.evaluate(() => (window as any).__dgView.settled()), { timeout: 15000 }).toBe(true);
  const handle = page.getByTestId("handle-height");
  await expect(handle).toBeVisible();
  const h0 = t0.height ?? t0.radius * 2.6;
  const b = (await handle.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y - 20, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y - 60, { steps: 3 });
  await expect(page.getByTestId("stand-tip")).toContainText("tall");
  await page.mouse.up();
  await expect.poll(async () => (await tree()).height ?? 0).toBeGreaterThan(h0 + 3);
  await expect(page.getByTestId("stand-tip")).toBeHidden();
});

test("tennis courts: two in a row, all green, their fence's height", async ({ page }) => {
  await blankCourse(page);
  await page.evaluate(() => { const E = (window as any).__dgEditor(); E.set({ fieldKind: "tennis" }); (window as any).__dgActions.placeAt("add-field", { x: 500, y: 450 }); });
  const f0 = await field(page);
  await page.evaluate(id => (window as any).__dgActions.select(id), f0.id);
  await page.getByTestId("field-courts").getByText("2 in a row").click();
  await expect.poll(async () => fieldPlan(await field(page))!.props.filter(p => p.k === "net").length).toBe(2);
  await page.getByTestId("field-colors").getByText("All green").click();
  await expect.poll(async () => (await field(page)).courtColors).toBe("green");
  await page.getByTestId("part-fence").click();
  await expect(page.getByTestId("part-settings")).toContainText("Fence height");
});

plain("each league's field laid out at its own sizes; a part's settings change the layout", () => {
  const pts = fieldOutline("baseball", { x: 0, y: 0 });
  for (const league of ["teeball", "little", "high"] as const) {
    const plan = fieldPlan({ id: "f", points: pts, field: "baseball", league })!;
    plainExpect(plan.league).toBe(league);
    plainExpect(plan.props.filter(p => p.k === "dugout")).toHaveLength(2);
    plainExpect(plan.props.some(p => p.k === "fence" && p.part === "backstop")).toBe(true);
  }
  const plain1 = fieldPlan({ id: "f", points: pts, field: "baseball", league: "high" })!;
  const set = fieldPlan({ id: "f", points: pts, field: "baseball", league: "high", parts: { grass: { n: 0 }, fence: { c: "none", h: 10 } } })!;
  plainExpect(set.marks.filter(m => m.ink === "stripe").length).toBe(0);
  plainExpect(plain1.marks.filter(m => m.ink === "stripe").length).toBeGreaterThan(3);
  const fence = set.props.find(p => p.k === "fence" && p.part === "fence") as any;
  plainExpect(fence.h).toBe(10);
  plainExpect(fence.cap).toBeUndefined();
});
