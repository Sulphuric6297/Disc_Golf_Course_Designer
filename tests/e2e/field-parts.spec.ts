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
  // (the dirt round home plate, 7 ft out toward the mound: past the batter's boxes, short of the grass)
  const mound = plan.marks.find(m => m.part === "mound" && m.k === "disc") as any;
  const plate = plan.marks.find(m => m.part === "infield" && m.k === "disc") as any;
  const dx = mound.c.x - plate.c.x, dy = mound.c.y - plate.c.y, l = Math.hypot(dx, dy);
  const spot = { x: plate.c.x + (dx / l) * 7, y: plate.c.y + (dy / l) * 7 };
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
