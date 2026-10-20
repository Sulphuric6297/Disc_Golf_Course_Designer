import { test as plainHoles, expect as plainHolesExpect } from "@playwright/test";
import { test, expect, addHole, blankCourse, clickPlan, course, drag, editorState, handleCenter, screenOf } from "./fixtures";
import { walkEnds, WALK_OUT_FT } from "../../src/lib/course";
import { CIRCLE_ONE_FT } from "../../src/constants";

test("a new hole: click the tee, then the basket; length and par show live", async ({ page }) => {
  await blankCourse(page);
  await clickPlan(page, 400, 700);
  // While choosing the basket spot, the distance follows the pointer
  const p = await screenOf(page, 700, 700);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await expect(page.getByTestId("draft-label")).toContainText(/300 ft · par 3/);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await course(page)).holes.length).toBe(1);
  const doc = await course(page);
  const tee = doc.items.find((i: any) => i.type === "tee");
  const basket = doc.items.find((i: any) => i.type === "basket");
  expect(tee.holeId).toBe(doc.holes[0].id);
  expect(basket.position).toBe("A");
  expect(Math.round(basket.x - tee.x)).toBe(300);
  await expect(page.getByTestId("hole-row")).toHaveCount(1);
  await expect(page.getByTestId("hole-row")).toContainText("300 ft");
  await expect(page.getByTestId("hole-row")).toContainText("P3");
  // The tool stays on for the next hole
  expect((await editorState(page)).tool).toBe("add-hole");
});

test("long holes get par 4 and 5 by the PDGA's effective length", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 100, y: 200 }, { x: 650, y: 200 }); // 550 ft blue: par 4
  await addHole(page, { x: 100, y: 500 }, { x: 1000, y: 500 }); // 900 ft blue: par 5
  const rows = page.getByTestId("hole-row");
  await expect(rows.nth(0)).toContainText("P4");
  await expect(rows.nth(1)).toContainText("P5");
  await expect(page.getByTestId("course-totals")).toContainText("9");
});

test("bending the throw line: pull the middle dot to add a dogleg, double-click to remove it", async ({ page }) => {
  await blankCourse(page);
  const hole = await addHole(page, { x: 400, y: 700 }, { x: 800, y: 700 });
  await page.keyboard.press("Escape");
  await page.evaluate(id => (window as any).__dgActions.select(id), hole.id);
  const mid = await handleCenter(page, "mid");
  const to = await screenOf(page, 600, 550);
  await drag(page, mid, to);
  await expect.poll(async () => (await course(page)).holes[0].doglegs.length).toBe(1);
  const d = (await course(page)).holes[0].doglegs[0];
  expect(Math.abs(d.x - 600)).toBeLessThan(8);
  expect(Math.abs(d.y - 550)).toBeLessThan(8);
  // Longer along the bend: two legs of 250 ft
  await expect(page.getByTestId("hole-row")).toContainText("500 ft");
  // One undo step for the whole drag
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).holes[0].doglegs.length).toBe(0);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await course(page)).holes[0].doglegs.length).toBe(1);
  const dot = await handleCenter(page, "dogleg");
  await page.mouse.dblclick(dot.x, dot.y);
  await expect.poll(async () => (await course(page)).holes[0].doglegs.length).toBe(0);
});

