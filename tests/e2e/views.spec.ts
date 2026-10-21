import { test as plain, expect as plainExpect } from "@playwright/test";
import { test, expect, addHole, blankCourse, course, drag, editorState, handleCenter, screenOf } from "./fixtures";
import { autoFlight, flightClock, FLYOVER_DEFAULTS, keyBetween, keyFlight, keysFromFlight } from "../../src/lib/flight";
import { createArea, createBasket, createEmptyCourse, createTee, newHole } from "../../src/lib/course";
import { drawOverlay } from "../../src/viewport/flyTitle";
import { detailArea } from "../../src/lib/forest";

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
  test.setTimeout(150_000);
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").click();
  await page.getByTestId("flyover").click();
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Flying/);
  await expect.poll(() => page.evaluate(() => (window as any).__dgView.flyProgress()), { timeout: 5000 }).toBeGreaterThan(0.05);
  // It lands by itself (a short hole flies for 6 seconds and slows to a stop; a slow frame
  // doesn't skip it, so drawn in software here it takes longer)
  await expect(page.getByTestId("hud-flyover")).toHaveText(/Fly over/, { timeout: 90_000 });
  await page.getByTestId("hud-close").click();
  await expect(page.getByTestId("tee-view-hud")).toBeHidden();
});

test("leaving a flyover part way leaves nothing of it over the map (its title, badge, distance)", async ({ page }) => {
  test.setTimeout(120_000);
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").click();
  await page.getByTestId("flyover").click();
  await expect(page.getByTestId("fly-overlay")).toBeVisible();
  await page.getByTestId("hud-close").click();
  await expect(page.getByTestId("tee-view-hud")).toBeHidden();
  await expect(page.getByTestId("fly-overlay")).toBeHidden();
  await expect(page.getByTestId("pov-basket")).toBeHidden();
  // (and after a while on the map too)
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(800);
  await expect(page.getByTestId("fly-overlay")).toBeHidden();
});

test("under the 3D trees the painted ground is grass, not painted treetops (the trees still stand on its woods)", async ({ page }) => {
  test.setTimeout(240_000);
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("tee-view").click();
  // (the 3D view rests while it paints: drawn in software, its frames would starve the painting)
  await page.evaluate(() => (window as any).__dgView.setPaused(true));
  await expect.poll(() => page.evaluate(() => { const v = (window as any).__dgView; return !!v.ground.paintedTexture && v.shapes.has("painted-woods"); }), { timeout: 150_000 }).toBe(true);
  // How much the brightness varies over 40 ft squares in the woods: treetops lit and shaded vary
  // a lot, grass little
  const spread = await page.evaluate(() => {
    const v = (window as any).__dgView, img = v.ground.paintedTexture.image, doc = (window as any).__dgCourse();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const k = img.width / doc.canvas.width;
    return [[150, 200], [1000, 300]].map(([x, y]) => {
      const d = g.getImageData(Math.round((x - 20) * k), Math.round((y - 20) * k), Math.round(40 * k), Math.round(40 * k)).data;
      let n = 0, sum = 0, sq = 0;
      for (let i = 0; i < d.length; i += 4) { const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; sum += l; sq += l * l; n++; }
      return Math.sqrt(sq / n - (sum / n) ** 2);
    });
  });
  for (const sd of spread) expect(sd).toBeLessThan(10);
  await page.getByTestId("hud-close").click();
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
  test.setTimeout(300_000);
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
  // (the 3D view rests while it paints: drawn in software here, its frames would starve the painting)
  await page.evaluate(() => (window as any).__dgView.setPaused(true));
  await expect.poll(ground, { timeout: 150_000 }).toEqual({ painted: true, shown: true, trees: true });
  // The Camera settings: the photo instead (kept for next time)
  await page.getByTestId("hud-camera").click();
  await page.getByTestId("flyover-settings").getByRole("radio", { name: "Photo" }).click();
  await expect.poll(async () => (await ground()).painted).toBe(false);
  expect((await editorState(page)).flyLook).toBe("photo");
  await page.getByTestId("flyover-settings").getByRole("radio", { name: "Painted map" }).click();
  await expect.poll(async () => (await ground()).painted, { timeout: 30_000 }).toBe(true);
  // Back on the map: the photo's ground again, no painted trees (closed while still resting:
  // the tee view's painted woods drawn in software would hold up the click)
  await page.getByTestId("hud-close").click();
  await page.evaluate(() => (window as any).__dgView.setPaused(false));
  await expect.poll(ground, { timeout: 30_000 }).toEqual({ painted: false, shown: false, trees: false });
});

