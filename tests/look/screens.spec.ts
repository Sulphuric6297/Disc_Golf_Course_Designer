// `npm run look`: screenshots of the main screens into look/, to see the real UI (not assertions).
import { test, expect, importSite, addHole, course } from "../e2e/fixtures";

const shot = (page: any, name: string) => page.screenshot({ path: `look/${name}.png` });

test("start", async ({ page }) => {
  await shot(page, "01-start");
});

test("site and holes", async ({ page }) => {
  await importSite(page);
  await page.waitForTimeout(1500);
  await shot(page, "02-site");
  const doc = await course(page);
  const w = doc.canvas.width, h = doc.canvas.height;
  await addHole(page, { x: w * 0.3, y: h * 0.7 }, { x: w * 0.45, y: h * 0.45 });
  await addHole(page, { x: w * 0.5, y: h * 0.4 }, { x: w * 0.7, y: h * 0.25 });
  await addHole(page, { x: w * 0.72, y: h * 0.3 }, { x: w * 0.8, y: h * 0.65 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await shot(page, "03-holes");
  await page.keyboard.press("3");
  await page.waitForTimeout(1500);
  await shot(page, "04-3d");
  await page.getByTestId("hole-row").first().click();
  await page.waitForTimeout(1200);
  await shot(page, "05-hole-selected");
  await page.getByTestId("tee-view").click();
  await page.waitForTimeout(1500);
  await shot(page, "06-tee-view");
  await expect(page.getByTestId("tee-view-hud")).toBeVisible();
});
