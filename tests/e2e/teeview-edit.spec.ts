import { devices } from "@playwright/test";
import { test, expect, addHole, blankCourse, course, editorState, pinch, screenOf, tapPlan } from "./fixtures";

// Standing anywhere in 3D: the person dropped on the map, walking by clicking the ground, picking
// and moving things as on the map. (Each frame of the 3D view is slow to draw without a graphics
// card: few drag steps, time to spare.)

const stand = (page: import("@playwright/test").Page) => page.evaluate(() => (window as any).__dgEditor().teeStand ?? null);

test("standing: the person dragged onto the map; Walk or Edit says what a click does; a tree picked and moved (where it is against the line); a click on the ground walks; the far basket picks as itself; back to the tee", async ({ page }) => {
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

  // Walk (as it starts): over the ground ahead, a click would walk there
  const crown = await screenOf(page, tree.x, tree.y, (tree.height ?? 30) * 0.5);
  const ahead = await screenOf(page, 420, 560, 0);
  await expect(page.getByTestId("tap-walk")).toHaveAttribute("aria-checked", "true");
  await page.mouse.move(ahead.x, ahead.y);
  await expect(page.getByTestId("stand-tip")).toContainText("walk here");
  // Edit: over the tree, its name, and a click picks it (its panel opens)
  await page.getByTestId("tap-edit").click();
  await page.mouse.move(crown.x - 2, crown.y);
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

  // Edit: a click on open ground walks nowhere
  const was = await stand(page);
  await page.mouse.click(ahead.x, ahead.y);
  await page.waitForTimeout(1200);
  expect((await stand(page))?.x).toBeCloseTo(was.x, 0);
  // The basket far down the hole picks as itself
  const basket = (await course(page)).items.find((i: any) => i.type === "basket" && i.holeId === hole.id);
  const far = await screenOf(page, basket.x, basket.y, 1);
  await page.mouse.click(far.x, far.y);
  await expect.poll(async () => (await editorState(page)).selectedId).toBe(basket.id);
  await page.evaluate(() => (window as any).__dgActions.select(null));

  // Walk: over open ground, "walk here", and a click walks there
  await page.getByTestId("tap-walk").click();
  await page.mouse.move(ahead.x - 2, ahead.y);
  await page.mouse.move(ahead.x, ahead.y);
  await expect(page.getByTestId("stand-tip")).toContainText("walk here");
  await page.mouse.click(ahead.x, ahead.y);
  await expect.poll(async () => (await stand(page))?.x, { timeout: 30_000 }).toBeGreaterThan(330);

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
    // Edit: a tap on the tree ahead picks it
    await page.getByTestId("tap-edit").tap();
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
    // Walk: a tap on the ground walks there
    await page.getByTestId("tap-walk").tap();
    const ahead = await screenOf(page, 520, 500, 0);
    await page.touchscreen.tap(ahead.x, ahead.y);
    await expect.poll(async () => (await stand(page))?.x, { timeout: 30_000 }).toBeGreaterThan(420);
    // Two fingers spread: the view zooms in (the lens narrows); together: out
    const fov = () => page.evaluate(() => (window as any).__dgView.povCam.fov);
    const f0 = await fov();
    const box = (await page.getByTestId("plan").boundingBox())!;
    await pinch(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.45 }, 80, 220);
    await expect.poll(fov).toBeLessThan(f0 * 0.7);
    // (still standing where it was: the fingers took no step)
    expect((await stand(page))?.x).toBeGreaterThan(420);
    await expect(page.getByTestId("tee-view-hud")).toBeVisible();
  });

  test("standing on a phone where there's no hole: the bar has Back to the map", async ({ page }) => {
    test.setTimeout(300_000);
    await page.getByTestId("welcome-blank").click();
    await page.evaluate(() => (window as any).__dgEditor().set({ tool: "select" }));
    await page.waitForTimeout(500);
    await page.getByTestId("stand-button").tap();
    await tapPlan(page, 500, 500);
    await expect(page.getByTestId("stand-here-bar")).toBeVisible();
    expect((await editorState(page)).teeView).toBe("here");
    await page.getByTestId("hud-close").tap();
    await expect.poll(async () => (await editorState(page)).teeView).toBeNull();
  });
});

test("standing with no hole at all, or far from every hole: right there, the way the map looks; a click walks; Back to the map. Near a hole: on that hole", async ({ page }) => {
  test.setTimeout(300_000);
  await blankCourse(page);
  await page.keyboard.press("Escape");
  const drop = async (x: number, y: number) => {
    const btn = (await page.getByTestId("stand-button").boundingBox())!;
    const spot = await screenOf(page, x, y);
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
    await page.mouse.down();
    await page.mouse.move(spot.x, spot.y, { steps: 4 });
    await page.mouse.up();
  };
  // No hole on the course: standing works all the same
  await drop(500, 500);
  await expect(page.getByTestId("stand-here-bar")).toBeVisible();
  await expect(page.getByTestId("tee-view-hud")).toHaveCount(0);
  expect((await editorState(page)).teeView).toBe("here");
  await expect.poll(async () => (await stand(page))?.x).toBeCloseTo(500, -1);
  await page.waitForTimeout(1000);
  // (a click on the ground ahead walks there)
  const box = (await page.getByTestId("plan").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.62);
  await expect.poll(async () => { const s = await stand(page); return s ? Math.hypot(s.x - 500, s.y - 500) : 0; }, { timeout: 30_000 }).toBeGreaterThan(5);
  await page.getByTestId("hud-close").click();
  await expect.poll(async () => (await editorState(page)).teeView).toBeNull();
  // With a hole: far from it, still right there; by it, on it
  const hole = await addHole(page, { x: 200, y: 300 }, { x: 600, y: 300 });
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).__dgView.fitSite(false));
  await drop(400, 900);
  await expect.poll(async () => (await editorState(page)).teeView).toBe("here");
  await page.getByTestId("hud-close").click();
  await expect.poll(async () => (await editorState(page)).teeView).toBeNull();
  await page.evaluate(() => (window as any).__dgView.fitSite(false));
  await drop(400, 340);
  await expect.poll(async () => (await editorState(page)).teeView).toBe(hole.id);
  await expect(page.getByTestId("tee-view-hud")).toBeVisible();
});
