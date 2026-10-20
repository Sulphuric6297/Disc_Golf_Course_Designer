import { test, expect, addHole, blankCourse, clickPlan, course, drag, editorState, handleCenter, screenOf } from "./fixtures";

test("drawing an OB area: click corners, double-click to finish; Backspace and Esc", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("o");
  await expect(page.getByTestId("tool-options")).toBeVisible();
  await page.getByTestId("area-kind-ob").click();
  await clickPlan(page, 300, 300);
  await clickPlan(page, 600, 300);
  await clickPlan(page, 650, 320);
  // Backspace takes back the last point
  await page.keyboard.press("Backspace");
  await expect(page.getByTestId("draft-label")).toContainText("2 points");
  await clickPlan(page, 600, 500);
  await clickPlan(page, 300, 500, { double: true });
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "area").length).toBe(1);
  const area = (await course(page)).items.find((i: any) => i.type === "area");
  expect(area.kind).toBe("ob");
  expect(area.points).toHaveLength(4);
  expect((await editorState(page)).tool).toBe("select");
  expect((await editorState(page)).selectedId).toBe(area.id);
  await expect(page.getByTestId("inspector-title")).toHaveText("Out of bounds (OB)");
  // Esc drops a shape being drawn
  await page.keyboard.press("o");
  await clickPlan(page, 900, 300);
  await clickPlan(page, 1000, 300);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  expect((await course(page)).items.filter((i: any) => i.type === "area")).toHaveLength(1);
});

test("an area's corners can be dragged, a mid dot adds one, and the area moves once selected", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("o");
  await page.getByTestId("area-kind-water").click();
  for (const [x, y] of [[300, 300], [600, 300], [600, 500]]) await clickPlan(page, x, y);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "area").length).toBe(1);
  const c0 = await handleCenter(page, "corner", 0);
  await drag(page, c0, await screenOf(page, 250, 250));
  await expect.poll(async () => Math.round((await course(page)).items[0].points[0].x)).toBeLessThan(260);
  const mid = await handleCenter(page, "mid", 0);
  await drag(page, mid, await screenOf(page, 450, 200));
  await expect.poll(async () => (await course(page)).items[0].points.length).toBe(4);
  // Drag the inside: the whole area moves
  const before = (await course(page)).items[0].points[1].x;
  const inside = await screenOf(page, 500, 380);
  await drag(page, inside, { x: inside.x + 60, y: inside.y });
  await expect.poll(async () => (await course(page)).items[0].points[1].x).toBeGreaterThan(before + 20);
});

test("lines: an OB line and a walking path with its width", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("l");
  await page.getByTestId("line-kind-path").click();
  await clickPlan(page, 200, 900);
  await clickPlan(page, 1400, 900);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "line").length).toBe(1);
  await page.getByRole("slider", { name: "Width" }).fill("12");
  await expect.poll(async () => (await course(page)).items[0].width).toBe(12);
  await page.keyboard.press("l");
  await page.getByTestId("line-kind-ob").click();
  await clickPlan(page, 1500, 100);
  await clickPlan(page, 1500, 1000);
  await page.keyboard.press("Enter");
  const lines = (await course(page)).items.filter((i: any) => i.type === "line");
  expect(lines.map((l: any) => l.kind).sort()).toEqual(["ob", "path"]);
});

