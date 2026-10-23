import { test, expect, addHole, blankCourse, course, editorState } from "./fixtures";
import { createEmptyCourse } from "../../src/lib/course";

test("loads with the welcome card and the six steps", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Design your disc golf course" })).toBeVisible();
  const steps = page.locator('nav[aria-label="Steps"] button');
  await expect(steps).toHaveText([/Site/, /Design/, /Map/, /Export/]);
  for (const name of ["2 Design", "3 Map", "4 Export", "1 Site"]) {
    await page.getByRole("button", { name }).click();
    await expect.poll(async () => (await editorState(page)).step).toBe(name.split(" ")[1].toLowerCase());
  }
});

test("start on open ground goes to the Hole tool", async ({ page }) => {
  await page.getByTestId("welcome-blank").click();
  const s = await editorState(page);
  expect(s.step).toBe("design");
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

test("a fit without animation is in place at once: the plan's points are on screen where they'll be drawn", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 200, y: 300 }, { x: 500, y: 300 });
  await page.keyboard.press("Escape");
  // (in the same moment as the fit, before any frame is drawn)
  const at = await page.evaluate(() => {
    const v = (window as any).__dgView;
    v.fitBounds({ minX: 700, minY: 600, maxX: 900, maxY: 800 }, { animate: false });
    return v.toClient(800, 700);
  });
  const box = (await page.getByTestId("plan").boundingBox())!;
  expect(at.x).toBeGreaterThan(box.x);
  expect(at.x).toBeLessThan(box.x + box.width);
  expect(at.y).toBeGreaterThan(box.y);
  expect(at.y).toBeLessThan(box.y + box.height);
  await page.waitForTimeout(300);
  const later = await page.evaluate(() => (window as any).__dgView.toClient(800, 700));
  expect(Math.hypot(later.x - at.x, later.y - at.y)).toBeLessThan(2);
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
  const edge = await page.evaluate(() => {
    const v = (window as any).__dgView;
    const ray = v.raycaster.ray.clone();
    // Straight at the grid's corners (between cells): the same as every triangle tested
    const pos = v.ground.terrain.geometry.getAttribute("position");
    let differ = 0, tried = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const at = ray.origin.clone().set(pos.getX(i), pos.getY(i), pos.getZ(i));
      ray.origin.copy(v.camera.position);
      ray.direction.copy(at).sub(ray.origin).normalize();
      v.raycaster.set(ray.origin, ray.direction);
      const all = v.raycaster.intersectObject(v.ground.terrain, false)[0]?.point ?? null;
      const fast = v.ground.rayHit(ray);
      tried++;
      if (!all !== !fast || (all && all.distanceTo(fast) > 1e-3)) differ++;
    }
    // A ray that isn't a number (a map with no size yet): nothing, at once
    ray.direction.set(NaN, NaN, NaN);
    return { differ, tried, nan: v.ground.rayHit(ray) };
  });
  expect(edge.tried).toBeGreaterThan(500);
  expect(edge.differ).toBe(0);
  expect(edge.nan).toBeNull();
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
  await expect(page.getByRole("dialog", { name: "Help guide" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Help guide" })).toContainText("Undo");
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
  await page.keyboard.type("map");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await editorState(page)).step).toBe("map");
  // "/", a name: back on the map with it selected
  await page.keyboard.press("/");
  await page.keyboard.type("mill");
  await page.keyboard.press("Enter");
  const pond = (await course(page)).items.find((i: any) => i.label === "Mill Pond");
  await expect.poll(async () => (await editorState(page)).selectedId).toBe(pond.id);
  expect((await editorState(page)).step).not.toBe("map");
  // Esc closes without going anywhere
  await page.keyboard.press("Control+k");
  await page.keyboard.type("1");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("goto")).toHaveCount(0);
  expect((await editorState(page)).selectedId).toBe(pond.id);
  expect(a.id).toBeTruthy();
});

test("search finds any setting and takes you to it, lit up; the help guide's Show me does the same", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 200, y: 300 }, { x: 500, y: 300 });
  await addHole(page, { x: 600, y: 600 }, { x: 900, y: 600 });
  await page.keyboard.press("Escape");
  // A setting by a few of its words: the course's walks, opened and pointed at
  await page.keyboard.press("Control+k");
  await page.keyboard.type("walk width");
  await expect(page.getByTestId("goto-option").first()).toContainText("Walks to the next hole");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("course-more")).toBeVisible();
  await expect(page.locator(".dg-found")).toHaveCount(1);
  // One on another step: the Map step's tee sign tab
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("tee sign look");
  await page.keyboard.press("Enter");
  await expect.poll(async () => { const e = await editorState(page); return [e.step, e.designTab]; }).toEqual(["map", "sign"]);
  await expect(page.getByTestId("sign-settings")).toBeVisible();
  // The help guide: chapters, a search of its own, and Show me
  await page.keyboard.press("?");
  const guide = page.getByRole("dialog", { name: "Help guide" });
  await expect(guide).toContainText("The four steps");
  await guide.getByTestId("help-chapters").getByRole("button", { name: "Map: the printed course map, signs and cards" }).click();
  await expect(guide).toContainText("Paper and turning the map");
  await guide.getByTestId("help-search").fill("paper size");
  const card = guide.getByTestId("help-topic").filter({ hasText: "Paper and turning the map" });
  await card.getByTestId("help-show-me").click();
  await expect(guide).toHaveCount(0);
  await expect.poll(async () => (await editorState(page)).designTab).toBe("map");
  await expect(page.getByTestId("fold-paper")).toHaveAttribute("open", "");
});