test("from a tee, the hole's ground is painted sharper (over the whole site's painting); gone back on the map", async ({ page }) => {
  test.setTimeout(240_000);
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("tee-view").click();
  // (the 3D view rests while it paints: drawn in software, its frames would starve the painting)
  await page.evaluate(() => (window as any).__dgView.setPaused(true));
  const sharp = () => page.evaluate(() => {
    const v = (window as any).__dgView;
    const d = v.ground.detailPainting, plane = v.ground.detailPlane, base = v.ground.paintedTexture;
    if (!d || !plane || !base) return null;
    return { rect: d.rect, pxPerFt: d.canvas.width / d.rect.width, basePxPerFt: base.image.width / v.doc.canvas.width, shown: plane.visible };
  });
  await expect.poll(sharp, { timeout: 120_000 }).not.toBeNull();
  const d = (await sharp())!;
  expect(d.shown).toBe(true);
  // (round the hole, tee to basket)
  expect(d.rect.x).toBeLessThan(400);
  expect(d.rect.x + d.rect.width).toBeGreaterThan(750);
  expect(d.rect.y).toBeLessThan(700);
  expect(d.rect.y + d.rect.height).toBeGreaterThan(700);
  expect(d.pxPerFt).toBeGreaterThan(d.basePxPerFt * 1.5);
  // (closed while still resting, as above)
  await page.getByTestId("hud-close").click();
  await page.evaluate(() => (window as any).__dgView.setPaused(false));
  await expect.poll(sharp).toBeNull();
});

plain("a flight's motion slows smoothly to a stop at its end (and by itself gets going gently): no jolt anywhere", () => {
  for (const [dur, easeIn] of [[8, true], [6, false], [2, true]] as const) {
    const { play, at } = flightClock(dur, easeIn);
    plainExpect(play).toBeGreaterThan(dur);
    plainExpect(at(0)).toBe(0);
    plainExpect(at(play)).toBeCloseTo(dur, 9);
    const dt = 0.01;
    const speed = (t: number) => (at(t + dt) - at(t - dt)) / (2 * dt);
    // Stopped at the end, flying at full speed before the slowing, and never jumping
    plainExpect(speed(play - dt)).toBeLessThan(0.01);
    plainExpect(speed(play - Math.min(2, dur / 3) * 2 - 0.05)).toBeCloseTo(1, 2);
    let last = speed(dt);
    for (let t = 2 * dt; t < play - dt; t += dt) {
      const v = speed(t);
      plainExpect(v).toBeGreaterThanOrEqual(-1e-9);
      plainExpect(Math.abs(v - last)).toBeLessThan(0.04);
      last = v;
    }
    // By itself it starts from rest; through keyframes, straight away at their speed
    if (easeIn) plainExpect(speed(dt)).toBeLessThan(0.05);
    else plainExpect(at(1)).toBeCloseTo(1, 9);
  }
});

test("a video is drawn farther and finer than the screen (thinner haze; with a graphics card, trees in full detail farther out), and the screen's back after", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  const info = () => page.evaluate(() => (window as any).__dgView.qualityInfo());
  const screen = await info();
  const during = await page.evaluate(() => {
    const v = (window as any).__dgView;
    const frames = v.flightFrames(64, 36);
    const q = v.qualityInfo();
    frames.dispose();
    return q;
  });
  expect(during.video).toBe(true);
  expect(during.haze).toBeLessThan(screen.haze);
  // (drawn in software here, where only the haze changes)
  if (!during.software) expect(during.nearFt).toBeGreaterThan(screen.nearFt * 1.5);
  const after = await info();
  expect([after.video, after.nearFt, after.haze, after.shadow]).toEqual([false, screen.nearFt, screen.haze, screen.shadow]);
});