test("a mando placed on a hole faces down it, passed on the line's side; its side can be switched; a drop zone joins the hole", async ({ page }) => {
  await blankCourse(page);
  const hole = await addHole(page, { x: 400, y: 600 }, { x: 400, y: 200 });
  await page.keyboard.press("m");
  // A post to the right of the line (east of a hole running north) is passed on its left
  await clickPlan(page, 430, 400);
  let mando = (await course(page)).items.find((i: any) => i.type === "mando");
  expect(mando.holeId).toBe(hole.id);
  // The hole runs north (up the screen): -90°
  expect(Math.round(mando.rotation)).toBe(-90);
  expect(mando.side).toBe("left");
  // ...and one to the left of it on its right
  await clickPlan(page, 370, 450);
  expect((await course(page)).items.filter((i: any) => i.type === "mando")[1].side).toBe("right");
  await page.keyboard.press("Escape");
  await page.evaluate(id => (window as any).__dgActions.select(id), mando.id);
  await page.getByRole("radiogroup", { name: "Mando side" }).getByRole("radio", { name: "Right of it" }).click();
  await expect.poll(async () => (await course(page)).items.find((i: any) => i.type === "mando").side).toBe("right");
  // On the map: the post, and the arrow and restricted line on the ground
  await expect(page.getByTestId("mando-chip").first().locator("svg")).toBeVisible();
  // Turn it with its handle
  const rot = await handleCenter(page, "rotate");
  await drag(page, rot, await screenOf(page, 480, 400));
  mando = (await course(page)).items.find((i: any) => i.type === "mando");
  expect(Math.abs(mando.rotation)).toBeLessThan(10);
  await page.keyboard.press("z");
  await clickPlan(page, 470, 380);
  const dz = (await course(page)).items.find((i: any) => i.type === "dropzone");
  expect(dz.holeId).toBe(hole.id);
  await expect(page.getByTestId("dropzone-chip")).toBeVisible();
});

test("trees, benches and labels; delete, duplicate and lock", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("r");
  await clickPlan(page, 300, 300);
  await clickPlan(page, 340, 300);
  expect((await course(page)).items.filter((i: any) => i.type === "tree")).toHaveLength(2);
  await page.keyboard.press("a");
  await page.getByTestId("tool-options").getByRole("button", { name: "Trash can" }).click();
  await clickPlan(page, 600, 600);
  const can = (await course(page)).items.find((i: any) => i.type === "amenity");
  expect(can.kind).toBe("trash");
  // On the map: its pictogram, as on the printed map
  await expect(page.getByTestId("amenity-chip").locator('[data-symbol="trash"]')).toBeAttached();
  await page.keyboard.press("k");
  await clickPlan(page, 800, 800);
  await page.keyboard.press("Escape");
  await page.getByLabel("Label text").fill("Clubhouse");
  await expect.poll(async () => (await course(page)).items.find((i: any) => i.type === "label").text).toBe("Clubhouse");
  // Duplicate, then delete the copy
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "label").length).toBe(2);
  await page.getByRole("button", { name: "Delete" }).click();
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "label").length).toBe(1);
  // A locked item doesn't delete
  const label = (await course(page)).items.find((i: any) => i.type === "label");
  await page.evaluate(id => (window as any).__dgActions.select(id), label.id);
  await page.getByRole("button", { name: "Lock" }).click();
  await page.keyboard.press("Delete");
  await expect(page.getByText("It's locked. Unlock it first.")).toBeVisible();
  expect((await course(page)).items.filter((i: any) => i.type === "label")).toHaveLength(1);
});

test("measuring: distance and elevation change", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("d");
  await clickPlan(page, 200, 200);
  await clickPlan(page, 500, 600);
  await expect(page.getByTestId("measure-label")).toHaveText("500 ft");
});

test("shapes by dragging: a rectangle and a circle", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("o");
  await page.getByTestId("area-kind-hazard").click();
  await page.getByTestId("draw-shape-box").click();
  await expect(page.getByTestId("tool-hint")).toContainText("Click one corner, then the opposite corner");
  await drag(page, await screenOf(page, 300, 300), await screenOf(page, 600, 500), 3);
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "area").length).toBe(1);
  const box = (await course(page)).items.find((i: any) => i.type === "area");
  expect(box.kind).toBe("hazard");
  expect(box.points).toHaveLength(4);
  const xs = box.points.map((p: any) => p.x), ys = box.points.map((p: any) => p.y);
  expect(Math.min(...xs)).toBeCloseTo(300, -1);
  expect(Math.max(...xs)).toBeCloseTo(600, -1);
  expect(Math.min(...ys)).toBeCloseTo(300, -1);
  expect(Math.max(...ys)).toBeCloseTo(500, -1);
  // A circle, from its middle out
  await page.keyboard.press("o");
  await page.getByTestId("draw-shape-circle").click();
  await drag(page, await screenOf(page, 900, 400), await screenOf(page, 1000, 400), 3);
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "area").length).toBe(2);
  const circle = (await course(page)).items.filter((i: any) => i.type === "area")[1];
  expect(circle.points.length).toBeGreaterThan(20);
  for (const p of circle.points) expect(Math.hypot(p.x - 900, p.y - 400)).toBeCloseTo(100, -1);
  // Points again: a drag pans the map instead of drawing
  await page.keyboard.press("o");
  await page.getByTestId("draw-shape-points").click();
  await drag(page, await screenOf(page, 300, 700), await screenOf(page, 500, 800), 3);
  expect((await course(page)).items.filter((i: any) => i.type === "area")).toHaveLength(2);
});

