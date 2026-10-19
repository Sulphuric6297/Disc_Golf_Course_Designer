import { test, expect, addHole, blankCourse, editorState } from "./fixtures";

test("view from the tee: the hole's numbers, other holes with the arrows, back with Esc", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await addHole(page, { x: 800, y: 650 }, { x: 800, y: 300 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("tee-view").click();
  const hud = page.getByTestId("tee-view-hud");
  await expect(hud).toContainText("Par 3 · 350 ft");
  // The basket is marked with its distance
  await expect(page.getByTestId("pov-basket")).toContainText("350 ft");
  // The camera stands at the tee, at eye height, looking down the hole
  const pose = await page.evaluate(() => {
    const v = (window as any).__dgView;
    return { x: v.povCam.position.x, y: v.povCam.position.y, z: v.povCam.position.z };
  });
  expect(Math.round(pose.x)).toBe(400);
  expect(Math.round(pose.z)).toBe(700);
  expect(pose.y).toBeGreaterThan(5);
  await page.keyboard.press("ArrowRight");
  await expect(hud).toContainText("Par 3 · 350 ft");
  await expect.poll(async () => (await editorState(page)).teeView).not.toBeNull();
  const second = (await editorState(page)).teeView;
  const doc = await page.evaluate(() => (window as any).__dgCourse().holes.map((h: any) => h.id));
  expect(second).toBe(doc[1]);
  await page.keyboard.press("Escape");
  await expect(hud).toBeHidden();
  expect((await editorState(page)).teeView).toBeNull();
});

test("a slow frame doesn't skip the flyover", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").click();
  await page.getByTestId("flyover").click();
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Flying/);
  // The page is busy for longer than the whole flight (like a first frame compiling shaders)
  await page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 7000); });
  await page.waitForTimeout(100);
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Flying/);
  expect(await page.evaluate(() => (window as any).__dgView.flyProgress())).toBeLessThan(0.5);
});

test("flyover runs from the tee to the basket and stops", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").click();
  await page.getByTestId("flyover").click();
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Flying/);
  await expect.poll(() => page.evaluate(() => (window as any).__dgView.flyProgress()), { timeout: 5000 }).toBeGreaterThan(0.05);
  // It lands by itself (a short hole flies for 6 seconds)
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Fly over/, { timeout: 30000 });
  await page.getByTestId("hud-close").click();
  await expect(page.getByTestId("tee-view-hud")).toBeHidden();
});

test("Enter on a selected hole opens its tee view", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("tee-view-hud")).toBeVisible();
});