test("fairway width handle and par override in the inspector", async ({ page }) => {
  await blankCourse(page);
  const hole = await addHole(page, { x: 400, y: 700 }, { x: 800, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").click();
  await expect(page.getByTestId("inspector-title")).toHaveText("Hole 1");
  // Width squares on both edges at four points along the fairway; the first (just off the tee, on the south side)
  // widens it there only, and only on its own side: the north edge stays 15 ft off the line
  await expect(page.locator('[data-handle="width"]')).toHaveCount(8);
  const w = await handleCenter(page, "width", 0);
  const to = await screenOf(page, 460, 700 + 40);
  await drag(page, w, to);
  const across = async () => { const h = (await course(page)).holes[0]; const width = (h.fairwayShape?.[0] ?? 1) * h.fairwayWidth, mid = (h.fairwayShift?.[0] ?? 0) * h.fairwayWidth; return { width, south: mid + width / 2, north: mid - width / 2 }; };
  await expect.poll(async () => (await across()).width).toBeGreaterThan(50);
  expect((await across()).width).toBeLessThan(62);
  expect(Math.abs((await across()).north + 15)).toBeLessThan(2);
  expect(Math.abs((await across()).south - 40)).toBeLessThan(3);
  expect((await course(page)).holes[0].fairwayShape.slice(1)).toEqual([1, 1, 1]);
  // With Shift both sides move alike (the middle stays)
  const mid0 = (await across()).south - (await across()).width / 2;
  const w2 = await handleCenter(page, "width", 0);
  const to2 = await screenOf(page, 460, 700 + 60);
  await page.mouse.move(w2.x, w2.y);
  await page.mouse.down();
  await page.keyboard.down("Shift");
  for (let k = 1; k <= 8; k++) await page.mouse.move(w2.x + ((to2.x - w2.x) * k) / 8, w2.y + ((to2.y - w2.y) * k) / 8);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(async () => (await across()).south).toBeGreaterThan(55);
  expect(Math.abs((await across()).south - (await across()).width / 2 - mid0)).toBeLessThan(1);
  expect((await across()).north).toBeLessThan(-30);
  // A + between two points (the landing zones, on the south edge) adds one there, and drags it out
  await expect.poll(async () => (await course(page)).holes[0].fairwayStations).toBeUndefined();
  const plus = await handleCenter(page, "widen", 4);
  await drag(page, plus, await screenOf(page, 610, 700 + 50));
  await expect.poll(async () => (await course(page)).holes[0].fairwayStations?.length).toBe(5);
  {
    const h = (await course(page)).holes[0];
    expect(h.fairwayStations[2]).toBeCloseTo(0.525, 2);
    expect(h.fairwayShape[2] * h.fairwayWidth).toBeGreaterThan(40);
  }
  // A double-click on its square takes it out again
  const sq = await handleCenter(page, "width", 4);
  await page.mouse.dblclick(sq.x, sq.y);
  await expect.poll(async () => (await course(page)).holes[0].fairwayStations?.length).toBe(4);
  await expect(page.getByTestId("fairway-shape")).toContainText("Shaped");
  // The width slider widens it all along, keeping the shape; Even width takes the shape off
  const before = (await course(page)).holes[0].fairwayShape;
  await page.getByRole("slider", { name: /Fairway width/ }).fill("60");
  await expect.poll(async () => (await course(page)).holes[0].fairwayWidth).toBe(60);
  expect((await course(page)).holes[0].fairwayShape).toEqual(before);
  await page.getByTestId("fairway-shape").getByRole("button", { name: "Even width" }).click();
  await expect.poll(async () => (await course(page)).holes[0].fairwayShape).toBeUndefined();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).holes[0].fairwayShape).toEqual(before);
  await page.getByRole("radiogroup", { name: "Par" }).getByRole("radio", { name: "4" }).click();
  await expect.poll(async () => (await course(page)).holes.find((h: any) => h.id === hole.id).par).toBe(4);
  await expect(page.getByTestId("hole-row")).toContainText("P4");
  await page.getByRole("radiogroup", { name: "Par" }).getByRole("radio", { name: /Auto/ }).click();
  await expect.poll(async () => (await course(page)).holes[0].par).toBeUndefined();
});

test("another tee and pin for a hole, and layouts pick between them", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 800, y: 700 });
  // A shorter red tee and a B pin for the hole being worked on
  await page.keyboard.press("t");
  await page.getByTestId("tee-level-red").click();
  await clickPlan(page, 500, 700);
  await page.keyboard.press("b");
  await clickPlan(page, 850, 650);
  const doc = await course(page);
  const tees = doc.items.filter((i: any) => i.type === "tee");
  expect(tees.map((t: any) => t.level).sort()).toEqual(["blue", "red"]);
  expect(doc.items.filter((i: any) => i.type === "basket").map((b: any) => b.position).sort()).toEqual(["A", "B"]);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("hole-row")).toContainText("400 ft");
  // A red layout to pin B
  await page.getByRole("button", { name: "Edit layouts" }).click();
  await page.getByRole("button", { name: "Add a layout" }).click();
  const editor = page.getByTestId("layout-editor");
  const last = editor.locator("> div").last();
  await last.getByRole("radiogroup", { name: "Layout tees" }).getByRole("radio", { name: "Red" }).click();
  await last.getByRole("radiogroup", { name: "Layout pins" }).getByRole("radio", { name: "Pin B" }).click();
  // Red tee at 500 to pin B at (850, 650): about 354 ft
  await expect(page.getByTestId("hole-row")).toContainText("354 ft");
});