test("a building as a rectangle by two clicks (Rectangle comes first for buildings), and a circle the same way", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "3 Features" }).click();
  await page.getByTestId("feature-structure-building").click();
  await expect(page.getByTestId("draw-shape-box")).toHaveAttribute("aria-checked", "true");
  // One corner, then the opposite one (it once only ever added corner points)
  await clickPlan(page, 300, 300);
  expect((await course(page)).items.filter((i: any) => i.type === "structure")).toHaveLength(0);
  await clickPlan(page, 420, 380);
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "structure").length).toBe(1);
  const b = (await course(page)).items.find((i: any) => i.type === "structure");
  expect(b.kind).toBe("building");
  expect(b.points).toHaveLength(4);
  const xs = b.points.map((p: any) => p.x), ys = b.points.map((p: any) => p.y);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(120, -1);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(80, -1);
  // A circular hazard: the middle, then the edge
  await page.keyboard.press("o");
  await page.getByTestId("area-kind-hazard").click();
  await page.getByTestId("draw-shape-circle").click();
  await clickPlan(page, 700, 500);
  await clickPlan(page, 760, 500);
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "area").length).toBe(1);
  const c = (await course(page)).items.find((i: any) => i.type === "area");
  for (const p of c.points) expect(Math.hypot(p.x - 700, p.y - 500)).toBeCloseTo(60, -1);
  // Esc between the two clicks drops it
  await page.getByTestId("draw-shape-box").click();
  await clickPlan(page, 300, 700);
  await page.keyboard.press("Escape");
  await clickPlan(page, 400, 800);
  await page.waitForTimeout(300);
  expect((await course(page)).items.filter((i: any) => i.type === "area")).toHaveLength(1);
});

test("a freehand line, drawn by dragging", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("l");
  await page.getByTestId("line-kind-stream").click();
  await page.getByTestId("draw-shape-freehand").click();
  await expect(page.getByTestId("tool-hint")).toContainText("Drag to draw");
  const from = await screenOf(page, 200, 800), mid = await screenOf(page, 500, 700), to = await screenOf(page, 800, 850);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "line").length).toBe(1);
  const creek = (await course(page)).items.find((i: any) => i.type === "line");
  expect(creek.kind).toBe("stream");
  expect(creek.points.length).toBeGreaterThanOrEqual(3);
  // It bends through the middle point
  expect(Math.min(...creek.points.map((p: any) => p.y))).toBeLessThan(730);
  // A line can't be a rectangle: picked for an area, lines still draw freehand
  await page.keyboard.press("o");
  await page.getByTestId("draw-shape-box").click();
  await page.keyboard.press("l");
  await expect(page.getByTestId("draw-shape-freehand")).toHaveAttribute("aria-checked", "true");
});

test("one click adds OB along a hole's side or behind its basket", async ({ page }) => {
  await blankCourse(page);
  // A hole running north
  const hole = await addHole(page, { x: 500, y: 800 }, { x: 500, y: 300 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").click();
  await page.getByTestId("ob-left").click();
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "line").length).toBe(1);
  const left = (await course(page)).items.find((i: any) => i.type === "line");
  expect(left.kind).toBe("ob");
  expect(left.holeId).toBe(hole.id);
  // West of the fairway (its left, facing north), past the basket
  for (const p of left.points) expect(p.x).toBeLessThan(500 - 15);
  expect(Math.min(...left.points.map((p: any) => p.y))).toBeLessThan(300);
  await expect(page.getByText(/OB line added along the left of hole 1/)).toBeVisible();
  await page.getByTestId("hole-row").click();
  await page.getByTestId("ob-long").click();
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "line").length).toBe(2);
  const long = (await course(page)).items.filter((i: any) => i.type === "line")[1];
  // Behind the basket (north of it), about 10 m out
  for (const p of long.points) expect(Math.hypot(p.x - 500, p.y - 300)).toBeGreaterThan(35);
  expect(Math.max(...long.points.map((p: any) => p.y))).toBeLessThan(320);
  // Undo takes it back
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "line").length).toBe(1);
});

