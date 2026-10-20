import { test, expect, addHole, blankCourse, course, importSite } from "./fixtures";
import type { Page } from "@playwright/test";

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

test("3D grass: the blades' shader (tufts, ragged edges, drier and lusher stretches) builds and draws close to the ground", async ({ page }) => {
  const shaderErrors: string[] = [];
  page.on("console", m => { if (/Shader Error|WebGLProgram|ERROR: \d+:/.test(m.text())) shaderErrors.push(m.text().slice(0, 300)); });
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const s = (window as any).__dgEditor();
    s.set({ grass: 2, areaKind: "rough" });
    (window as any).__dgActions.addDrawn("area", [{ x: 420, y: 560 }, { x: 560, y: 560 }, { x: 560, y: 660 }, { x: 420, y: 660 }]);
    (window as any).__dgActions.select(null);
  });
  await page.keyboard.press("3");
  await page.evaluate(() => {
    const v = (window as any).__dgView;
    void v.controls.setLookAt(400, v.groundHeight(400, 720) + 6, 720, 490, v.groundHeight(490, 610) + 1, 610, false);
  });
  await expect.poll(async () => (await scene(page)).grass.visible, { timeout: 30_000 }).toBe(true);
  expect((await scene(page)).grass.blades).toBeGreaterThan(1000);
  // (a frame or two drawn with them)
  await page.waitForTimeout(1500);
  expect(shaderErrors).toEqual([]);
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
  // (the first woods also draw the leaf textures and tree shapes: slow without a graphics card)
  await expect.poll(async () => (await info()).trees, { timeout: 40_000 }).toBeGreaterThan(200);
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
  await expect.poll(async () => (await info()).trees, { timeout: 40_000 }).toBeGreaterThan(200);
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

test("3D is a real perspective: the lens widens as the view tilts, and narrows again looking straight down", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  const fov = () => page.evaluate(() => (window as any).__dgView.camera.fov as number);
  expect(await fov()).toBeCloseTo(30, 0);
  await page.keyboard.press("3");
  await expect.poll(fov, { timeout: 30_000 }).toBeGreaterThan(40);
  await page.keyboard.press("2");
  await expect.poll(fov, { timeout: 30_000 }).toBeLessThan(31);
});

test("smooth on any device: slow frames make the 3D view lighter step by step, and it steps back up when there is room", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("3");
  await settled(page);
  const q = () => page.evaluate(() => (window as any).__dgView.qualityInfo() as { tier: number; pixelRatio: number; shadow: number; nearFt: number });
  // (Frames of a given length, as the view would time them; each batch a fresh window)
  const frames = (ms: number, n: number) => page.evaluate(([ms, n]) => { const v = (window as any).__dgView; v.forceAdaptive(); for (let i = 0; i < n; i++) v.perfSample(ms); }, [ms, n]);
  const start = await q();
  expect(start.tier).toBe(0);
  // 24 frames under 30 a second: one step lighter (a little less sharp)
  await frames(60, 24);
  const one = await q();
  expect(one.tier).toBe(1);
  expect(one.pixelRatio).toBeLessThan(start.pixelRatio);
  // Still slow: lighter again, down to softer shadows and fewer trees in full detail
  await frames(60, 24 * 3);
  const four = await q();
  expect(four.tier).toBe(4);
  expect(four.shadow).toBeLessThan(start.shadow);
  expect(four.nearFt).toBeLessThan(start.nearFt);
  // Smooth again: a step back only after a few quick windows in a row (no flicker)
  await frames(10, 24 * 2);
  expect((await q()).tier).toBe(4);
  await frames(10, 24);
  expect((await q()).tier).toBe(3);
  // A very slow device (5 frames a second): a window closes after a second and a half, not 24
  // frames, and drops two steps at once (first back to full quality: three quick windows a step)
  await frames(10, 24 * 9);
  expect((await q()).tier).toBe(0);
  const slow = await page.evaluate(() => {
    const v = (window as any).__dgView;
    v.forceAdaptive();
    for (let i = 0; i < 7; i++) v.perfSample(200);
    const before = v.qualityInfo().tier;
    v.perfSample(200);
    return [before, v.qualityInfo().tier];
  });
  expect(slow).toEqual([0, 2]);
});

/** Waits until the view has stopped drawing (a view change's animation is over). */
async function settled(page: Page) {
  let last = -1;
  await expect.poll(async () => {
    const n = await page.evaluate(() => (window as any).__dgView.drawInfo().frames);
    const still = n === last;
    last = n;
    return still;
  }, { timeout: 60_000, intervals: [1000] }).toBe(true);
}