test("hole numbers typed in (any number, others keep theirs); deleted with undo", async ({ page }) => {
  await blankCourse(page);
  const a = await addHole(page, { x: 200, y: 300 }, { x: 500, y: 300 });
  const b = await addHole(page, { x: 600, y: 600 }, { x: 900, y: 600 });
  const c = await addHole(page, { x: 200, y: 800 }, { x: 500, y: 800 });
  await page.keyboard.press("Escape");
  // The last one typed as 27 (more than there are holes): the others keep 1 and 2
  await page.getByTestId("hole-row").nth(2).click();
  await page.getByTestId("hole-number").fill("27");
  await page.getByTestId("hole-number").press("Enter");
  await expect.poll(async () => (await course(page)).holes.map((h: any) => [h.id, h.number])).toEqual([[a.id, 1], [b.id, 2], [c.id, 27]]);
  await expect(page.getByTestId("inspector-title")).toHaveText("Hole 27");
  // The second as 1: before the first now, which stays 1 too (shown, not renumbered)
  await page.getByTestId("hole-row").nth(1).click();
  await page.getByTestId("hole-number").fill("1");
  await page.getByTestId("hole-number").press("Enter");
  await expect.poll(async () => (await course(page)).holes.map((h: any) => [h.id, h.number])).toEqual([[a.id, 1], [b.id, 1], [c.id, 27]]);
  await expect(page.getByTestId("hole-number-taken")).toBeVisible();
  await page.getByTestId("hole-number").fill("3");
  await page.getByTestId("hole-number").press("Enter");
  await expect.poll(async () => (await course(page)).holes.map((h: any) => [h.id, h.number])).toEqual([[a.id, 1], [b.id, 3], [c.id, 27]]);
  await expect(page.getByTestId("hole-number-taken")).toHaveCount(0);
  // A new hole takes the first number free (2)
  await page.evaluate(() => (window as any).__dgView.fitBounds({ minX: 100, minY: 100, maxX: 1000, maxY: 900 }, { animate: false }));
  const d = await addHole(page, { x: 700, y: 200 }, { x: 950, y: 200 });
  await expect.poll(async () => (await course(page)).holes.map((h: any) => [h.id, h.number])).toEqual([[a.id, 1], [d.id, 2], [b.id, 3], [c.id, 27]]);
  // One undo step each; Delete with Undo
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").nth(1).click();
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await course(page)).holes.length).toBe(3);
  expect((await course(page)).items.filter((i: any) => i.holeId === d.id)).toHaveLength(0);
  await page.getByRole("button", { name: "Undo" }).first().click();
  await expect.poll(async () => (await course(page)).holes.length).toBe(4);
});

test("dragging a tee moves it and the hole's length follows", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 800, y: 700 });
  await page.keyboard.press("Escape");
  const badge = page.getByTestId("tee-badge").first();
  const box = (await badge.boundingBox())!;
  const to = await screenOf(page, 300, 700);
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, to);
  await expect.poll(async () => Math.round((await course(page)).items.find((i: any) => i.type === "tee").x / 10)).toBe(30);
  await expect(page.getByTestId("hole-row")).toContainText("500 ft");
});

test("the walk to the next tee becomes a line to reshape, in place of the automatic one; Undo brings that back", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await addHole(page, { x: 700, y: 600 }, { x: 700, y: 300 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("edit-walk").click();
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "line" && i.kind === "walk").length).toBe(1);
  const walk = (await course(page)).items.find((i: any) => i.kind === "walk");
  // From just off the basket to just behind the next tee, selected, with points to pull
  expect(Math.hypot(walk.points[0].x - 650, walk.points[0].y - 700)).toBeLessThan(40);
  expect(Math.hypot(walk.points[3].x - 700, walk.points[3].y - 600)).toBeLessThan(40);
  expect((await editorState(page)).selectedId).toBe(walk.id);
  await expect(page.getByTestId("edit-walk")).toHaveCount(0);
  await drag(page, await handleCenter(page, "corner", 1), await screenOf(page, 640, 560));
  await expect.poll(async () => (await course(page)).items.find((i: any) => i.kind === "walk").points[1].y).toBeLessThan(600);
  // Nothing automatic left to edit in the Design step either
  await page.getByRole("button", { name: "5 Design" }).click();
  await expect(page.getByTestId("edit-walks")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.kind === "walk").length).toBe(0);
  await expect(page.getByTestId("edit-walks")).toBeVisible();
});

