// Phones and tablets: the step bar, the bottom sheet (peek, half, full), tools by tap with Undo,
// Cancel and Done, the selection in the sheet, long-press menus, the Design preview fitted to the
// screen, the tee view, a phone on its side, a tablet, and the desktop layout left as it was.
import { test, expect, course, editorState, tapPlan, longPress, touchDrag, pinch, screenOf } from "./fixtures";
import { devices, type Page } from "@playwright/test";
import { writeFileSync } from "fs";
import { createBasket, createEmptyCourse, createTee, newHole } from "../../src/lib/course";

/** A Playwright device in Chromium (the device list's iPhones and iPads say WebKit). */
const device = (name: string) => {
  const { defaultBrowserType: _browser, ...d } = devices[name];
  return d;
};
const nav = (page: Page) => page.getByRole("navigation", { name: "Steps" });
const sheet = (page: Page) => page.getByTestId("sheet");
const detent = (page: Page) => sheet(page).getAttribute("data-detent");
/** Settles after a sheet move (its slide takes 0.3 s). */
const settle = (page: Page) => page.waitForTimeout(450);

/** Starts on open ground, with the Hole tool. */
async function openGround(page: Page) {
  await page.getByTestId("welcome-blank").click();
  await expect.poll(async () => (await editorState(page)).tool).toBe("add-hole");
}

/** A hole from (300, 500) to (600, 500), made directly; back to the Select tool, nothing selected. */
async function oneHole(page: Page) {
  await openGround(page);
  await page.evaluate(() => {
    (window as any).__dgActions.addHole({ x: 300, y: 500 }, { x: 600, y: 500 }, "blue");
    (window as any).__dgActions.select(null);
    (window as any).__dgEditor().set({ tool: "select" });
  });
  // (Once the panels have their size: the map's size follows them)
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).__dgView.fitCourse(false));
  await page.waitForTimeout(300);
}

