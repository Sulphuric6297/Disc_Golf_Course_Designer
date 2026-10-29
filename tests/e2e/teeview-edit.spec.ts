import { test, expect, addHole, blankCourse, course, drag, editorState, screenOf } from "./fixtures";

// Editing from the tee: the editor as on the map, through the tee view's own camera.

test("tee view, Edit: a tree picked where it stands (its panel opens) and dragged along the ground; open ground still looks around; Look turns the camera; the map from above in a corner", async ({ page }) => {
  // (each frame of the tee view is slow to draw without a graphics card: few steps, time to spare)
  test.setTimeout(300_000);
  await blankCourse(page);
  const hole = await addHole(page, { x: 200, y: 600 }, { x: 900, y: 600 });
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).__dgActions.placeAt("add-tree", { x: 480, y: 625 }));
  const tree = (await course(page)).items.find((i: any) => i.type === "tree");
  await page.evaluate(id => (window as any).__dgActions.select(id), hole.id);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("tee-view-hud")).toBeVisible();
  // (Look to begin with, as before: no toolbar, a drag turns the camera)
  await expect(page.getByTestId("tee-look")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("tool-bar")).toHaveCount(0);
  await page.getByTestId("tee-edit").click();
  await expect(page.getByTestId("tee-map")).toBeVisible();
  await expect(page.getByTestId("tool-bar")).toBeVisible();
  await page.waitForTimeout(800);

  // A click on the tree picks it; its panel opens, the hole card moving beside it
  const crown = await screenOf(page, tree.x, tree.y, (tree.height ?? 30) * 0.5);
  await page.mouse.click(crown.x, crown.y);
  await expect.poll(async () => (await editorState(page)).selectedId).toBe(tree.id);
  await expect(page.getByTestId("inspector")).toBeVisible();

  // Dragged from its foot: it moves along the ground
  const foot = await screenOf(page, tree.x, tree.y, 2);
  await drag(page, foot, { x: foot.x + 90, y: foot.y + 10 }, 3);
  await expect.poll(async () => Math.abs((await course(page)).items.find((i: any) => i.id === tree.id).x - tree.x)).toBeGreaterThan(3);

  // Open ground: a drag looks around (nothing moves); Delete takes the picked tree out; Ctrl+Z brings it back
  const before = JSON.stringify((await course(page)).items.find((i: any) => i.id === tree.id));
  const sky = page.viewportSize()!;
  await drag(page, { x: sky.width * 0.75, y: 200 }, { x: sky.width * 0.75 - 120, y: 200 }, 3);
  expect(JSON.stringify((await course(page)).items.find((i: any) => i.id === tree.id))).toBe(before);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await course(page)).items.some((i: any) => i.id === tree.id)).toBe(false);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).items.some((i: any) => i.id === tree.id)).toBe(true);

  // The basket down the fairway picks as itself, not the pad underfoot; the fairway picks nothing
  await expect(page.getByTestId("tee-view-hud")).toBeVisible();
  const basket = (await course(page)).items.find((i: any) => i.type === "basket" && i.holeId === hole.id);
  const far = await screenOf(page, basket.x, basket.y, 1);
  await page.mouse.click(far.x, far.y);
  await expect.poll(async () => (await editorState(page)).selectedId).toBe(basket.id);
  await page.keyboard.press("Escape");
  const fairway = await screenOf(page, 330, 600, 0);
  await page.mouse.click(fairway.x, fairway.y);
  await page.waitForTimeout(1500);
  expect((await editorState(page)).selectedId).toBeNull();

  // E: back to Look; the toolbar goes, the tee view stays
  await page.keyboard.press("e");
  await expect(page.getByTestId("tee-look")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("tool-bar")).toHaveCount(0);
  await expect(page.getByTestId("tee-view-hud")).toBeVisible();
});