plain("where a hole is painted sharper: round its line on the terrain's grid, at most 6 px a foot, none when no sharper than the whole site", () => {
  const doc = { canvas: { width: 2000, height: 1500 }, gridSize: 10 };
  const line = [{ x: 403, y: 707 }, { x: 755, y: 698 }];
  const a = detailArea(doc, line, 3072, 1)!;
  plainExpect(a.rect).toEqual({ x: 240, y: 530, width: 680, height: 340 });
  for (const v of Object.values(a.rect)) plainExpect(v % 10).toBe(0);
  plainExpect(a.k).toBeCloseTo(3072 / 680, 6);
  // (a short hole: no sharper than 6 px a foot)
  plainExpect(detailArea(doc, [{ x: 500, y: 500 }, { x: 560, y: 500 }], 3072, 1)!.k).toBe(6);
  // (at the site's edge: kept on the site)
  plainExpect(detailArea(doc, [{ x: 30, y: 20 }, { x: 300, y: 20 }], 3072, 1)!.rect.x).toBe(0);
  // Not worth it when the whole site's painting is about as sharp
  plainExpect(detailArea(doc, line, 3072, 4)).toBeNull();
});

test("flyover settings: height, speed and field of view change the flight, one undo step each; a hole's own", async ({ page }) => {
  test.setTimeout(240_000);
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
  // (for all holes; then this hole's own)
  await page.getByTestId("flyover-settings").getByRole("radio", { name: "All holes" }).click();
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
  // This hole's own: lower than the rest, kept for it only; back to the settings for all holes
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("tee-view").click();
  await page.getByTestId("hud-camera").click();
  // (the 3D view rests while the settings change: drawn in software, its frames hold up the page)
  await page.evaluate(() => (window as any).__dgView.setPaused(true));
  await page.getByTestId("flyover-settings").getByRole("radio", { name: /^Hole 1/ }).click();
  await slider("Height").focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => (await course(page)).holes[0].flyover?.height, { timeout: 30_000 }).toBe(10);
  expect((await course(page)).flyover?.height).toBe(250);
  expect((await flight()).alt).toBeLessThan(after.alt - 150);
  // (from All holes: Apply to holes, hole 1 picked)
  await page.getByTestId("flyover-settings").getByRole("radio", { name: "All holes" }).click();
  await page.getByTestId("flyover-apply").getByRole("button", { name: "Apply to holes…" }).click();
  await page.getByTestId("apply-holes").getByRole("button", { name: "Hole 1" }).click();
  await page.getByTestId("apply-holes").getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await course(page)).holes[0].flyover).toBeUndefined();
});

