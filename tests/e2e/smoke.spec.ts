import { test, expect, addHole, blankCourse, course, editorState } from "./fixtures";

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
