import { test as plain, expect as plainExpect } from "@playwright/test";
import { test, expect, addHole, blankCourse, course, drag, editorState, handleCenter, screenOf } from "./fixtures";
import { autoFlight, FLYOVER_DEFAULTS, keyBetween, keyFlight, keysFromFlight } from "../../src/lib/flight";

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
  // A long hole: a long flight
  await addHole(page, { x: 250, y: 850 }, { x: 1250, y: 250 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").click();
  await page.getByTestId("flyover").click();
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Flying/);
  // The page is busy for longer than a short flight (like a first frame compiling shaders)
  const before = await page.evaluate(() => {
    const p = (window as any).__dgView.flyProgress();
    const t = performance.now();
    while (performance.now() - t < 7000);
    return p;
  });
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => (window as any).__dgView.flyProgress());
  expect(after).not.toBeNull();
  expect(after - before).toBeLessThan(0.2);
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Flying/);
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

test("from a tee and flying over, the ground is the painted map with trees on its woods; Photo puts the photo back", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("tee-view").click();
  const ground = () => page.evaluate(() => {
    const v = (window as any).__dgView;
    const plane = v.ground.mapPlane.material;
    return { painted: !!v.ground.paintedTexture, shown: !!plane.map && plane.map === v.ground.paintedTexture && plane.visible, trees: v.shapes.has("painted-woods") };
  });
  await expect.poll(ground, { timeout: 30_000 }).toEqual({ painted: true, shown: true, trees: true });
  // The Camera settings: the photo instead (kept for next time)
  await page.getByTestId("hud-camera").click();
  await page.getByTestId("flyover-settings").getByRole("radio", { name: "Photo" }).click();
  await expect.poll(async () => (await ground()).painted).toBe(false);
  expect((await editorState(page)).flyLook).toBe("photo");
  await page.getByTestId("flyover-settings").getByRole("radio", { name: "Painted map" }).click();
  await expect.poll(async () => (await ground()).painted, { timeout: 30_000 }).toBe(true);
  // Back on the map: the photo's ground again, no painted trees
  await page.getByTestId("hud-close").click();
  await expect.poll(ground).toEqual({ painted: false, shown: false, trees: false });
});

test("flyover settings: height, speed and field of view change the flight, one undo step each", async ({ page }) => {
  await blankCourse(page);
  const hole = await addHole(page, { x: 300, y: 600 }, { x: 800, y: 600 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("tee-view").click();
  await page.getByTestId("hud-camera").click();
  const flight = () => page.evaluate(id => {
    const v = (window as any).__dgView;
    const f = v.flightPath(id);
    const mid = f.pts[Math.floor(f.pts.length / 2)];
    return { alt: mid.y - v.h(mid.x, mid.z), dur: f.dur, fov: f.fov[0] };
  }, hole.id);
  const before = await flight();
  expect(before.dur).toBeCloseTo(500 / 70, 1);
  const slider = (name: string) => page.getByTestId("flyover-settings").getByRole("slider", { name });
  await slider("Height").focus();
  await page.keyboard.press("End");
  await expect.poll(async () => (await course(page)).flyover?.height).toBe(250);
  await slider("Speed").focus();
  await page.keyboard.press("End");
  await slider("Field of view").focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => (await course(page)).flyover?.fov).toBe(20);
  const after = await flight();
  expect(after.alt).toBeGreaterThan(before.alt + 150);
  expect(after.dur).toBeCloseTo(before.dur / 3, 1);
  expect(after.fov).toBe(20);
  // While it flies, the camera's field of view is the flight's; back to the tee view's after
  await page.getByTestId("hud-flyover").click();
  await expect.poll(() => page.evaluate(() => (window as any).__dgView.povCam.fov)).toBe(20);
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Fly over/, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as any).__dgView.povCam.fov)).toBe(62);
  // Each setting is one undo step
  await page.getByTestId("hud-close").click();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).flyover?.fov).toBeUndefined();
  expect((await course(page)).flyover?.height).toBe(250);
});

