import { test, expect, addHole, blankCourse, course, editorState } from "./fixtures";
import { createEmptyCourse } from "../../src/lib/course";

test("loads with the welcome card and the six steps", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Design your disc golf course" })).toBeVisible();
  const steps = page.locator('nav[aria-label="Steps"] button');
  await expect(steps).toHaveText([/Site/, /Holes/, /Features/, /Review/, /Design/, /Export/]);
  for (const name of ["2 Holes", "3 Features", "4 Review", "5 Design", "6 Export", "1 Site"]) {
    await page.getByRole("button", { name }).click();
    await expect.poll(async () => (await editorState(page)).step).toBe(name.split(" ")[1].toLowerCase());
  }
});

test("start on open ground goes to the Hole tool", async ({ page }) => {
  await page.getByTestId("welcome-blank").click();
  const s = await editorState(page);
  expect(s.step).toBe("holes");
  expect(s.tool).toBe("add-hole");
  await expect(page.getByTestId("tool-hint")).toContainText("Click where the tee goes");
});

test("2D and 3D switch the view's tilt, by button and by key", async ({ page }) => {
  const tilt = () => page.evaluate(() => (window as any).__dgView.viewInfo().tiltDeg);
  expect(await tilt()).toBeLessThan(1);
  await page.getByRole("radio", { name: "3D" }).click();
  await expect.poll(tilt).toBeGreaterThan(30);
  await page.keyboard.press("2");
  await expect.poll(tilt).toBeLessThan(1);
});

test("the ground under the pointer on hills: the terrain's own triangles, looking down and tilted", async ({ page }) => {
  // A course on rolling hills
  const doc = createEmptyCourse();
  for (let x = 0; x <= doc.canvas.width; x += doc.gridSize) for (let y = 0; y <= doc.canvas.height; y += doc.gridSize) doc.terrainHeights[`${x},${y}`] = 25 * Math.sin(x / 140) * Math.cos(y / 110) + 0.01 * x;
  await page.getByLabel("Open course file").setInputFiles({ name: "hills.dgcourse.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(doc)) });
  await expect.poll(() => page.evaluate(() => Object.keys((window as any).__dgCourse().terrainHeights).length)).toBeGreaterThan(100);
  // Every triangle tested (as three.js does) against the walk over the cells under the ray
  const compare = () => page.evaluate(() => {
    const v = (window as any).__dgView;
    const r = v.container.getBoundingClientRect();
    let hits = 0, worst = 0;
    for (let i = 0; i < 24; i++) for (let j = 0; j < 16; j++) {
      const x = r.left + ((i + 0.37) / 24) * r.width, y = r.top + ((j + 0.61) / 16) * r.height;
      const ray = v.ray(x, y);
      const fast = v.ground.rayHit(ray);
      const all = v.raycaster.intersectObject(v.ground.terrain, false)[0]?.point ?? null;
      if (!fast !== !all) return { hits, worst: Infinity };
      if (all) { hits++; worst = Math.max(worst, all.distanceTo(fast)); }
    }
    return { hits, worst };
  });
  await page.waitForTimeout(500);
  const down = await compare();
  expect(down.hits).toBeGreaterThan(100);
  expect(down.worst).toBeLessThan(1e-3);
  await page.getByRole("radio", { name: "3D" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__dgView.viewInfo().tiltDeg)).toBeGreaterThan(30);
  await page.waitForTimeout(1000);
  const tilted = await compare();
  expect(tilted.hits).toBeGreaterThan(100);
  expect(tilted.worst).toBeLessThan(1e-3);
});

test("tool shortcuts pick tools; Esc goes back to Select; ? shows the shortcuts", async ({ page }) => {
  await page.getByTestId("welcome-blank").click();
  for (const [key, tool] of [["m", "add-mando"], ["z", "add-dropzone"], ["o", "draw-area"], ["l", "draw-line"], ["r", "add-tree"], ["a", "add-amenity"], ["d", "measure"], ["h", "add-hole"]]) {
    await page.keyboard.press(key);
    await expect.poll(async () => (await editorState(page)).tool).toBe(tool);
  }
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await editorState(page)).tool).toBe("select");
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Shortcuts and help" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Shortcuts and help" })).toContainText("Undo");
});

test("Go to (Ctrl+K or /): a hole by its number, a step, a named thing; Esc closes", async ({ page }) => {
  await blankCourse(page);
  const a = await addHole(page, { x: 200, y: 300 }, { x: 500, y: 300 });
  const b = await addHole(page, { x: 600, y: 600 }, { x: 900, y: 600 });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const w = window as any;
    w.__dgEditor().set({ areaKind: "water" });
    w.__dgActions.addDrawn("area", [{ x: 300, y: 700 }, { x: 400, y: 700 }, { x: 400, y: 800 }, { x: 300, y: 800 }]);
    w.__dgEditor().set({ tool: "select" });
  });
  // (named in its panel)
  await page.getByRole("textbox", { name: "Area name" }).fill("Mill Pond");
  await page.getByRole("textbox", { name: "Area name" }).blur();
  await expect.poll(async () => (await course(page)).items.some((i: any) => i.label === "Mill Pond")).toBe(true);
  // Ctrl+K, a hole's number, Enter: that hole, in view
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("goto")).toBeVisible();
  await page.keyboard.type("2");
  await expect(page.getByTestId("goto-option").first()).toContainText("Hole 2");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("goto")).toHaveCount(0);
  await expect.poll(async () => (await editorState(page)).selectedId).toBe(b.id);
  // The header's button, a step by name (arrows to pick)
  await page.getByTestId("goto-button").click();
  await page.keyboard.type("desi");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await editorState(page)).step).toBe("design");
  // "/", a name: back on the map with it selected
  await page.keyboard.press("/");
  await page.keyboard.type("mill");
  await page.keyboard.press("Enter");
  const pond = (await course(page)).items.find((i: any) => i.label === "Mill Pond");
  await expect.poll(async () => (await editorState(page)).selectedId).toBe(pond.id);
  expect((await editorState(page)).step).not.toBe("design");
  // Esc closes without going anywhere
  await page.keyboard.press("Control+k");
  await page.keyboard.type("1");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("goto")).toHaveCount(0);
  expect((await editorState(page)).selectedId).toBe(pond.id);
  expect(a.id).toBeTruthy();
});
