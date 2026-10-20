import { test, expect, editorState } from "./fixtures";

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
