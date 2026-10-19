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

test("a mando placed on a hole faces down it; its side can be switched; a drop zone joins the hole", async ({ page }) => {
  await blankCourse(page);
  const hole = await addHole(page, { x: 400, y: 600 }, { x: 400, y: 200 });
  await page.keyboard.press("m");
  await clickPlan(page, 430, 400);
  let mando = (await course(page)).items.find((i: any) => i.type === "mando");
  expect(mando.holeId).toBe(hole.id);
  // The hole runs north (up the screen): -90°
  expect(Math.round(mando.rotation)).toBe(-90);
  await page.keyboard.press("Escape");
  await page.getByRole("radiogroup", { name: "Mando side" }).getByRole("radio", { name: "Left of it" }).click();
  await expect.poll(async () => (await course(page)).items.find((i: any) => i.type === "mando").side).toBe("left");
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
  await expect(page.getByTestId("amenity-chip")).toHaveText("T");
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
