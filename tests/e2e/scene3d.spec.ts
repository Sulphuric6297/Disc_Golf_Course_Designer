import { test, expect, addHole, blankCourse, course } from "./fixtures";

const grassSetting = (page: import("@playwright/test").Page) => page.evaluate(() => (window as any).__dgEditor().grass);

type SceneInfo = {
  sky: boolean;
  sun: { x: number; y: number; z: number };
  exposure: number;
  grass: { quality: number; visible: boolean; blades: number };
  software: boolean;
};
const scene = (page: import("@playwright/test").Page) => page.evaluate(() => (window as any).__dgView.sceneInfo() as SceneInfo);

test("3D: a sky when tilted (none looking straight down), lit by the course's sun", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await scene(page)).sky).toBe(false);
  // The default sun: from the north-west (the top left of the map), as on the painted map
  const sun0 = (await scene(page)).sun;
  expect(sun0.x).toBeLessThan(0);
  expect(sun0.z).toBeLessThan(0);
  expect(sun0.y).toBeGreaterThan(0.5);
  await page.keyboard.press("3");
  await expect.poll(async () => (await scene(page)).sky).toBe(true);
  // Light settings from the map view: the sun moves to the east and drops, the scene brightens
  await page.getByTestId("scene-button").click();
  const panel = page.getByTestId("scene-panel");
  const set = async (label: string, value: string) => {
    const slider = panel.getByLabel(label);
    await slider.fill(value);
    await slider.dispatchEvent("pointerup");
  };
  await set("Sun from the", "90");
  await expect.poll(async () => (await course(page)).style.sunAngle).toBe(90);
  await set("Sun height", "20");
  await set("Brightness", "0.2");
  await expect.poll(async () => (await scene(page)).sun.x).toBeGreaterThan(0.8);
  const lit = await scene(page);
  expect(lit.sun.y).toBeLessThan(0.4);
  expect(lit.exposure).toBeGreaterThan(1.2);
  // One undo step each
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).style.light).toBe(0);
});

test("3D grass: blades near the ground when tilted, none from straight above; the setting is kept", async ({ page }) => {
  test.setTimeout(150_000);
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("3");
  // A setting of this device (not of the course): kept for next time
  await page.getByTestId("scene-button").click();
  await page.getByTestId("scene-panel").getByRole("radio", { name: "Medium" }).click();
  await expect.poll(() => grassSetting(page)).toBe(2);
  await page.reload();
  await expect.poll(() => grassSetting(page)).toBe(2);
  await page.keyboard.press("3");
  await page.getByTestId("scene-button").click();
  await page.getByTestId("scene-panel").getByRole("radio", { name: "Low" }).click();
  await expect.poll(() => grassSetting(page)).toBe(1);
  // Down low over the fairway: blades
  const look = (eye: number[], at: number[]) => page.evaluate(([e, a]) => {
    const v = (window as any).__dgView;
    void v.controls.setLookAt(e[0], v.groundHeight(e[0], e[2]) + e[1], e[2], a[0], v.groundHeight(a[0], a[2]) + a[1], a[2], false);
  }, [eye, at]);
  await look([420, 14, 760], [560, 0, 700]);
  await expect.poll(async () => (await scene(page)).grass.visible).toBe(true);
  expect((await scene(page)).grass.blades).toBeGreaterThan(1000);
  // Turned off
  await page.getByTestId("scene-panel").getByRole("radio", { name: "Off" }).click();
  await expect.poll(async () => (await scene(page)).grass.quality).toBe(0);
  expect((await scene(page)).grass.visible).toBe(false);
  // Looking straight down: none (they couldn't be seen)
  await page.getByTestId("scene-panel").getByRole("radio", { name: "Low" }).click();
  await expect.poll(async () => (await scene(page)).grass.visible).toBe(true);
  await look([560, 200, 700], [560, 0, 700.01]);
  await expect.poll(async () => (await scene(page)).grass.visible).toBe(false);
});

test("3D grass: what grows where follows the course (mown fairway, tall rough, none on water)", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const a = (window as any).__dgActions;
    const s = (window as any).__dgEditor();
    s.set({ areaKind: "rough" });
    a.addDrawn("area", [{ x: 300, y: 300 }, { x: 500, y: 300 }, { x: 500, y: 450 }, { x: 300, y: 450 }]);
    s.set({ areaKind: "water" });
    a.addDrawn("area", [{ x: 800, y: 300 }, { x: 950, y: 300 }, { x: 950, y: 450 }, { x: 800, y: 450 }]);
  });
  const heights = await page.evaluate(() => (window as any).__dgView.grassHeights([{ x: 575, y: 700 }, { x: 400, y: 375 }, { x: 875, y: 375 }, { x: 575, y: 550 }]));
  const [fairway, rough, water, lawn] = heights as number[];
  expect(fairway).toBeGreaterThan(0.1);
  expect(fairway).toBeLessThan(lawn);
  expect(rough).toBeGreaterThan(lawn * 3);
  expect(water).toBe(0);
});

test("3D woods: real trees, the ones near the camera in full detail and the rest lighter", async ({ page }) => {
  await blankCourse(page);
  await page.evaluate(() => {
    const a = (window as any).__dgActions;
    (window as any).__dgEditor().set({ areaKind: "woods" });
    a.addDrawn("area", [{ x: 200, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 600 }, { x: 200, y: 600 }]);
  });
  await page.keyboard.press("3");
  const info = (eye?: number[]) => page.evaluate(e => (window as any).__dgView.forestInfo(e && { x: e[0], y: e[1], z: e[2] }) as { trees: number; near: number }, eye);
  await expect.poll(async () => (await info()).trees).toBeGreaterThan(200);
  // From high above the whole course: all of them light
  expect((await info([450, 3000, 1400])).near).toBe(0);
  // Standing at the edge of the woods: the close ones in full detail, not all of them
  const close = await info([450, 8, 640]);
  expect(close.near).toBeGreaterThan(0);
  expect(close.near).toBeLessThan(close.trees);
  // The drawn view does the same as the camera moves
  await page.evaluate(() => { const v = (window as any).__dgView; void v.controls.setLookAt(450, 3000, 1400, 450, 0, 400, false); });
  await expect.poll(async () => (await info()).near, { timeout: 40_000 }).toBe(0);
});

test("landscape: pine forest fills the 3D woods with pines; the painted map takes its colors; one undo step", async ({ page }) => {
  await blankCourse(page);
  await page.evaluate(() => {
    const a = (window as any).__dgActions;
    (window as any).__dgEditor().set({ areaKind: "woods" });
    a.addDrawn("area", [{ x: 200, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 600 }, { x: 200, y: 600 }]);
  });
  await page.keyboard.press("3");
  const info = () => page.evaluate(() => (window as any).__dgView.forestInfo() as { trees: number; conifers: number });
  await expect.poll(async () => (await info()).trees).toBeGreaterThan(200);
  expect((await info()).conifers / (await info()).trees).toBeLessThan(0.4);
  await page.getByTestId("scene-button").click();
  await page.getByTestId("landscape-pines").click();
  await expect.poll(async () => (await course(page)).style.landscape).toBe("pines");
  await expect.poll(async () => { const i = await info(); return i.conifers / i.trees; }).toBeGreaterThan(0.7);
  // The default Forest style paints in the landscape's colors
  const s = (await course(page)).style;
  expect(s.trees).toBe("#2a3d2e");
  expect(s.treeCover).toBe(0.9);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).style.landscape ?? "woods").toBe("woods");
  expect((await course(page)).style.trees).toBe("#354a2c");
});
