// `npm run look`: screenshots of the main screens into look/, to see the real UI (not assertions).
import { test, expect, importSite, addHole, course } from "../e2e/fixtures";
import type { Page } from "@playwright/test";

const shot = (page: Page, name: string) => page.screenshot({ path: `look/${name}.png` });

/** A nine-hole course on the imported site, with OB, a mando, a drop zone, a bench and a parking sign. */
export async function seedCourse(page: Page) {
  await page.evaluate(() => {
    const a = (window as any).__dgActions;
    const d = (window as any).__dgCourse();
    const W = d.canvas.width, H = d.canvas.height;
    const holes: [number, number, number, number][] = [
      [0.32, 0.86, 0.22, 0.62], [0.2, 0.56, 0.12, 0.3], [0.16, 0.24, 0.42, 0.14], [0.47, 0.12, 0.72, 0.2], [0.76, 0.24, 0.9, 0.48],
      [0.88, 0.54, 0.7, 0.62], [0.66, 0.66, 0.6, 0.88], [0.56, 0.9, 0.46, 0.66], [0.42, 0.62, 0.38, 0.4]
    ];
    holes.forEach(([tx, ty, bx, by]) => a.addHole({ x: tx * W, y: ty * H }, { x: bx * W, y: by * H }, "blue"));
    const s = (window as any).__dgEditor();
    s.set({ areaKind: "ob" });
    a.addDrawn("area", [{ x: 0.5 * W, y: 0.3 * H }, { x: 0.62 * W, y: 0.28 * H }, { x: 0.64 * W, y: 0.4 * H }, { x: 0.52 * W, y: 0.42 * H }]);
    s.set({ lineKind: "ob" });
    a.addDrawn("line", [{ x: 0.95 * W, y: 0.3 * H }, { x: 0.95 * W, y: 0.7 * H }]);
    s.set({ areaKind: "hazard" });
    a.addDrawn("area", [{ x: 0.66 * W, y: 0.7 * H }, { x: 0.72 * W, y: 0.72 * H }, { x: 0.7 * W, y: 0.8 * H }, { x: 0.64 * W, y: 0.78 * H }]);
    s.set({ lineKind: "stream" });
    a.addDrawn("line", [{ x: 0.05 * W, y: 0.97 * H }, { x: 0.2 * W, y: 0.9 * H }, { x: 0.35 * W, y: 0.95 * H }, { x: 0.52 * W, y: 0.86 * H }, { x: 0.64 * W, y: 0.9 * H }, { x: 0.8 * W, y: 0.8 * H }, { x: 0.86 * W, y: 0.6 * H }, { x: 0.83 * W, y: 0.35 * H }, { x: 0.9 * W, y: 0.05 * H }]);
    s.set({ lineKind: "path" });
    a.addDrawn("line", [{ x: 0.24 * W, y: 0.64 * H }, { x: 0.22 * W, y: 0.58 * H }]);
    a.addDrawn("line", [{ x: 0.74 * W, y: 0.2 * H }, { x: 0.76 * W, y: 0.24 * H }]);
    s.set({ areaKind: "woods" });
    a.addDrawn("area", [{ x: 0.02 * W, y: 0.02 * H }, { x: 0.12 * W, y: 0.04 * H }, { x: 0.1 * W, y: 0.18 * H }, { x: 0.03 * W, y: 0.2 * H }]);
    a.select(d.holes[0]?.id ?? null);
    const d2 = (window as any).__dgCourse();
    s.set({ activeHoleId: d2.holes[3].id });
    a.placeAt("add-mando", { x: 0.6 * W, y: 0.15 * H });
    a.placeAt("add-dropzone", { x: 0.55 * W, y: 0.2 * H });
    s.set({ amenityKind: "bench" });
    a.placeAt("add-amenity", { x: 0.36 * W, y: 0.9 * H });
    s.set({ amenityKind: "parking" });
    a.placeAt("add-amenity", { x: 0.3 * W, y: 0.95 * H });
    a.select(null);
    s.set({ tool: "select", activeHoleId: null });
  });
}

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

test("course design and export", async ({ page }) => {
  await importSite(page);
  await seedCourse(page);
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "4 Review" }).click();
  await page.waitForTimeout(1000);
  await shot(page, "07-review");
  await page.getByRole("button", { name: "5 Design" }).click();
  await page.waitForTimeout(2500);
  await shot(page, "08-design-forest-photo");
  await page.getByTestId("forest-options").getByRole("radio", { name: "Everywhere" }).click();
  await page.waitForTimeout(2000);
  await shot(page, "08-design-forest");
  await page.getByTestId("best-rotation").click();
  await page.waitForTimeout(2000);
  await shot(page, "08-design-forest-turned");
  await page.getByRole("button", { name: "North up" }).click();
  for (const t of ["illustrated", "satellite", "topo", "minimal", "night"]) {
    await page.getByTestId(`theme-${t}`).click();
    await page.waitForTimeout(1200);
    await shot(page, `09-design-${t}`);
  }
  await page.getByTestId("theme-forest").click();
  await page.getByTestId("forest-options").getByRole("radio", { name: "Everywhere" }).click();
  await page.getByRole("tab", { name: "Tee sign" }).click();
  await page.waitForTimeout(2000);
  await shot(page, "10-tee-sign");
  await page.getByLabel("Hole for the tee sign").selectOption({ index: 6 });
  await page.waitForTimeout(1500);
  await shot(page, "10-tee-sign-7");
  await page.getByLabel("Tee sign size").selectOption("12x18");
  await page.waitForTimeout(1500);
  await shot(page, "10-tee-sign-tall");
  await page.getByRole("tab", { name: "Scorecard" }).click();
  await page.waitForTimeout(800);
  await shot(page, "11-scorecard");
  await page.getByRole("button", { name: "6 Export" }).click();
  await page.waitForTimeout(800);
  await shot(page, "12-export");
});