test("a road marked OB from its right-click menu", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("l");
  await page.getByTestId("line-kind-road").click();
  await clickPlan(page, 200, 600);
  await clickPlan(page, 1200, 600);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "line").length).toBe(1);
  await page.keyboard.press("Escape");
  const at = await screenOf(page, 700, 600);
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Mark as OB (red edge)" }).click();
  await expect.poll(async () => (await course(page)).items[0].ob).toBe(true);
  // The inspector says so, and it can be taken back there
  await page.evaluate(id => (window as any).__dgActions.select(id), (await course(page)).items[0].id);
  const ob = page.getByRole("radiogroup", { name: "Out of bounds" });
  await expect(ob.getByRole("radio", { name: "OB, red edge" })).toHaveAttribute("aria-checked", "true");
  await ob.getByRole("radio", { name: "Not OB" }).click();
  await expect.poll(async () => (await course(page)).items[0].ob).toBeUndefined();
});

test("a gate: two posts across the hole's line, passed between", async ({ page }) => {
  await blankCourse(page);
  // A hole running east
  const hole = await addHole(page, { x: 300, y: 500 }, { x: 800, y: 500 });
  await page.keyboard.press("m");
  await page.getByTestId("mando-kind-gate").click();
  await expect(page.getByTestId("tool-hint")).toContainText("the disc passes between");
  await clickPlan(page, 550, 505);
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "mando").length).toBe(2);
  const [a, b] = (await course(page)).items.filter((i: any) => i.type === "mando");
  expect(a.pairId).toBe(b.id);
  expect(b.pairId).toBe(a.id);
  for (const m of [a, b]) {
    expect(m.holeId).toBe(hole.id);
    expect(Math.round(m.rotation)).toBe(0);
    expect(m.x).toBeCloseTo(550, 0);
  }
  // Facing east: the north post (left of the line) is passed on its right, the south one on its left
  const north = a.y < b.y ? a : b, south = a.y < b.y ? b : a;
  expect(north.y).toBeLessThan(500);
  expect(south.y).toBeGreaterThan(500);
  expect(north.side).toBe("right");
  expect(south.side).toBe("left");
  await expect(page.getByTestId("mando-chip")).toHaveCount(2);
});

test("a new line's points snap onto the corners of shapes already drawn", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("o");
  for (const [x, y] of [[300, 300], [600, 300], [600, 500]]) await clickPlan(page, x, y);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "area").length).toBe(1);
  const corner = (await course(page)).items[0].points[1];
  // Start an OB line a few pixels off the area's corner, end it in the open
  await page.keyboard.press("l");
  const near = await screenOf(page, corner.x, corner.y);
  await page.mouse.click(near.x + 4, near.y - 3);
  await clickPlan(page, 900, 300);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "line").length).toBe(1);
  const line = (await course(page)).items.find((i: any) => i.type === "line");
  expect(line.points[0]).toEqual({ x: corner.x, y: corner.y });
  // Far from any corner: no snapping
  expect(line.points[1].x).toBeCloseTo(900, -1);
});

test("a mando joins the hole it is placed beside, not just the one being worked on", async ({ page }) => {
  await blankCourse(page);
  const first = await addHole(page, { x: 300, y: 800 }, { x: 300, y: 300 });
  const second = await addHole(page, { x: 900, y: 300 }, { x: 900, y: 800 });
  expect((await editorState(page)).activeHoleId).toBe(second.id);
  await page.keyboard.press("m");
  await clickPlan(page, 320, 550);
  const mando = (await course(page)).items.find((i: any) => i.type === "mando");
  expect(mando.holeId).toBe(first.id);
  // Facing up the first hole (north)
  expect(Math.round(mando.rotation)).toBe(-90);
});