test("bending a hole: Bend left and Bend right curve it, Straighten undoes it", async ({ page }) => {
  await blankCourse(page);
  // East along y = 500
  await addHole(page, { x: 300, y: 500 }, { x: 700, y: 500 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  const turn = async () => (await course(page)).holes[0].doglegs as { x: number; y: number }[];
  // Left of the line of play (north, looking east) by a sixth of its length
  await page.getByTestId("bend-left").click();
  await expect.poll(async () => (await turn()).length).toBe(1);
  expect((await turn())[0].x).toBeCloseTo(500, 0);
  expect((await turn())[0].y).toBeCloseTo(500 - 400 / 6, 0);
  await page.getByTestId("bend-right").click();
  await expect.poll(async () => (await turn())[0]?.y).toBeCloseTo(500 + 400 / 6, 0);
  // Longer to play than straight
  await expect(page.getByTestId("hole-row")).not.toContainText("400 ft");
  await page.getByRole("button", { name: "Straighten" }).click();
  await expect.poll(async () => (await turn()).length).toBe(0);
});

test("two holes to one basket: a basket click on a basket shares it; the Basket choice; deleting one hole leaves it to the other", async ({ page }) => {
  await blankCourse(page);
  const a = await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  // Hole 2 from another tee, its basket click on hole 1's basket
  await clickPlan(page, 650, 350);
  const badge = page.getByTestId("basket-badge").first();
  const bb = (await badge.boundingBox())!;
  await page.mouse.click(bb.x + bb.width / 2 + 3, bb.y + bb.height / 2 + 3);
  await expect.poll(async () => (await course(page)).holes.length).toBe(2);
  const b = (await course(page)).holes[1];
  const baskets = () => course(page).then(d => d.items.filter((i: any) => i.type === "basket"));
  expect(await baskets()).toHaveLength(1);
  expect((await baskets())[0].holeId).toBe(a.id);
  expect((await baskets())[0].alsoHoles).toEqual([b.id]);
  // Each hole measured to it, and the basket carries both numbers
  await expect(page.getByTestId("hole-row").nth(0)).toContainText("350 ft");
  await expect(page.getByTestId("hole-row").nth(1)).toContainText("350 ft");
  await expect(badge).toContainText("1 & 2");
  // Hole 2 back to a basket of its own, then onto hole 1's again
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").nth(1).click();
  const pick = page.getByTestId("share-basket");
  await expect(pick).toHaveValue(a.id);
  await pick.selectOption("");
  await expect.poll(async () => (await baskets()).length).toBe(2);
  expect((await baskets()).find((i: any) => i.holeId === a.id).alsoHoles).toBeUndefined();
  await expect(page.getByTestId("hole-row").nth(1)).toContainText("325 ft");
  await pick.selectOption(a.id);
  await expect.poll(async () => (await baskets()).length).toBe(1);
  // Deleting hole 1 leaves the basket to hole 2
  await page.getByTestId("hole-row").nth(0).click();
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await course(page)).holes.length).toBe(1);
  expect(await baskets()).toHaveLength(1);
  expect((await baskets())[0].holeId).toBe(b.id);
  expect((await baskets())[0].alsoHoles).toBeUndefined();
  await expect(page.getByTestId("hole-row")).toContainText("350 ft");
});

plainHoles("the walk to the next tee leaves from outside the putting circle, away from the fairway, and arrives behind the next tee; moved by hand where asked (pure logic)", () => {
  // Hole 1 played south, to (0, 300); hole 2's tee up the fairway's side, throwing north
  const hole = [{ x: 0, y: 0 }, { x: 0, y: 300 }];
  const next = [{ x: 40, y: 200 }, { x: 40, y: -100 }];
  const { from, to } = walkEnds(hole, next);
  const basket = hole[1];
  plainHolesExpect(Math.hypot(from.x - basket.x, from.y - basket.y)).toBeCloseTo(WALK_OUT_FT, 5);
  plainHolesExpect(WALK_OUT_FT).toBeGreaterThan(CIRCLE_ONE_FT);
  // At least 70 degrees off the way back up the fairway (north)
  const angle = Math.acos(((from.x - basket.x) * 0 + (from.y - basket.y) * -1) / WALK_OUT_FT) * 180 / Math.PI;
  plainHolesExpect(angle).toBeGreaterThanOrEqual(70 - 1e-6);
  // Behind the next tee (south of it, as it throws north)
  plainHolesExpect(to).toEqual({ x: 40, y: 218 });
  // Moved by hand: where it was put, from the basket and the tee
  plainHolesExpect(walkEnds(hole, next, { x: -50, y: 10 }, { x: 5, y: 25 })).toEqual({ from: { x: -50, y: 310 }, to: { x: 45, y: 225 } });
});