test.describe("phone", () => {
  test.use(device("iPhone 13"));

  test("a hole picked: the strip under the map, its dial widening the fairway live (one undo step); holding open ground offers a tee, a bend, a new hole", async ({ page }) => {
    await oneHole(page);
    const hole = (await course(page)).holes[0];
    await page.evaluate(id => (window as any).__dgActions.select(id), hole.id);
    await expect(page.getByTestId("hole-strip")).toBeVisible();
    await settle(page);
    expect(await detent(page)).toBe("peek");
    // (the tools make way for it)
    await expect(page.getByTestId("tool-strip")).toHaveCount(0);
    // The hole in the map above the sheet
    const sheetTop = (await sheet(page).boundingBox())!.y;
    const mid = await screenOf(page, 450, 500);
    expect(mid.y).toBeLessThan(sheetTop);
    // Fairway: the dial dragged left widens it as it goes, one undo step in all
    await page.getByTestId("strip-fairway").tap();
    const dial = page.getByTestId("dial");
    const w0 = (await course(page)).holes[0].fairwayWidth;
    const past0 = await page.evaluate(() => (window as any).__dgHistory().past);
    const b = (await dial.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 90, b.y + b.height / 2, { steps: 6 });
    await expect.poll(async () => (await course(page)).holes[0].fairwayWidth).toBe(w0 + 10);
    await page.mouse.up();
    expect(await page.evaluate(() => (window as any).__dgHistory().past)).toBe(past0 + 1);
    // Par: the choices in its place
    await page.getByTestId("strip-par").tap();
    await page.getByTestId("hole-strip").getByRole("radio", { name: "4" }).tap();
    await expect.poll(async () => (await course(page)).holes[0].par).toBe(4);
    // Holding open ground beside the hole: a tee there, a bend
    // (open ground a little above the hole on screen, clear of its fairway)
    const m = await screenOf(page, 450, 500);
    const g = { x: m.x, y: m.y - 70 };
    await longPress(page, g);
    await expect(page.getByTestId("map-menu-here")).toBeVisible();
    await page.getByRole("menuitem", { name: "Bend the hole here" }).tap();
    await expect.poll(async () => (await course(page)).holes[0].doglegs.length).toBe(1);
    const m2 = await screenOf(page, 330, 500);
    await longPress(page, { x: m2.x, y: m2.y - 70 });
    await page.getByRole("menuitem", { name: "Add a tee here" }).tap();
    await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "tee").length).toBe(2);
  });

  test("where you are: the blue dot follows you, and a new hole's tee and basket go where you stand", async ({ page, context }) => {
    await openGround(page);
    // (the site placed on the earth; the phone's GPS at plan spots)
    const bounds = { north: 40, south: 39.99, west: -90, east: -89.99 };
    await page.evaluate(b => (window as any).__dgActions.site({ bounds: b }), bounds);
    const { width, height } = (await course(page)).canvas;
    const geo = (x: number, y: number) => ({ latitude: bounds.north - (y / height) * (bounds.north - bounds.south), longitude: bounds.west + (x / width) * (bounds.east - bounds.west), accuracy: 2 });
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(geo(300, 500));
    await page.getByTestId("locate-me").tap();
    await expect(page.getByTestId("my-location")).toBeVisible();
    // (followed: the dot in the map's middle, about)
    const box = (await page.getByTestId("my-location").boundingBox())!;
    const vp = page.viewportSize()!;
    expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(vp.width * 0.25);
    // The Hole tool offers your spot; the tee there, then walk to the basket
    await expect(page.getByTestId("here-bar")).toContainText("Tee here");
    await page.getByTestId("here-button").tap();
    await expect.poll(() => page.evaluate(() => (window as any).__dgEditor().drawPoints)).toBe(1);
    await context.setGeolocation(geo(600, 500));
    await expect(page.getByTestId("draw-bar")).toContainText("Basket here");
    // (once the dot has come to the new spot)
    await expect.poll(async () => {
      const d = (await page.getByTestId("my-location").boundingBox())!, s = await screenOf(page, 600, 500);
      return Math.hypot(d.x + d.width / 2 - s.x, d.y + d.height / 2 - s.y);
    }).toBeLessThan(20);
    await page.getByTestId("here-button").tap();
    await expect.poll(async () => (await course(page)).holes.length).toBe(1);
    const d = await course(page);
    const tee = d.items.find((i: any) => i.type === "tee"), basket = d.items.find((i: any) => i.type === "basket");
    expect(Math.hypot(tee.x - 300, tee.y - 500)).toBeLessThan(6);
    expect(Math.hypot(basket.x - 600, basket.y - 500)).toBeLessThan(6);
    // How far to the basket, under the dot
    await expect(page.getByTestId("my-location-tag")).toContainText("to the basket");
    // Off again: no dot, no offer
    await page.evaluate(() => (window as any).__dgEditor().set({ tool: "add-hole" }));
    await page.getByTestId("locate-me").tap();
    await expect(page.getByTestId("my-location")).toHaveCount(0);
    await expect(page.getByTestId("here-bar")).toHaveCount(0);
  });

  test("a course file opens from the menu (which closes while the file is picked)", async ({ page }) => {
    await openGround(page);
    const doc = createEmptyCourse();
    doc.name = "Pocket Course";
    const h = newHole();
    doc.holes.push(h);
    doc.items.push(createTee(h.id, { x: 300, y: 500 }), createBasket(h.id, { x: 600, y: 500 }));
    const path = test.info().outputPath("pocket.dgcourse.json");
    writeFileSync(path, JSON.stringify(doc));
    await page.getByTestId("app-menu-button").tap();
    const choosing = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: /Open a course file/ }).tap();
    const chooser = await choosing;
    await expect(page.getByTestId("app-menu")).toHaveCount(0);
    await chooser.setFiles(path);
    await expect.poll(async () => (await course(page)).name).toBe("Pocket Course");
    expect((await course(page)).holes).toHaveLength(1);
  });

  test("the map's buttons all sit above the panel; the compass shows once the map is turned", async ({ page }) => {
    await oneHole(page);
    const above = async () => {
      await settle(page);
      const top = (await sheet(page).boundingBox())!.y;
      const buttons = page.getByTestId("map-controls").locator("button");
      const n = await buttons.count();
      expect(n).toBeGreaterThan(1);
      for (let i = 0; i < n; i++) {
        const b = (await buttons.nth(i).boundingBox())!;
        expect(b.y + b.height).toBeLessThanOrEqual(top);
      }
    };
    await above();
    await expect(page.getByLabel("Show the whole course")).toBeVisible();
    await expect(page.getByTestId("compass")).toHaveCount(0);
    await page.evaluate(() => (window as any).__dgView.rotateBy(30));
    await expect(page.getByTestId("compass")).toBeVisible();
    await above();
    // (with the panel lower, more of them)
    await nav(page).getByRole("button", { name: /Design/ }).tap();
    await above();
  });

  test("a selected hole's header steps to the next and previous hole", async ({ page }) => {
    await oneHole(page);
    await page.evaluate(() => (window as any).__dgActions.addHole({ x: 300, y: 700 }, { x: 600, y: 700 }, "blue"));
    await page.evaluate(() => (window as any).__dgActions.select((window as any).__dgCourse().holes[0].id));
    await expect(page.getByTestId("sheet-title")).toHaveText("Hole 1");
    await page.getByTestId("selection-header").getByTestId("hole-next").tap();
    await expect(page.getByTestId("sheet-title")).toHaveText("Hole 2");
    const next = (await page.getByTestId("selection-header").getByTestId("hole-next").boundingBox())!;
    expect(next.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId("selection-header").getByTestId("hole-prev").tap();
    await expect(page.getByTestId("sheet-title")).toHaveText("Hole 1");
  });

  test("the step bar switches steps and the sheet shows each one; no desktop panels", async ({ page }) => {
    await expect(page.getByTestId("side-panel")).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);
    // (A course with a hole: an empty one shows the welcome card on the Site step instead)
    await oneHole(page);
    const titles: Record<string, string> = { Site: "Your site", Design: "Design", Map: "Map", Export: "Export" };
    for (const [label, title] of Object.entries(titles)) {
      await nav(page).getByRole("button", { name: new RegExp(label) }).tap();
      await expect.poll(async () => (await editorState(page)).step).toBe(label.toLowerCase());
      await expect(page.getByTestId("sheet-title")).toHaveText(title);
      await expect(nav(page).getByRole("button", { name: new RegExp(label) })).toHaveAttribute("aria-current", "step");
    }
    // Tapping the step that is open shows more of its panel, and tapping again less
    await nav(page).getByRole("button", { name: /Design/ }).tap();
    await settle(page);
    expect(await detent(page)).toBe("peek");
    await nav(page).getByRole("button", { name: /Design/ }).tap();
    await expect.poll(() => detent(page)).toBe("half");
    await nav(page).getByRole("button", { name: /Design/ }).tap();
    await expect.poll(() => detent(page)).toBe("peek");
  });

  test("finding the park on a phone: search on top, the map, then the button at the bottom", async ({ page }) => {
    await page.getByTestId("welcome-find").tap();
    const dialog = page.getByRole("dialog", { name: "Find your course site" });
    await page.getByLabel("Search address").fill("Springfield Park");
    await dialog.getByRole("button", { name: /Springfield Park/ }).first().tap();
    await expect(page.getByTestId("site-size")).toBeVisible();
    // A picked place closes the suggestions (they used to open again for the place's own name)
    await page.waitForTimeout(600);
    await expect(dialog.getByRole("button", { name: /Springfield Park/ })).toHaveCount(0);
    const search = (await page.getByLabel("Search address").boundingBox())!;
    const go = (await page.getByTestId("import-site").boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(search.y).toBeLessThan(vh * 0.25);
    expect(go.y + go.height).toBeGreaterThan(vh * 0.85);
    await page.getByTestId("import-site").tap();
    await expect.poll(async () => (await course(page)).background, { timeout: 60_000 }).not.toBeNull();
    await expect.poll(async () => (await editorState(page)).step).toBe("design");
    // (the pointer first: a look round before the first hole)
    await expect.poll(async () => (await editorState(page)).tool).toBe("select");
  });

  test("the sheet rests at peek, half and full: drag it, tap its handle, or use the arrow keys", async ({ page }) => {
    await oneHole(page);
    const handle = page.getByTestId("sheet-handle");
    expect(await detent(page)).toBe("peek");
    const top = async () => (await sheet(page).boundingBox())!.y;
    const visible = async () => (await page.getByTestId("bottom-nav").boundingBox())!.y - (await top());
    const peekH = await visible();
    // Tap: peek, half, full, and round again
    await handle.tap();
    await settle(page);
    expect(await detent(page)).toBe("half");
    const halfH = await visible();
    expect(halfH).toBeGreaterThan(peekH + 100);
    await handle.tap();
    await settle(page);
    expect(await detent(page)).toBe("full");
    // At full height a strip of the map (and the top bar) stays in view
    const bar = (await page.getByTestId("top-bar").boundingBox())!;
    expect(await top()).toBeGreaterThanOrEqual(bar.y + bar.height - 4);
    await handle.tap();
    await settle(page);
    expect(await detent(page)).toBe("peek");
    // Drag the handle up: it follows the finger, then rests at the nearest height
    let h = (await handle.boundingBox())!;
    await touchDrag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: h.x + h.width / 2, y: h.y - halfH + peekH }, 16);
    await settle(page);
    expect(await detent(page)).toBe("half");
    // ...and down again
    h = (await handle.boundingBox())!;
    await touchDrag(page, { x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: h.x + h.width / 2, y: h.y + 260 }, 16);
    await settle(page);
    expect(await detent(page)).toBe("peek");
    // The keyboard: the handle is a button that takes the arrow keys, and says what it does
    await handle.focus();
    await expect(handle).toHaveAttribute("aria-label", /Panel: small/);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => detent(page)).toBe("half");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => detent(page)).toBe("full");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => detent(page)).toBe("peek");
    // The list itself: pulled up while the sheet isn't at full height, it brings the sheet up;
    // pulled down from its top, it lets the sheet down
    await handle.tap();
    await settle(page);
    const list = (await page.getByTestId("sheet-body").boundingBox())!;
    const at = { x: list.x + list.width / 2, y: list.y + 40 };
    await touchDrag(page, at, { x: at.x, y: at.y - 200 }, 16);
    await settle(page);
    expect(await detent(page)).toBe("full");
    const list2 = (await page.getByTestId("sheet-body").boundingBox())!;
    const at2 = { x: list2.x + list2.width / 2, y: list2.y + 40 };
    await touchDrag(page, at2, { x: at2.x, y: at2.y + 200 }, 16);
    await settle(page);
    expect(await detent(page)).toBe("half");
  });

  test("a hole laid out with two taps: the tee, then the basket", async ({ page }) => {
    await openGround(page);
    await expect(page.getByTestId("tool-hint")).toContainText("Tap where the tee goes");
    await tapPlan(page, 300, 500);
    await expect(page.getByTestId("draw-bar")).toContainText("Now tap the basket spot");
    await tapPlan(page, 650, 500);
    await expect.poll(async () => (await course(page)).holes.length).toBe(1);
    const doc = await course(page);
    const tee = doc.items.find((i: any) => i.type === "tee");
    const basket = doc.items.find((i: any) => i.type === "basket");
    expect(Math.abs(basket.x - tee.x - 350)).toBeLessThan(6);
    expect(Math.abs(basket.y - tee.y)).toBeLessThan(6);
    await expect(page.getByTestId("draw-bar")).toHaveCount(0);
    // The tool stays on for the next hole; X goes back to Select
    expect((await editorState(page)).tool).toBe("add-hole");
    await page.getByTestId("tool-close").tap();
    expect((await editorState(page)).tool).toBe("select");
  });

  test("an area drawn with taps: Undo takes a point back, Done finishes it", async ({ page }) => {
    await oneHole(page);
    await nav(page).getByRole("button", { name: /Design/ }).tap();
    await page.locator('[data-tool="draw-area"]').tap();
    await page.getByTestId("area-kind-ob").tap();
    await expect(page.getByTestId("tool-hint")).toContainText("Tap the corners, then Done");
    for (const [x, y] of [[350, 300], [550, 300], [550, 420], [350, 420]]) await tapPlan(page, x, y);
    const done = page.getByTestId("draw-done");
    await expect(done).toContainText("4");
    await page.getByTestId("draw-undo").tap();
    await expect(done).toContainText("3");
    await done.tap();
    await expect.poll(async () => (await course(page)).items.filter((i: any) => i.type === "area").length).toBe(1);
    const area = (await course(page)).items.find((i: any) => i.type === "area");
    expect(area.kind).toBe("ob");
    expect(area.points.length).toBe(3);
    expect((await editorState(page)).tool).toBe("select");
    // Cancel drops what is being drawn
    await page.locator('[data-tool="draw-line"]').tap();
    await tapPlan(page, 300, 650);
    await tapPlan(page, 600, 650);
    await page.getByTestId("draw-cancel").tap();
    await expect(page.getByTestId("draw-bar")).toHaveCount(0);
    expect((await course(page)).items.filter((i: any) => i.type === "line").length).toBe(0);
  });

  test("the app never scrolls as a whole when something low in the sheet is brought into view", async ({ page }) => {
    // (on the Design step, its sheet peeking)
    await oneHole(page);
    await settle(page);
    expect(await detent(page)).toBe("peek");
    const before = (await page.getByTestId("plan").boundingBox())!;
    // The sheet's last button is below the screen while the sheet peeks; a keyboard, a screen
    // reader or find in page brings it into view like this (it once scrolled the whole app up,
    // map, sheet and step bar, with no way back)
    const below = await sheet(page).evaluate(el => {
      const b = [...el.querySelectorAll("button")].pop()!;
      const top = b.getBoundingClientRect().top;
      b.scrollIntoView();
      b.focus();
      return top - innerHeight;
    });
    expect(below).toBeGreaterThan(0);
    await page.waitForTimeout(100);
    expect(await page.locator('[data-layout="phone"]').evaluate(el => el.scrollTop)).toBe(0);
    expect((await page.getByTestId("plan").boundingBox())!.y).toBe(before.y);
    await expect(nav(page)).toBeInViewport({ ratio: 1 });
  });

  test("tapping a hole puts its inspector in the sheet; Back returns to the step", async ({ page }) => {
    await oneHole(page);
    await tapPlan(page, 450, 500);
    await expect(page.getByTestId("inspector")).toBeVisible();
    await expect(page.getByTestId("sheet-title")).toHaveText("Hole 1");
    await expect(page.getByTestId("selection-header")).toContainText("Par 3");
    // (Screen readers hear it: the panel changes without the focus moving)
    await expect(page.getByTestId("announce")).toHaveText("Hole 1 selected");
    // More of it when the sheet is pulled up: par, fairway, notes
    await page.getByTestId("sheet-handle").tap();
    await settle(page);
    await expect(page.getByRole("radiogroup", { name: "Par" })).toBeVisible();
    await page.getByRole("radiogroup", { name: "Par" }).getByRole("radio", { name: "4" }).tap();
    await expect.poll(async () => (await course(page)).holes[0].par).toBe(4);
    await page.getByTestId("selection-back").tap();
    await expect.poll(async () => (await editorState(page)).selectedId).toBeNull();
    await expect(page.getByTestId("sheet-title")).toHaveText("Design");
  });

  test("holding a finger on a tee opens its menu (the right-click); Delete there, and Undo", async ({ page }) => {
    await oneHole(page);
    const doc = await course(page);
    const tee = doc.items.find((i: any) => i.type === "tee");
    await longPress(page, await screenOf(page, tee.x, tee.y, 1));
    const menu = page.getByTestId("item-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Blue tee");
    await expect(menu.getByRole("menuitem", { name: "View from the tee" })).toBeVisible();
    // The finger's lift doesn't pick anything in it, and Cancel closes it
    await page.waitForTimeout(200);
    await expect(menu).toBeVisible();
    await page.getByTestId("action-sheet-cancel").tap();
    await expect(menu).toHaveCount(0);
    await longPress(page, await screenOf(page, tee.x, tee.y, 1));
    await page.getByTestId("menu-delete").tap();
    await expect.poll(async () => (await course(page)).items.some((i: any) => i.type === "tee")).toBe(false);
    await page.getByTestId("tool-strip").getByRole("button", { name: "Undo" }).tap();
    await expect.poll(async () => (await course(page)).items.some((i: any) => i.type === "tee")).toBe(true);
    // A short press is a tap: no menu
    await tapPlan(page, 450, 500);
    await page.waitForTimeout(700);
    await expect(menu).toHaveCount(0);
  });

  test("a selected hole's width squares stand clear of its tee: holding the tee still opens its menu", async ({ page }) => {
    await oneHole(page);
    // The hole selected and seen from far, short on the screen (a square once sat on the tee and
    // took its long-press)
    await page.evaluate(() => (window as any).__dgActions.select((window as any).__dgCourse().holes[0].id));
    await page.evaluate(() => (window as any).__dgView.zoomBy(1 / 2.5));
    await page.waitForTimeout(800);
    const tee = (await course(page)).items.find((i: any) => i.type === "tee");
    const at = await screenOf(page, tee.x, tee.y, 1);
    const centers = await page.locator('[data-handle="width"]:visible').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
    for (const c of centers) expect(Math.hypot(c.x - at.x, c.y - at.y)).toBeGreaterThanOrEqual(40);
    await longPress(page, at);
    const menu = page.getByTestId("item-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Blue tee");
    await page.getByTestId("action-sheet-cancel").tap();
    // At any zoom, no square on the tee, the basket or the hole's distance label; zoomed in on
    // the hole, all four are there
    const basket = (await course(page)).items.find((i: any) => i.type === "basket");
    for (const zoom of [0.5, 0.7, 1, 1.4, 2.5]) {
      // (At once, not animated: the squares and the label are checked where they come to rest;
      // zoomed in on the hole's middle, in the map's room above the sheet)
      await page.evaluate(z => {
        const v = (window as any).__dgView, id = (window as any).__dgCourse().holes[0].id;
        const b = v.itemBounds(id), cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
        const hw = Math.max(b.maxX - b.minX, 160) * 0.6 / z, hh = Math.max(b.maxY - b.minY, 96) * 0.6 / z;
        v.fitBounds({ minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh }, { margin: 1.15, animate: false });
      }, zoom);
      await page.waitForTimeout(400);
      const ends = [await screenOf(page, tee.x, tee.y, 1), await screenOf(page, basket.x, basket.y, 1)];
      const label = await page.getByTestId("hole-distance").evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent).map(e => e.getBoundingClientRect().toJSON()));
      const squares = await page.locator('[data-handle="width"]:visible').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
      for (const c of squares) {
        for (const e of ends) expect(Math.hypot(c.x - e.x, c.y - e.y), `zoom ${zoom}`).toBeGreaterThanOrEqual(40);
        for (const r of label) expect(c.x > r.left - 4 && c.x < r.right + 4 && c.y > r.top - 4 && c.y < r.bottom + 4, `zoom ${zoom}: a square on the label`).toBe(false);
      }
      // (a square on each edge at each of the four points along the hole)
      if (zoom === 2.5) expect(squares.length).toBe(8);
    }
  });

  test("two fingers pinch the map; they place nothing, even with the Hole tool", async ({ page }) => {
    await openGround(page);
    const scale = () => page.evaluate(() => (window as any).__dgView.viewInfo().pxPerUnit);
    const before = await scale();
    const box = (await page.getByTestId("plan").boundingBox())!;
    await pinch(page, { x: box.x + box.width / 2, y: box.y + box.height * 0.35 }, 80, 240);
    await expect.poll(scale).toBeGreaterThan(before * 1.4);
    await page.waitForTimeout(300);
    expect((await course(page)).holes.length).toBe(0);
    await expect(page.getByTestId("draw-bar")).toHaveCount(0);
    // The + and − buttons do it with one finger
    const now = await scale();
    await page.getByRole("button", { name: "Zoom out" }).tap();
    await expect.poll(scale).toBeLessThan(now * 0.85);
  });

  test("the Map step's preview fits the phone's width (its five tabs too, whole); pinch and the buttons zoom it", async ({ page }) => {
    await oneHole(page);
    await nav(page).getByRole("button", { name: /Map/ }).tap();
    const pageBox = async () => (await page.getByTestId("design-page").boundingBox())!;
    await expect(page.getByTestId("design-page")).toBeVisible();
    const vw = page.viewportSize()!.width;
    const tabs = page.getByRole("tablist").first().getByRole("tab");
    await expect(tabs).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const t = (await tabs.nth(i).boundingBox())!;
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(vw);
      expect(await tabs.nth(i).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    const b = await pageBox();
    expect(b.width).toBeGreaterThan(vw - 40);
    expect(b.width).toBeLessThanOrEqual(vw);
    expect(b.x).toBeGreaterThanOrEqual(0);
    const zoom = async () => parseInt((await page.getByTestId("design-zoom").textContent()) ?? "0", 10);
    const fit = await zoom();
    await pinch(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 60, 180);
    await expect.poll(zoom).toBeGreaterThan(fit * 1.8);
    await page.getByRole("button", { name: "Fit the page" }).tap();
    await expect.poll(zoom).toBe(fit);
    await page.getByRole("button", { name: "Zoom in" }).tap();
    await expect.poll(zoom).toBeGreaterThan(fit);
  });

  test("a pinch on the Map step's preview while the map paints still ends (the painting goes in once the fingers lift)", async ({ page }) => {
    await oneHole(page);
    await nav(page).getByRole("button", { name: /Map/ }).tap();
    await expect(page.getByTestId("design-page")).toBeVisible();
    const painting = () => page.evaluate(() => (window as any).__dgPainting());
    const zoom = async () => parseInt((await page.getByTestId("design-zoom").textContent()) ?? "0", 10);
    const fit = await zoom();
    const b = (await page.getByTestId("design-page").boundingBox())!;
    const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const fingers = (gap: number) => [{ x: at.x - gap / 2, y: at.y, id: 0 }, { x: at.x + gap / 2, y: at.y, id: 1 }];
    const cdp = await page.context().newCDPSession(page);
    // Two fingers down while it paints; the painting done while they rest; then the pinch
    expect(await painting()).toBe(true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(60) });
    await expect.poll(painting, { timeout: 60_000 }).toBe(false);
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(60 + 12 * i) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect.poll(zoom).toBeGreaterThan(fit * 1.8);
    // (and the new painting is shown then)
    await expect(page.getByTestId("design-page").locator("image").first()).toBeAttached();
  });

  test("the view from the tee on a phone: the hole's card, big buttons along the bottom, back to the map", async ({ page }) => {
    await oneHole(page);
    await tapPlan(page, 450, 500);
    await page.getByRole("button", { name: "View from the tee" }).tap();
    await expect(page.getByTestId("tee-view-hud")).toBeVisible();
    await expect(page.getByTestId("tee-view-hud")).toContainText("Par 3");
    // Immersive: no step bar or sheet
    await expect(page.getByTestId("bottom-nav")).toHaveCount(0);
    await expect(sheet(page)).toHaveCount(0);
    const close = (await page.getByTestId("hud-close").boundingBox())!;
    expect(close.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId("hud-close").tap();
    await expect.poll(async () => (await editorState(page)).teeView).toBeNull();
    await expect(page.getByTestId("bottom-nav")).toBeVisible();
  });

  test("touch targets: the step bar, tools and map buttons are at least 44 px", async ({ page }) => {
    await openGround(page);
    const small: string[] = [];
    for (const loc of [nav(page).getByRole("button"), page.getByTestId("tool-strip").getByRole("button"), page.getByTestId("map-controls").getByRole("button"), page.getByTestId("top-bar").getByRole("button"), page.getByTestId("top-bar").getByRole("radio")]) {
      for (const b of await loc.all()) {
        const box = (await b.boundingBox())!;
        if (box.height < 40 || box.width < 40) small.push(`${await b.getAttribute("aria-label") ?? await b.textContent()}: ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
    }
    expect(small).toEqual([]);
  });
});

test.describe("phone on its side", () => {
  test.use(device("iPhone 13 landscape"));

  test("a rail of steps on the left, the panel beside it (it folds away), the map on the right", async ({ page }) => {
    await oneHole(page);
    await expect(page.getByTestId("nav-rail")).toBeVisible();
    await expect(page.getByTestId("bottom-nav")).toHaveCount(0);
    const side = page.getByTestId("side-sheet");
    await expect(side).toBeVisible();
    await nav(page).getByRole("button", { name: /Export/ }).tap();
    await expect(side.getByTestId("sheet-title")).toHaveText("Export");
    const mapW = async () => (await page.getByTestId("plan").boundingBox())!.width;
    const w = await mapW();
    await page.getByTestId("panel-toggle").tap();
    await expect(side).toHaveCount(0);
    await expect.poll(mapW).toBeGreaterThan(w + 200);
    // A step brings the panel back
    await nav(page).getByRole("button", { name: /Design/ }).tap();
    await expect(side).toBeVisible();
    // (the map back at its width before the hole is tapped where it shows)
    await expect.poll(mapW).toBeLessThan(w + 2);
    await page.waitForTimeout(300);
    await tapPlan(page, 450, 500);
    await expect(side.getByTestId("inspector")).toBeVisible();
  });
});

test.describe("tablet held upright", () => {
  test.use(device("iPad Pro 11"));

  test("the rail and the panel beside the map, with touch-sized tools", async ({ page }) => {
    await oneHole(page);
    await expect(page.getByTestId("nav-rail")).toBeVisible();
    await expect(page.getByTestId("side-sheet")).toBeVisible();
    await expect(page.getByTestId("side-panel")).toHaveCount(0);
    const tool = (await page.locator('[data-tool="add-hole"]').boundingBox())!;
    expect(tool.height).toBeGreaterThanOrEqual(44);
    await page.locator('[data-tool="add-hole"]').tap();
    await tapPlan(page, 300, 800);
    await tapPlan(page, 600, 800);
    await expect.poll(async () => (await course(page)).holes.length).toBe(2);
  });
});

test.describe("tablet on its side", () => {
  test.use(device("iPad Pro 11 landscape"));

  test("a tablet on its side keeps the desktop layout; the top bar and tools fit on screen", async ({ page }) => {
    await oneHole(page);
    await expect(page.getByTestId("holes-column")).toBeVisible();
    await expect(page.getByRole("button", { name: "2 Design" })).toBeVisible();
    await expect(page.getByTestId("bottom-nav")).toHaveCount(0);
    const vw = page.viewportSize()!.width;
    const tools = (await page.getByRole("toolbar", { name: "Tools" }).boundingBox())!;
    expect(tools.x).toBeGreaterThanOrEqual(0);
    expect(tools.x + tools.width).toBeLessThanOrEqual(vw);
    // Nothing in the top bar runs off the screen
    for (const b of await page.locator("header button, header input").all()) {
      const box = await b.boundingBox();
      if (box) expect(box.x + box.width).toBeLessThanOrEqual(vw + 0.5);
    }
    await tapPlan(page, 450, 500);
    await expect(page.getByTestId("inspector")).toBeVisible();
  });
});

test("desktop at 1600 × 1000 keeps its layout: top bar steps, side panel, tool bar, no phone parts", async ({ page }) => {
  await oneHole(page);
  const header = (await page.locator("header").boundingBox())!;
  expect(header.height).toBe(50);
  // (the Site step's panel; Design has the holes down the map's side instead)
  await page.getByRole("button", { name: "1 Site" }).click();
  const side = (await page.getByTestId("side-panel").boundingBox())!;
  expect(side.width).toBe(340);
  // (the bar and the panel float, 10 px from the edges and from each other)
  expect(side.y).toBe(70);
  await page.getByRole("button", { name: "2 Design" }).click();
  await expect(page.getByTestId("holes-column")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();
  // (no prompt over the map with Select; a tool's own prompt when one is picked)
  await expect(page.getByTestId("tool-hint")).toHaveCount(0);
  await page.keyboard.press("t");
  await expect(page.getByTestId("tool-hint")).toContainText("another tee");
  await page.keyboard.press("Escape");
  for (const id of ["bottom-nav", "sheet", "nav-rail", "side-sheet", "top-bar", "draw-bar"]) await expect(page.getByTestId(id)).toHaveCount(0);
  // The selection's inspector floats on the right of the map
  await page.getByTestId("hole-row").click();
  const insp = (await page.getByTestId("inspector").boundingBox())!;
  expect(insp.width).toBe(300);
  expect(Math.round(insp.x + insp.width)).toBe(1600 - 10 - 150);
});
