import { devices } from "@playwright/test";
import { test, expect, addHole, blankCourse, course, editorState, screenOf, tapPlan } from "./fixtures";

// Standing anywhere in 3D: the person dropped on the map, walking by clicking the ground, picking
// and moving things as on the map. (Each frame of the 3D view is slow to draw without a graphics
// card: few drag steps, time to spare.)

const stand = (page: import("@playwright/test").Page) => page.evaluate(() => (window as any).__dgEditor().teeStand ?? null);

test("standing: the person dragged onto the map; the pointer says what a click does; a tree picked and moved (where it is against the line); a click on the ground walks; the far basket picks as itself; back to the tee", async ({ page }) => {
  test.setTimeout(300_000);
  await blankCourse(page);
  const hole = await addHole(page, { x: 200, y: 600 }, { x: 900, y: 600 });
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).__dgActions.placeAt("add-tree", { x: 480, y: 625 }));
  await page.evaluate(() => (window as any).__dgActions.select(null));
  const tree = (await course(page)).items.find((i: any) => i.type === "tree");

  // The person, dragged from the map's buttons onto a spot near the tee
  const btn = (await page.getByTestId("stand-button").boundingBox())!;
  const spot = await screenOf(page, 260, 590);
  await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await page.mouse.down();
  await page.mouse.move(spot.x, spot.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("tee-view-hud")).toBeVisible();
  await expect.poll(async () => (await stand(page))?.x).toBeCloseTo(260, -1);
  expect((await editorState(page)).teeView).toBe(hole.id);
  await page.waitForTimeout(1000);

  // Over the tree: its name, and a click picks it (its panel opens)
  const crown = await screenOf(page, tree.x, tree.y, (tree.height ?? 30) * 0.5);
  await page.mouse.move(crown.x, crown.y);
  await expect(page.getByTestId("stand-tip")).toContainText("click to pick it");
  await page.mouse.click(crown.x, crown.y);
  await expect.poll(async () => (await editorState(page)).selectedId).toBe(tree.id);
  await expect(page.getByTestId("inspector")).toBeVisible();

  // Dragged from its foot: it moves along the ground, the tip saying where it is against the line
  const foot = await screenOf(page, tree.x, tree.y, 2);
  await page.mouse.move(foot.x, foot.y);
  await page.mouse.down();
  await page.mouse.move(foot.x + 45, foot.y + 5, { steps: 2 });
  await expect(page.getByTestId("stand-tip")).toContainText("the line");
  await page.mouse.move(foot.x + 90, foot.y + 10, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await course(page)).items.find((i: any) => i.id === tree.id).x - tree.x)).toBeGreaterThan(3);

  // Delete takes it out, Ctrl+Z brings it back; the view stays
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await course(page)).items.some((i: any) => i.id === tree.id)).toBe(false);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).items.some((i: any) => i.id === tree.id)).toBe(true);
  await page.evaluate(() => (window as any).__dgActions.select(null));
  await expect(page.getByTestId("tee-view-hud")).toBeVisible();

  // Over open ground: "walk here", and a click walks there
  const ahead = await screenOf(page, 420, 560, 0);
  await page.mouse.move(ahead.x, ahead.y);
  await expect(page.getByTestId("stand-tip")).toContainText("walk here");
  await page.mouse.click(ahead.x, ahead.y);
  await expect.poll(async () => (await stand(page))?.x, { timeout: 30_000 }).toBeGreaterThan(330);

  // The basket far down the hole picks as itself
  const basket = (await course(page)).items.find((i: any) => i.type === "basket" && i.holeId === hole.id);
  const far = await screenOf(page, basket.x, basket.y, 1);
  await page.mouse.click(far.x, far.y);
  await expect.poll(async () => (await editorState(page)).selectedId).toBe(basket.id);
  await page.evaluate(() => (window as any).__dgActions.select(null));

  // Back to the tee: standing on it again
  await page.getByTestId("hud-to-tee").click();
  await expect.poll(() => stand(page)).toBeNull();
  await expect(page.getByTestId("tee-view-hud")).toBeVisible();
});

test.describe("phone", () => {
  const { defaultBrowserType: _b, ...phone } = devices["iPhone 13"];
  test.use(phone);

  test("standing on a phone: tap the person, then a spot; tap the ground to walk", async ({ page }) => {
    test.setTimeout(300_000);
    await page.getByTestId("welcome-blank").click();
    await page.evaluate(() => {
      (window as any).__dgActions.addHole({ x: 300, y: 500 }, { x: 900, y: 500 }, "blue");
      (window as any).__dgActions.placeAt("add-tree", { x: 470, y: 545 });
      (window as any).__dgActions.select(null);
      (window as any).__dgEditor().set({ tool: "select" });
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => (window as any).__dgView.fitCourse(false));
    await page.waitForTimeout(500);
    await page.getByTestId("stand-button").tap();
    await expect(page.getByTestId("stand-note")).toContainText("Tap a spot");
    await tapPlan(page, 360, 520);
    await expect(page.getByTestId("stand-note")).toHaveCount(0);
    await expect(page.getByTestId("tee-view-hud")).toBeVisible();
    await expect.poll(async () => (await stand(page))?.x).toBeCloseTo(360, -1);
    await page.waitForTimeout(1500);
    // A tap on the tree ahead picks it
    const tree = (await course(page)).items.find((i: any) => i.type === "tree");
    const crown = await screenOf(page, tree.x, tree.y, (tree.height ?? 30) * 0.5);
    await page.touchscreen.tap(crown.x, crown.y);
    await expect.poll(async () => (await editorState(page)).selectedId).toBe(tree.id);
    // its usual sheet, in the bar's place
    await expect(page.getByTestId("sheet")).toBeVisible();
    await expect(page.getByTestId("hud-to-tee")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("phone-picked.png") });
    await page.evaluate(() => (window as any).__dgActions.select(null));
    await expect(page.getByTestId("sheet")).toHaveCount(0);
    await expect(page.getByTestId("hud-to-tee")).toBeVisible();
    const ahead = await screenOf(page, 520, 500, 0);
    await page.touchscreen.tap(ahead.x, ahead.y);
    await expect.poll(async () => (await stand(page))?.x, { timeout: 30_000 }).toBeGreaterThan(420);
  });
});