test("plotting a hole's line by hand: clicks along it (Backspace takes one back), Enter; a freehand drag; Cancel leaves it be", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 600 }, { x: 800, y: 600 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  const turns = async () => (await course(page)).holes[0].doglegs as { x: number; y: number }[];
  await page.getByTestId("plot-line").click();
  await expect(page.getByTestId("plot-bar")).toBeVisible();
  await clickPlan(page, 420, 500);
  await page.waitForTimeout(450);
  await clickPlan(page, 560, 700);
  await page.waitForTimeout(450);
  await clickPlan(page, 650, 520);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await turns()).length).toBe(2);
  const t = await turns();
  expect(Math.hypot(t[0].x - 420, t[0].y - 500)).toBeLessThan(6);
  expect(Math.hypot(t[1].x - 560, t[1].y - 700)).toBeLessThan(6);
  await expect(page.getByTestId("plot-bar")).toHaveCount(0);
  // Freehand: a sweep south of the straight line
  await page.getByTestId("plot-line").click();
  await page.mouse.move(...(Object.values(await screenOf(page, 330, 620)) as [number, number]));
  await page.mouse.down();
  for (const [x, y] of [[400, 680], [500, 720], [600, 700], [700, 650], [770, 610]]) {
    const p = await screenOf(page, x, y);
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }
  await page.mouse.up();
  await expect.poll(async () => (await turns()).some(p => p.y > 680)).toBe(true);
  // Cancel: as it was
  const before = await turns();
  await page.getByTestId("plot-line").click();
  await clickPlan(page, 500, 400);
  await page.getByTestId("plot-cancel").click();
  expect(await turns()).toEqual(before);
});

test("one width for every walk to the next hole; a hole's own walk wider; all walks again", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 200, y: 300 }, { x: 500, y: 300 });
  await addHole(page, { x: 800, y: 400 }, { x: 900, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  const walk = page.getByTestId("hole-walk");
  await expect(walk).toBeVisible();
  await expect(walk).toContainText("Walk to hole 2");
  await walk.getByRole("slider", { name: "All walks" }).fill("12");
  await expect.poll(async () => (await course(page)).style.walkWidth).toBe(12);
  await walk.getByRole("slider", { name: "Width", exact: true }).fill("16");
  await expect.poll(async () => (await course(page)).holes[0].walkWidth).toBe(16);
  // All walks again: the hole's own width lets go
  await walk.getByRole("slider", { name: "All walks" }).fill("8");
  await expect.poll(async () => (await course(page)).style.walkWidth).toBe(8);
  expect((await course(page)).holes[0].walkWidth).toBeUndefined();
});

test("a hole with two numbers (1/2): shown as both; a new hole doesn't take either", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 200, y: 300 }, { x: 500, y: 300 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("hole-number").fill("1/2");
  await page.getByTestId("hole-number").press("Enter");
  await expect.poll(async () => { const h = (await course(page)).holes[0]; return [h.number, h.alsoNumbers]; }).toEqual([1, [2]]);
  await expect(page.getByTestId("inspector-title")).toHaveText("Hole 1/2");
  await expect(page.getByTestId("hole-row").first()).toContainText("1/2");
  await page.evaluate(() => (window as any).__dgView.fitBounds({ minX: 100, minY: 100, maxX: 1000, maxY: 900 }, { animate: false }));
  const b = await addHole(page, { x: 600, y: 600 }, { x: 900, y: 600 });
  await expect.poll(async () => (await course(page)).holes.find((h: any) => h.id === b.id).number).toBe(3);
});

test("automatic walks to the next hole turned off and on from the Holes step", async ({ page }) => {
  await blankCourse(page);
  const a = await addHole(page, { x: 200, y: 300 }, { x: 500, y: 300 });
  await addHole(page, { x: 800, y: 400 }, { x: 900, y: 700 });
  await page.keyboard.press("Escape");
  const walk = () => page.evaluate(id => !!(window as any).__dgView.scene.getObjectByName(`walk:${id}`), a.id);
  await expect.poll(walk).toBe(true);
  const toggle = page.getByTestId("auto-walks").getByText("Walks to the next hole (automatic)");
  await toggle.click();
  await expect.poll(async () => (await course(page)).style.nextTee).toBe(false);
  await expect.poll(walk).toBe(false);
  await toggle.click();
  await expect.poll(async () => (await course(page)).style.nextTee).toBe(true);
  await expect.poll(walk).toBe(true);
});
