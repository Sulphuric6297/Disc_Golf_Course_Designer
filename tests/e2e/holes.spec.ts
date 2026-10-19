import { test, expect, addHole, blankCourse, clickPlan, course, drag, editorState, handleCenter, screenOf } from "./fixtures";

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
  const w = await handleCenter(page, "width");
  const to = await screenOf(page, 533, 700 - 40);
  await drag(page, w, to);
  await expect.poll(async () => (await course(page)).holes[0].fairwayWidth).toBeGreaterThan(70);
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

test("holes can be reordered and deleted (with undo)", async ({ page }) => {
  await blankCourse(page);
  const a = await addHole(page, { x: 200, y: 300 }, { x: 500, y: 300 });
  const b = await addHole(page, { x: 600, y: 600 }, { x: 900, y: 600 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").nth(1).click();
  await page.getByRole("button", { name: "Move hole earlier" }).click();
  await expect.poll(async () => (await course(page)).holes.map((h: any) => h.id)).toEqual([b.id, a.id]);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await course(page)).holes.length).toBe(1);
  expect((await course(page)).items.filter((i: any) => i.holeId === b.id)).toHaveLength(0);
  await page.getByRole("button", { name: "Undo" }).first().click();
  await expect.poll(async () => (await course(page)).holes.length).toBe(2);
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