test("flyover on-screen switches: off for all holes, back on for one; the disc flight lines off everywhere", async ({ page }) => {
  await blankCourse(page);
  const h1 = await addHole(page, { x: 300, y: 500 }, { x: 800, y: 500 });
  const h2 = await addHole(page, { x: 300, y: 700 }, { x: 800, y: 700 });
  await page.keyboard.press("Escape");
  // All holes: the Export step's Camera settings
  await page.getByRole("button", { name: "6 Export" }).click();
  await page.getByTestId("video-camera").locator("summary").click();
  const sw = (name: string) => page.getByTestId("video-camera").getByRole("checkbox", { name, exact: true });
  for (const name of ["Hole title", "Hole badge", "Distance to the pin", "Course name", "Disc flight", "Line of play", "Putting circle", "OB", "Other holes", "Walks"]) await expect(sw(name)).toBeChecked();
  await sw("Distance to the pin").uncheck();
  await sw("Disc flight").uncheck();
  await sw("Other holes").uncheck();
  await expect.poll(async () => { const f = (await course(page)).flyover; return [f?.pinDistance, f?.discFlight, f?.otherHoles]; }).toEqual([false, false, false]);
  // (the disc's flight off for all holes: the yellow lines off everywhere too)
  expect((await course(page)).style.discFlight).toBe(false);
  // One undo step each
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).flyover?.otherHoles).toBeUndefined();
  await sw("Other holes").uncheck();
  // Hole 1's own: the distance back on for it
  await page.getByRole("button", { name: "2 Holes" }).click();
  await page.getByTestId("hole-row").first().click();
  await expect(page.getByTestId("hole-flight").getByTestId("flyover-show")).toBeVisible();
  const own = (name: string) => page.getByTestId("hole-flight").getByRole("checkbox", { name, exact: true });
  await expect(own("Distance to the pin")).not.toBeChecked();
  await own("Distance to the pin").check();
  await expect.poll(async () => (await course(page)).holes[0].flyover?.pinDistance).toBe(true);
  expect((await course(page)).flyover?.pinDistance).toBe(false);
  // Hole 1's own settings given to hole 2 (Apply to holes: All picks every other hole)
  const apply = page.getByTestId("hole-flight").getByTestId("flyover-apply");
  await apply.getByRole("button", { name: "Apply to holes…" }).click();
  await page.getByTestId("apply-holes").getByRole("checkbox", { name: "All holes" }).check();
  await expect(page.getByTestId("apply-holes").getByRole("button", { name: "Hole 2" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("apply-holes").getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await course(page)).holes[1].flyover?.pinDistance).toBe(true);
  await expect(page.getByTestId("apply-holes")).toHaveCount(0);
  // All holes from the hole's own panel too: the disc's flight back on for every hole
  await page.getByTestId("hole-flight").getByRole("radio", { name: "All holes" }).click();
  await own("Disc flight").check();
  await expect.poll(async () => { const d = await course(page); return [d.flyover?.discFlight, d.style.discFlight]; }).toEqual([true, undefined]);
  expect((await course(page)).holes[0].flyover?.discFlight).toBeUndefined();
  await own("Disc flight").uncheck();
  // While hole 1 flies: its disc flight and the other hole's are hidden (shown again after)
  const hidden = await page.evaluate(id => {
    const v = (window as any).__dgView;
    v.povHole = id;
    const names = v.hideForFlight().map((o: any) => { o.visible = true; return o.name; });
    v.povHole = null;
    return names;
  }, h1.id);
  expect(hidden).toContain(`arc:${h1.id}`);
  expect(hidden).toContain(`arc:${h2.id}`);
  // The yellow lines off everywhere (the 3D view's switch)
  await page.keyboard.press("Escape");
  await page.keyboard.press("3");
  await page.getByTestId("scene-button").click();
  const lines = page.getByTestId("scene-panel").getByRole("checkbox", { name: "Disc flight lines" });
  await expect(lines).not.toBeChecked();
  await lines.check();
  await expect.poll(async () => (await course(page)).style.discFlight).toBeUndefined();
  await lines.uncheck();
  await expect.poll(async () => (await course(page)).style.discFlight).toBe(false);
  await expect.poll(() => page.evaluate(k => (window as any).__dgView.scene.getObjectByName(k)?.children.length ?? -1, `arc:${h1.id}`)).toBe(0);
});

plain("the flyover's picture shows only what is switched on: the distance to the pin, the badge, the course's name", () => {
  const texts: string[] = [];
  const noop = () => {};
  const g = new Proxy({} as any, {
    get: (t, k) => (k === "fillText" ? (s: string) => texts.push(s) : k === "measureText" ? () => ({ width: 40 }) : k === "createLinearGradient" ? () => ({ addColorStop: noop }) : k in t ? t[k] : noop),
    set: (t, k, v) => { t[k] = v; return true; }
  });
  const doc = { ...createEmptyCourse(), name: "Springfield Park" };
  const all = { title: true, badge: true, pinDistance: true, courseName: true };
  const title = { number: "1", name: "", par: "PAR 3", length: "300 FT", elevation: "", color: "#fff", ink: "#000", show: all };
  const info = { basket: { x: 600, y: 300 }, toBasket: 287 };
  drawOverlay(g, 1280, 720, title, 0, info, doc);
  plainExpect(texts.some(t => /287/.test(t))).toBe(true);
  plainExpect(texts).toContain("HOLE 1");
  plainExpect(texts).toContain("Springfield Park");
  texts.length = 0;
  drawOverlay(g, 1280, 720, { ...title, show: { ...all, pinDistance: false, badge: false, courseName: false } }, 0, info, doc);
  plainExpect(texts.some(t => /287/.test(t))).toBe(false);
  plainExpect(texts).not.toContain("HOLE 1");
  plainExpect(texts).not.toContain("Springfield Park");
  // The big title off: never drawn, and the distance shows from the start
  texts.length = 0;
  drawOverlay(g, 1280, 720, { ...title, show: { ...all, title: false } }, 1, info, doc);
  plainExpect(texts.some(t => /287/.test(t))).toBe(true);
  plainExpect(texts.filter(t => t === "HOLE 1")).toHaveLength(1);
  plainExpect(FLYOVER_DEFAULTS.pinDistance && FLYOVER_DEFAULTS.discFlight && FLYOVER_DEFAULTS.otherHoles).toBe(true);
});