test("a hole's own flight through keyframes: shown on the map, dragged, set, added, removed, and flown", async ({ page }) => {
  await blankCourse(page);
  const hole = await addHole(page, { x: 300, y: 600 }, { x: 800, y: 600 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("hole-flight").getByRole("radio", { name: "Keyframes" }).click();
  // Four to start from: the flight it flies by itself
  await expect(page.getByTestId("fly-key")).toHaveCount(4);
  const keys = async () => (await course(page)).holes[0].flyKeys as any[];
  expect((await keys())[0].x).toBeLessThan(300);
  await expect(page.locator('[data-handle="flykey"]')).toHaveCount(4);
  await expect(page.locator('[data-handle="flylook"]')).toHaveCount(4);
  // Keyframe 2's camera dragged off to the side of the hole
  await drag(page, await handleCenter(page, "flykey", 1), await screenOf(page, 500, 450));
  await expect.poll(async () => Math.round((await keys())[1].y / 10)).toBe(45);
  // Its height, and keyframe 3's seconds
  await page.getByRole("spinbutton", { name: "Keyframe 2 height" }).fill("120");
  await page.getByRole("spinbutton", { name: "Keyframe 3 seconds" }).fill("4");
  await expect.poll(async () => (await keys())[1].alt).toBe(120);
  expect((await keys())[2].secs).toBe(4);
  // The flight goes through keyframe 2, as high as it says
  const near = await page.evaluate(id => {
    const v = (window as any).__dgView;
    const f = v.flightPath(id);
    const k = v.doc.course.holes[0].flyKeys[1];
    let best = Infinity, alt = 0;
    for (const p of f.pts) {
      const d = Math.hypot(p.x - k.x, p.z - k.y);
      if (d < best) { best = d; alt = p.y - v.h(p.x, p.z); }
    }
    return { best, alt };
  }, hole.id);
  expect(near.best).toBeLessThan(5);
  expect(near.alt).toBeCloseTo(120, -1);
  // One more (before the last), and one taken out again
  await page.getByTestId("fly-key-add").click();
  await expect(page.getByTestId("fly-key")).toHaveCount(5);
  await page.getByRole("button", { name: "Remove keyframe 4" }).click();
  await expect(page.getByTestId("fly-key")).toHaveCount(4);
  // Flown from the panel
  await page.getByTestId("fly-preview").click();
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Flying/);
  await page.getByTestId("hud-close").click();
  // By itself again
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("hole-flight").getByRole("radio", { name: "By itself" }).click();
  await expect.poll(async () => (await course(page)).holes[0].flyKeys).toBeUndefined();
  await expect(page.locator('[data-handle="flykey"]')).toHaveCount(0);
});

plain("the flight by itself: behind the tee, up over the trees in good time and gently down, to the side when asked (pure logic)", () => {
  const line = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
  const flat = () => 100;
  // Woods 90 ft tall from 150 to 250 ft along the hole
  const woods = (p: { x: number }, reach: number) => (p.x > 150 - reach && p.x < 250 + reach ? 190 : -Infinity);
  const open = autoFlight(line, FLYOVER_DEFAULTS, flat)!;
  const over = autoFlight(line, FLYOVER_DEFAULTS, flat, woods)!;
  plainExpect(open.cam[0].x).toBeCloseTo(-60, 5);
  // (a short hole flies for 6 seconds)
  plainExpect(open.dur).toBe(6);
  const at = (f: typeof open, x: number) => f.cam.reduce((a, c) => (Math.abs(c.x - x) < Math.abs(a.x - x) ? c : a));
  // Open ground: about the height asked; over the woods: clear of the treetops
  plainExpect(at(open, 0).z - 100).toBeGreaterThan(40);
  plainExpect(at(open, 0).z - 100).toBeLessThan(80);
  for (const c of over.cam) if (c.x > 115 && c.x < 285) plainExpect(c.z).toBeGreaterThanOrEqual(190 + 18 - 1e-6);
  // Never a sudden hop: at most half a foot up or down per foot along
  for (let i = 1; i < over.cam.length; i++) plainExpect(Math.abs(over.cam[i].z - over.cam[i - 1].z)).toBeLessThanOrEqual(Math.abs(over.cam[i].x - over.cam[i - 1].x) * 0.5 + 1e-6);
  // Already up before the woods
  plainExpect(at(over, 100).z).toBeGreaterThan(at(open, 100).z + 10);
  // To the right of the line (south, flying east), and twice as fast
  const side = autoFlight(line, { ...FLYOVER_DEFAULTS, side: 50, speed: 2 }, flat)!;
  plainExpect(at(side, 200).y).toBeCloseTo(50, 5);
  plainExpect(side.dur).toBeCloseTo(open.dur / 2, 5);
});

plain("a flight through keyframes: through each one on its seconds, the field of view between them (pure logic)", () => {
  const flat = () => 0;
  const keys = [
    { x: 0, y: 0, alt: 50, lookX: 100, lookY: 0 },
    { x: 100, y: 50, alt: 80, lookX: 200, lookY: 0, fov: 40, secs: 2 },
    { x: 200, y: 0, alt: 30, lookX: 300, lookY: 0, secs: 3 }
  ];
  const f = keyFlight(keys, FLYOVER_DEFAULTS, flat)!;
  plainExpect(f.dur).toBe(5);
  const at = (t: number) => f.cam[Math.round((t / f.dur) * (f.cam.length - 1))];
  plainExpect(at(0)).toEqual({ x: 0, y: 0, z: 50 });
  plainExpect(at(2).x).toBeCloseTo(100, 0);
  plainExpect(at(2).y).toBeCloseTo(50, 0);
  plainExpect(at(2).z).toBeCloseTo(80, 0);
  plainExpect(at(5)).toEqual({ x: 200, y: 0, z: 30 });
  plainExpect(f.fov[0]).toBe(62);
  plainExpect(f.fov[Math.round((2 / 5) * (f.fov.length - 1))]).toBeCloseTo(40, 0);
  // Starting keyframes from a flight, and one between two
  const from = keysFromFlight(f, flat, 3);
  plainExpect(from.map(k => Math.round(k.x))).toEqual([0, Math.round(f.cam[Math.round((f.cam.length - 1) / 2)].x), 200]);
  plainExpect(keyBetween(keys[0], keys[2])).toEqual({ x: 100, y: 0, alt: 40, lookX: 200, lookY: 0 });
});