test("forest map close up", async ({ page }) => {
  await importSite(page);
  await seedCourse(page);
  await page.getByRole("button", { name: "5 Design" }).click();
  await page.getByTestId("forest-options").getByRole("radio", { name: "Everywhere" }).click();
  await page.waitForTimeout(2500);
  await page.getByTestId("design-page").screenshot({ path: "look/13-forest-page.png" });
  // Twice as big: the treetops, trails and creek up close
  const bar = page.getByRole("button", { name: "Fit the page" }).locator("..");
  for (let i = 0; i < 3; i++) await bar.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(800);
  await shot(page, "13-forest-zoom");
  // Different light: a low sun from the right, deep shadows
  await page.getByRole("button", { name: "Fit the page" }).click();
  for (const [label, v] of [["Sun from the", "90"], ["Sun height", "18"], ["Shadows", "1"]] as const) {
    const sl = page.getByLabel(label);
    await sl.fill(v);
    await sl.dispatchEvent("pointerup");
  }
  await page.waitForTimeout(3500);
  await page.getByTestId("design-page").screenshot({ path: "look/13-forest-light.png" });
  await page.getByTestId("light-shadow").screenshot({ path: "look/13-light-panel.png" });
  await page.getByTestId("forest-options").getByRole("radio", { name: "From the photo" }).click();
  await page.getByRole("button", { name: "Fit the page" }).click();
  await page.waitForTimeout(2500);
  await page.getByTestId("design-page").screenshot({ path: "look/13-forest-page-photo.png" });
});

test("basket marks", async ({ page }) => {
  await importSite(page);
  await seedCourse(page);
  await page.getByRole("button", { name: "5 Design" }).click();
  await page.getByTestId("forest-options").getByRole("radio", { name: "Everywhere" }).click();
  await page.waitForTimeout(2500);
  const bar = page.getByRole("button", { name: "Fit the page" }).locator("..");
  for (let i = 0; i < 4; i++) await bar.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(800);
  for (const mark of ["basket", "badge", "flag", "target", "number"]) {
    await page.getByTestId(`basket-mark-${mark}`).click();
    await page.waitForTimeout(600);
    await shot(page, `15-basket-${mark}`);
  }
  await page.getByTestId("basket-mark-basket").scrollIntoViewIfNeeded();
  await page.getByRole("radiogroup", { name: "Basket marks" }).locator("..").screenshot({ path: "look/15-basket-picker.png" });
});

test("features close up", async ({ page }) => {
  await importSite(page);
  await seedCourse(page);
  await page.evaluate(() => {
    const w = window as any, a = w.__dgActions, d = w.__dgCourse();
    const W = d.canvas.width, H = d.canvas.height;
    // A gate on hole 6
    w.__dgEditor().set({ mandoKind: "gate", activeHoleId: d.holes[5].id });
    a.placeAt("add-mando", { x: 0.79 * W, y: 0.58 * H });
    w.__dgEditor().set({ mandoKind: "single", activeHoleId: null });
    for (const [kind, x, y] of [["restroom", 0.26, 0.86], ["trash", 0.4, 0.84], ["water", 0.27, 0.8], ["kiosk", 0.33, 0.82], ["here", 0.38, 0.92], ["firstaid", 0.22, 0.88], ["picnic", 0.44, 0.9]] as const) {
      w.__dgEditor().set({ amenityKind: kind });
      a.placeAt("add-amenity", { x: x * W, y: y * H });
    }
    a.select(null);
  });
  // The road is OB (picked in its inspector)
  await page.getByRole("button", { name: "3 Features" }).click();
  const roadId = await page.evaluate(() => (window as any).__dgCourse().items.find((i: any) => i.type === "line" && i.kind === "road")?.id);
  await page.evaluate(id => (window as any).__dgActions.select(id), roadId);
  await page.getByRole("radiogroup", { name: "Out of bounds" }).getByRole("radio", { name: "OB, red edge" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "2 Holes" }).click();
  await page.getByTestId("hole-row").nth(1).click();
  await page.getByTestId("ob-left").click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "3 Features" }).click();
  await page.waitForTimeout(1200);
  await shot(page, "16-features");
  await page.evaluate(() => {
    const d = (window as any).__dgCourse();
    (window as any).__dgView.fitHole(d.holes[3].id);
  });
  await page.waitForTimeout(1500);
  await shot(page, "16-features-zoom");
  await page.getByRole("button", { name: "5 Design" }).click();
  for (const theme of ["illustrated", "forest"]) {
    await page.getByTestId(`theme-${theme}`).click();
    if (theme === "forest") await page.getByTestId("forest-options").getByRole("radio", { name: "Everywhere" }).click();
    await page.waitForTimeout(2500);
    await page.getByTestId("design-page").screenshot({ path: `look/16-print-${theme}.png` });
  }
});