test("a hole's own flight through keyframes: shown on the map, dragged, set, added, removed, and flown", async ({ page }) => {
  await blankCourse(page);
  const hole = await addHole(page, { x: 300, y: 600 }, { x: 800, y: 600 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").first().click();
  await page.getByTestId("hole-flight").getByRole("radio", { name: "Keyframes" }).click();
  // Four to start from: the flight it flies by itself, each at the flyover's height (10 ft)
  await expect(page.getByTestId("fly-key")).toHaveCount(4);
  const keys = async () => (await course(page)).holes[0].flyKeys as any[];
  expect((await keys()).map(k => k.alt)).toEqual([10, 10, 10, 10]);
  expect((await keys())[0].x).toBeLessThan(300);
  await expect(page.locator('[data-handle="flykey"]')).toHaveCount(4);
  await expect(page.locator('[data-handle="flylook"]')).toHaveCount(4);
  // Keyframe 2's camera dragged off to the side of the hole
  await drag(page, await handleCenter(page, "flykey", 1), await screenOf(page, 500, 450));
  await expect.poll(async () => Math.round((await keys())[1].y / 10)).toBe(45);
  // Its height, and keyframe 3's seconds
  // (typed like any number: cleared first, then typed key by key)
  const h2 = page.getByRole("spinbutton", { name: "Keyframe 2 height" });
  await h2.click();
  await h2.press("Control+a");
  await h2.press("Backspace");
  await h2.pressSequentially("120");
  await h2.press("Enter");
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

plain("the flight by itself: a low glide from behind the tee, under a crown over the line, round its trunk, over a bush, never bobbing (pure logic)", () => {
  const line = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
  const flat = () => 100;
  const open = autoFlight(line, FLYOVER_DEFAULTS, flat)!;
  plainExpect(open.cam[0].x).toBeCloseTo(-60, 5);
  // (a short hole flies for 6 seconds)
  plainExpect(open.dur).toBe(6);
  const at = (f: typeof open, x: number) => f.cam.reduce((a, c) => (Math.abs(c.x - x) < Math.abs(a.x - x) ? c : a));
  // Low over open ground: the height asked the whole way (10 ft by default)
  plainExpect(FLYOVER_DEFAULTS.height).toBe(10);
  for (const c of open.cam) plainExpect(Math.abs(c.z - 110)).toBeLessThan(0.2);
  // A big tree over the line at 200 ft (leaves from 30 to 70 ft up, its trunk on the line), a bush at 300 ft
  const trees = (p: { x: number; y: number }, reach: number) => {
    if (Math.hypot(p.x - 200, p.y) < reach + 25) return { base: 130, top: 170, trunks: Math.hypot(p.x - 200, p.y) < reach + 8 ? [{ x: 200, y: 0 }] : [] };
    if (Math.hypot(p.x - 300, p.y) < reach + 10) return { base: 100, top: 125, trunks: [] };
    return null;
  };
  const glide = autoFlight(line, FLYOVER_DEFAULTS, flat, trees)!;
  // Under the big tree's leaves, and off to the side of its trunk
  for (const c of glide.cam) if (Math.hypot(c.x - 200, c.y) < 26) plainExpect(c.z).toBeLessThanOrEqual(130 - 5 + 1e-6);
  plainExpect(Math.min(...glide.cam.map(c => Math.hypot(c.x - 200, c.y)))).toBeGreaterThan(4);
  // Over the bush (too low to pass under)
  plainExpect(at(glide, 300).z).toBeGreaterThan(125);
  // Never a sudden hop: at most half a foot up or down per foot along
  for (let i = 1; i < glide.cam.length; i++) plainExpect(Math.abs(glide.cam[i].z - glide.cam[i - 1].z)).toBeLessThanOrEqual(Math.hypot(glide.cam[i].x - glide.cam[i - 1].x, glide.cam[i].y - glide.cam[i - 1].y) * 0.5 + 1e-6);
  // To the right of the line (south, flying east), and twice as fast
  const side = autoFlight(line, { ...FLYOVER_DEFAULTS, side: 50, speed: 2 }, flat)!;
  plainExpect(at(side, 200).y).toBeCloseTo(50, 5);
  plainExpect(side.dur).toBeCloseTo(open.dur / 2, 5);
  // Over rolling ground it keeps its height over the ground (rising and falling with it)
  const bumpy = (x: number) => 100 + 8 * Math.sin(x / 20);
  const steady = autoFlight(line, FLYOVER_DEFAULTS, x => bumpy(x))!;
  for (const c of steady.cam) plainExpect(Math.abs(c.z - bumpy(c.x) - 10)).toBeLessThan(2);
});

test("a hole cut through woods is flown at its height down the fairway, between the woods' own trees", async ({ page }) => {
  const doc = createEmptyCourse();
  const h = newHole({ fairwayWidth: 40 });
  doc.holes.push(h);
  doc.items.push(createTee(h.id, { x: 250, y: 500 }, "blue"), createBasket(h.id, { x: 650, y: 470 }));
  // (the woods drawn over the whole hole: its trees stand either side of the fairway)
  doc.items.push(createArea("woods", [{ x: 150, y: 300 }, { x: 800, y: 300 }, { x: 800, y: 700 }, { x: 150, y: 700 }]));
  await page.getByLabel("Open course file").setInputFiles({ name: "woods.dgcourse.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(doc)) });
  await expect.poll(() => page.evaluate(() => (window as any).__dgCourse().holes.length), { timeout: 30_000 }).toBe(1);
  const above = () => page.evaluate(() => {
    const v = (window as any).__dgView;
    const path = v.flightPath((window as any).__dgCourse().holes[0].id);
    return path.pts.map((q: any) => q.y - v.h(q.x, q.z));
  });
  await expect.poll(async () => (await above()).length).toBeGreaterThan(30);
  for (const a of await above()) {
    expect(a).toBeGreaterThan(9);
    expect(a).toBeLessThan(11);
  }
});

test("woods with few corners stand where their curve bulges past the corners (flyovers go over them there)", async ({ page }) => {
  await blankCourse(page);
  await page.evaluate(() => {
    (window as any).__dgEditor().set({ areaKind: "woods" });
    (window as any).__dgActions.addDrawn("area", [{ x: 300, y: 300 }, { x: 700, y: 300 }, { x: 700, y: 700 }, { x: 300, y: 700 }]);
  });
  // 42 ft out from the middle of a side: inside the curve drawn, beyond the corners' square
  const top = (y: number) => page.evaluate(y => (window as any).__dgView.canopyAt({ x: 500, y }, 4)?.top ?? null, y);
  await expect.poll(() => top(258)).toBeGreaterThan(50);
  expect(await top(200)).toBeNull();
});

plain("the flight round the trees standing there: at its height through woods, aside round a pine on the line, a little under a low crown, over a wall it can't get round, from past trees behind the tee (pure logic)", () => {
  const line = [{ x: 0, y: 0 }, { x: 600, y: 0 }];
  const flat = () => 0;
  type C = { x: number; y: number; r: number; base: number; top: number };
  const standing = (crowns: C[]) => (p: { x: number; y: number }, reach: number) => {
    const near = crowns.filter(c => Math.hypot(c.x - p.x, c.y - p.y) < reach + c.r);
    const trunks = crowns.filter(c => Math.hypot(c.x - p.x, c.y - p.y) < reach + 8).map(c => ({ x: c.x, y: c.y }));
    if (!near.length && !trunks.length) return null;
    return { base: Math.min(...near.map(c => c.base)), top: Math.max(-Infinity, ...near.map(c => c.top)), trunks, crowns: near };
  };
  // Woods on both sides of a 70 ft fairway: broadleaf crowns and pines down to the ground
  const woods: C[] = [];
  for (let x = 0; x <= 600; x += 22) for (const side of [-1, 1]) {
    woods.push({ x, y: side * 48, r: 18, base: 15, top: 55 });
    woods.push({ x: x + 11, y: side * 40, r: 8, base: 4, top: 45 });
  }
  const through = autoFlight(line, FLYOVER_DEFAULTS, flat, standing(woods))!;
  for (const c of through.cam) plainExpect(Math.abs(c.z - 10)).toBeLessThan(0.5);
  // A pine on the line: round it at its height, never more than 15 ft aside
  const pine = { x: 300, y: 0, r: 8, base: 3, top: 45 };
  const round = autoFlight(line, FLYOVER_DEFAULTS, flat, standing([pine]))!;
  for (const c of round.cam) {
    plainExpect(Math.abs(c.z - 10)).toBeLessThan(0.5);
    plainExpect(Math.hypot(c.x - 300, c.y)).toBeGreaterThanOrEqual(pine.r + 4);
    plainExpect(Math.abs(c.y)).toBeLessThanOrEqual(15.01);
  }
  // A broad crown hanging low over the line: just under its leaves, then back to its height
  const low = autoFlight(line, FLYOVER_DEFAULTS, flat, standing([{ x: 200, y: 0, r: 20, base: 13, top: 60 }]))!;
  const by = (f: typeof low, x: number) => f.cam.reduce((a, c) => (Math.abs(c.x - x) < Math.abs(a.x - x) ? c : a));
  plainExpect(by(low, 200).z).toBeLessThanOrEqual(8 + 1e-6);
  plainExpect(Math.abs(by(low, 270).z - 10)).toBeLessThan(0.3);
  // A wall of pines across the line, wider than it can go round: over it, and down again after
  const wall: C[] = [];
  for (let y = -80; y <= 80; y += 12) wall.push({ x: 400, y, r: 8, base: 3, top: 40 });
  const over = autoFlight(line, FLYOVER_DEFAULTS, flat, standing(wall))!;
  plainExpect(by(over, 400).z).toBeGreaterThanOrEqual(48 - 1e-6);
  plainExpect(Math.abs(by(over, 100).z - 10)).toBeLessThan(0.3);
  plainExpect(Math.abs(over.cam[over.cam.length - 1].z - 10)).toBeLessThan(0.3);
  // Pines just behind the tee: it starts past them, at its height
  const behind = autoFlight(line, FLYOVER_DEFAULTS, flat, standing([{ x: -40, y: 0, r: 8, base: 3, top: 40 }, { x: -40, y: 14, r: 8, base: 3, top: 40 }, { x: -40, y: -14, r: 8, base: 3, top: 40 }]))!;
  plainExpect(behind.cam[0].x).toBeGreaterThan(-40 + 8);
  plainExpect(Math.abs(behind.cam[0].z - 10)).toBeLessThan(0.3);
});

plain("a flight through keyframes keeps their height over the ground between them, and clear of the trees (pure logic)", () => {
  const bumpy = (x: number) => 100 + 8 * Math.sin(x / 20);
  const keys = [{ x: 0, y: 0, alt: 10, lookX: 100, lookY: 0 }, { x: 200, y: 0, alt: 10, lookX: 300, lookY: 0 }, { x: 400, y: 0, alt: 10, lookX: 500, lookY: 0 }];
  const f = keyFlight(keys, FLYOVER_DEFAULTS, x => bumpy(x))!;
  for (const c of f.cam) plainExpect(Math.abs(c.z - bumpy(c.x) - 10)).toBeLessThan(2);
  // A wall of low trees between two keyframes: over it
  const wall = (p: { x: number; y: number }, reach: number) => (Math.abs(p.x - 300) < reach + 8 ? { base: 103, top: 140, trunks: [] } : null);
  const g = keyFlight(keys, FLYOVER_DEFAULTS, x => bumpy(x), wall)!;
  const at300 = g.cam.reduce((a, c) => (Math.abs(c.x - 300) < Math.abs(a.x - 300) ? c : a));
  plainExpect(at300.z).toBeGreaterThanOrEqual(148 - 1e-6);
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
  // At the flyover's height, but over woods (no room under them) and under a tall tree's crown
  const woods = (p: { x: number }) => (p.x > 180 ? { base: 0, top: 45, trunks: [] } : p.x < 20 ? { base: 40, top: 70, trunks: [] } : null);
  const level = keysFromFlight(f, flat, 3, 10, woods);
  plainExpect(level.map(k => k.alt)).toEqual([10, 10, 45 + 5 + 3]);
  const low = keysFromFlight(f, flat, 3, 38, woods);
  plainExpect(low.map(k => k.alt)).toEqual([35, 38, 53]);
});