test("frames however slow are counted while the 3D view moves (a slow phone adapts within seconds)", async ({ page }) => {
  test.setTimeout(120_000);
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("3");
  await page.waitForTimeout(1500);
  // Software rendering here draws a frame in a few hundred milliseconds (it once counted only
  // frames under a quarter second, so the slowest devices never got lighter)
  await page.evaluate(() => {
    const v = (window as any).__dgView;
    v.forceAdaptive();
    const spin = () => {
      if ((window as any).__stopSpin) return;
      void v.controls.rotate(0.03, 0, false);
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  });
  await expect.poll(() => page.evaluate(() => (window as any).__dgView.qualityInfo().tier), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.evaluate(() => { (window as any).__stopSpin = true; });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  test("the 3D view starts lighter on a phone: less sharp than the screen's full density, smaller shadows", async ({ page }) => {
    const q = await page.evaluate(() => (window as any).__dgView?.qualityInfo());
    expect(q.mobile).toBe(true);
    expect(q.pixelRatio).toBeLessThanOrEqual(1.5);
    expect(q.shadow).toBe(1024);
  });
});

test("3D woods leave the fairways, ponds, tees and baskets clear (as the painted map does), and fill in when a hole is taken out", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 500 }, { x: 650, y: 500 });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const a = (window as any).__dgActions, s = (window as any).__dgEditor();
    s.set({ areaKind: "woods" });
    a.addDrawn("area", [{ x: 150, y: 250 }, { x: 900, y: 250 }, { x: 900, y: 800 }, { x: 150, y: 800 }]);
    s.set({ areaKind: "water" });
    a.addDrawn("area", [{ x: 700, y: 650 }, { x: 820, y: 650 }, { x: 820, y: 760 }, { x: 700, y: 760 }]);
    s.set({ tool: "select" });
  });
  await page.keyboard.press("3");
  const near = (x: number, y: number, r: number) => page.evaluate(([x, y, r]) => (window as any).__dgView.treesNear(x, y, r), [x, y, r]);
  await expect.poll(() => page.evaluate(() => (window as any).__dgView.forestInfo().trees), { timeout: 40_000 }).toBeGreaterThan(300);
  // None on the fairway (30 ft wide), the tee, the basket or in the pond
  expect(await near(475, 500, 12)).toBe(0);
  expect(await near(300, 500, 10)).toBe(0);
  expect(await near(650, 500, 10)).toBe(0);
  expect(await near(760, 705, 40)).toBe(0);
  // Woods all round them
  expect(await near(475, 380, 40)).toBeGreaterThan(0);
  // The hole taken out: the woods grow back over where its fairway was (selected directly: a
  // click on its row could miss while the panel moves under a busy page)
  await page.evaluate(() => (window as any).__dgActions.select((window as any).__dgCourse().holes[0].id));
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await course(page)).holes.length).toBe(0);
  await expect.poll(() => near(475, 500, 30), { timeout: 40_000 }).toBeGreaterThan(0);
});

test("3D water: a pond on sloping ground lies level but never under the ground, and reflects (water material)", async ({ page }) => {
  await importSite(page);
  await page.keyboard.press("3");
  const check = () => page.evaluate(() => {
    const v = (window as any).__dgView;
    let ponds = 0, below = 0, vertices = 0;
    v.scene.traverse((o: any) => {
      if (!o.isMesh || o.material?.customProgramCacheKey?.() !== "dg-water") return;
      ponds++;
      const pos = o.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        vertices++;
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (y < v.groundHeight(x, z) - 0.05) below++;
      }
    });
    return { ponds, below, vertices };
  });
  await expect.poll(async () => (await check()).ponds, { timeout: 30_000 }).toBeGreaterThan(0);
  const r = await check();
  expect(r.vertices).toBeGreaterThan(10);
  expect(r.below).toBe(0);
});

test("the map view rests while the Design step's page covers it, and draws the changes when it comes back", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  const info = () => page.evaluate(() => (window as any).__dgView.drawInfo() as { paused: boolean; frames: number });
  await page.getByRole("button", { name: "5 Design" }).click();
  await expect.poll(async () => (await info()).paused).toBe(true);
  const before = (await info()).frames;
  // Changes to the course while it rests: nothing drawn
  const slider = page.getByLabel("Tree cover");
  await slider.fill("0.5");
  await slider.dispatchEvent("pointerup");
  await expect.poll(async () => (await course(page)).style.treeCover).toBe(0.5);
  await page.waitForTimeout(500);
  expect((await info()).frames).toBe(before);
  // Back on the map: drawing again
  await page.getByRole("button", { name: "2 Holes" }).click();
  await expect.poll(async () => (await info()).paused).toBe(false);
  await expect.poll(async () => (await info()).frames).toBeGreaterThan(before);
});
