import { test as plain, expect as plainExpect } from "@playwright/test";
import { test, expect, addHole, blankCourse, course } from "./fixtures";
import { createArea, createBasket, createEmptyCourse, createLine, createTee, newHole, normalizeCourse } from "../../src/lib/course";
import { meander } from "../../src/lib/forest";
import { dist, distanceToPath } from "../../src/lib/geom";
import { BASKET_MARKS, basketMark, bestRotation, renderPoster } from "../../src/lib/mapSvg";
import { renderScorecard, renderTeeSign } from "../../src/lib/teeSign";

test("the Design step shows the printed map, and each style changes it", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await addHole(page, { x: 700, y: 650 }, { x: 700, y: 300 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  const pageSvg = page.getByTestId("design-page");
  await expect(pageSvg.locator("svg")).toBeVisible();
  // Forest is the default: the title over the map, the layout's par and length on a chip
  await expect(pageSvg).toContainText("DISC GOLF COURSE");
  await expect(pageSvg).toContainText(/PAR 6 \| 700'/);
  await expect(pageSvg.locator("image").first()).toBeVisible();
  // Illustrated: a hole table and a legend
  await page.getByTestId("theme-illustrated").click();
  await expect.poll(async () => (await course(page)).style.theme).toBe("illustrated");
  await expect(pageSvg).toContainText("LEGEND");
  await expect(pageSvg).toContainText("TOTAL");
  await expect(pageSvg).toContainText("Throw line");
  // Title, colors and toggles go straight onto the map
  await page.getByLabel("Map title").fill("Ridge Run");
  await expect(pageSvg).toContainText("RIDGE RUN");
  await page.getByText("Legend", { exact: true }).click();
  await expect(pageSvg).not.toContainText("LEGEND");
  await page.getByText("Hole table").click();
  await expect(pageSvg).not.toContainText("TOTAL");
  // Tee sign and scorecard previews
  await page.getByRole("tab", { name: "Tee sign" }).click();
  await expect(pageSvg).toContainText("PAR 3");
  await expect(pageSvg).toContainText("350");
  await page.getByRole("tab", { name: "Scorecard" }).click();
  await expect(pageSvg).toContainText("PLAYER 1");
});

test("turning the map to fill the page", async ({ page }) => {
  await blankCourse(page);
  // A course running diagonally
  await addHole(page, { x: 200, y: 900 }, { x: 500, y: 650 });
  await addHole(page, { x: 550, y: 600 }, { x: 850, y: 350 });
  await addHole(page, { x: 900, y: 300 }, { x: 1200, y: 100 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  await page.getByTestId("best-rotation").click();
  await expect.poll(async () => Math.abs((await course(page)).style.rotation)).toBeGreaterThan(20);
  await page.getByRole("button", { name: "North up" }).click();
  await expect.poll(async () => (await course(page)).style.rotation).toBe(0);
});

test("tree cover: sparse woods leave grass between the trees", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  await page.getByTestId("forest-options").getByRole("radio", { name: "Everywhere" }).click();
  const painting = page.getByTestId("design-page").locator("image").first();
  // How light the painted land is on average (dark canopy against lighter grass)
  const lightness = async () => {
    const href = await painting.getAttribute("href");
    return page.evaluate(async (url: string) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 120;
      c.height = 80;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0, 120, 80);
      const d = g.getImageData(0, 0, 120, 80).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return sum / (d.length / 4);
    }, href!);
  };
  await expect(painting).toHaveAttribute("href", /^data:image\/jpeg/);
  const dense = await lightness();
  const before = await painting.getAttribute("href");
  const slider = page.getByLabel("Tree cover");
  await expect(page.getByTestId("forest-options")).toContainText("Dense");
  await slider.fill("0.2");
  await slider.dispatchEvent("pointerup");
  await expect.poll(async () => (await course(page)).style.treeCover).toBe(0.2);
  await expect(page.getByTestId("forest-options")).toContainText("Sparse");
  await expect.poll(async () => painting.getAttribute("href")).not.toBe(before);
  expect(await lightness()).toBeGreaterThan(dense + 15);
  // One undo step brings the thick woods back
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).style.treeCover).toBe(1);
});

test("picking a basket mark changes the map's baskets", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  const pageSvg = page.getByTestId("design-page");
  await expect(page.getByTestId("basket-mark-basket")).toHaveAttribute("aria-checked", "true");
  await expect(pageSvg.locator('[data-mark="basket"]')).toHaveCount(1);
  await page.getByTestId("basket-mark-flag").click();
  await expect.poll(async () => (await course(page)).style.basketMark).toBe("flag");
  await expect(page.getByTestId("basket-mark-flag")).toHaveAttribute("aria-checked", "true");
  await expect(pageSvg.locator('[data-mark="flag"]')).toHaveCount(1);
  await expect(pageSvg.locator('[data-mark="basket"]')).toHaveCount(0);
  await page.getByTestId("basket-mark-number").click();
  await expect.poll(async () => (await course(page)).style.basketMark).toBe("number");
  await expect(pageSvg.locator('[data-mark="number"]')).toContainText("1");
  // A style's own mark comes with it; the choice can be changed after
  await page.getByTestId("theme-topo").click();
  await expect.poll(async () => (await course(page)).style.basketMark).toBe("target");
});

// The printed pages' contents (pure logic: the SVG is built without a browser)
const sample = () => {
  const doc = createEmptyCourse();
  doc.name = "The Hollow Disc Golf Course";
  const add = (t: [number, number], b: [number, number]) => {
    const h = newHole();
    doc.holes.push(h);
    doc.items.push(createTee(h.id, { x: t[0], y: t[1] }), createBasket(h.id, { x: b[0], y: b[1] }));
    return h;
  };
  add([100, 500], [450, 500]);
  const h2 = add([500, 450], [500, 150]);
  h2.notes = "Creek & beyond OB";
  doc.items.push(createArea("ob", [{ x: 300, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 400 }]), createLine("stream", [{ x: 0, y: 600 }, { x: 900, y: 650 }]));
  doc.layouts.push({ id: "gold", name: "Gold", tee: "gold", pin: "A" });
  return doc;
};

plain("course map page: title, layout chips, holes and credits", () => {
  const doc = sample();
  doc.style.theme = "illustrated";
  doc.style.font = "Oswald";
  doc.style.holeTable = true;
  doc.style.legend = true;
  const p = renderPoster(doc, { contours: null, hillshade: null });
  plainExpect(p.svg.startsWith("<svg")).toBe(true);
  plainExpect(p.svg).toContain("THE HOLLOW DISC GOLF COURSE");
  plainExpect(p.svg).toContain("2 HOLES · PAR 6 · 650 FT");
  plainExpect(p.svg).toContain("LEGEND");
  plainExpect(p.svg).toContain("Out of bounds");
  plainExpect(p.svg).toContain("Made with Disc Golf Course Designer");
  // Forest: full-bleed with "The" split off, the name, and a chip per layout
  doc.style.theme = "forest";
  doc.style.font = "Script";
  const f = renderPoster(doc, { contours: null, hillshade: null });
  plainExpect(f.svg).toContain(">THE<");
  plainExpect(f.svg).toContain(">Hollow<");
  plainExpect(f.svg).toContain("MAIN LAYOUT");
  plainExpect(f.svg).toContain("GOLD LAYOUT");
});

plain("tee signs: wide and tall layouts, notes, next hole", () => {
  const doc = sample();
  const wide = renderTeeSign(doc, doc.holes[1].id, "18x12", { contours: null, hillshade: null })!;
  plainExpect(wide.width).toBe(18 * 72);
  plainExpect(wide.svg).toContain("PAR 3");
  plainExpect(wide.svg).toContain(">300<");
  plainExpect(wide.svg).toContain("CREEK &amp; BEYOND OB");
  plainExpect(wide.svg).toContain("ELEVATION CHANGE FROM TEE");
  const first = renderTeeSign(doc, doc.holes[0].id, "12x18", { contours: null, hillshade: null })!;
  plainExpect(first.height).toBe(18 * 72);
  plainExpect(first.svg).toContain("HOLE 2 ·");
});

plain("scorecard: holes, par and each layout's lengths", () => {
  const s = renderScorecard(sample());
  plainExpect(s.svg).toContain("PLAYER 5");
  plainExpect(s.svg).toContain("MAIN (ft)");
  plainExpect(s.svg).toContain("GOLD (ft)");
});

plain("the best turn for a diagonal course is not north up", () => {
  const doc = createEmptyCourse();
  for (let i = 0; i < 4; i++) {
    const h = newHole();
    doc.holes.push(h);
    doc.items.push(createTee(h.id, { x: 100 + i * 300, y: 1000 - i * 300 }), createBasket(h.id, { x: 300 + i * 300, y: 850 - i * 300 }));
  }
  plainExpect(Math.abs(bestRotation(doc))).toBeGreaterThan(20);
});

plain("creeks and trails wind: straight stretches get bends, the ends stay put", () => {
  const straight = [{ x: 0, y: 0 }, { x: 600, y: 0 }];
  const wound = meander(straight, 12, 80, 7);
  plainExpect(dist(wound[0], straight[0])).toBeLessThan(0.5);
  plainExpect(dist(wound[wound.length - 1], straight[1])).toBeLessThan(0.5);
  const most = Math.max(...wound.map(p => Math.abs(p.y)));
  plainExpect(most).toBeGreaterThan(6);
  plainExpect(most).toBeLessThan(16);
  // A creek already traced point by point (from OpenStreetMap) only wobbles a little
  const traced = Array.from({ length: 61 }, (_, i) => ({ x: i * 10, y: Math.sin(i / 4) * 30 }));
  const kept = meander(traced, 12, 80, 7);
  const moved = Math.max(...kept.map(p => distanceToPath(p, traced)));
  plainExpect(moved).toBeLessThan(5);
});

plain("basket marks: five kinds, on the map and in the legend", () => {
  const doc = sample();
  doc.style.legend = true;
  doc.style.theme = "illustrated";
  const seen = new Set<string>();
  for (const mark of BASKET_MARKS.map(m => m.value)) {
    doc.style.basketMark = mark;
    const one = basketMark(mark, { x: 0, y: 0 }, 1, "#f2c94c", "12");
    plainExpect(seen.has(one), mark).toBe(false);
    seen.add(one);
    // Both baskets and the legend's sample carry the mark
    const svg = renderPoster(doc, { contours: null, hillshade: null }).svg;
    plainExpect(svg.split(`data-mark="${mark}"`).length - 1, mark).toBe(3);
  }
  // The number mark carries the hole's number
  doc.style.basketMark = "number";
  const svg = renderPoster(doc, { contours: null, hillshade: null }).svg;
  plainExpect(svg).toMatch(/font-weight="700" font-size="[\d.]+" fill="#1b1d1a">2</);
  // Dark marks keep a light symbol inside (badge on a dark color)
  plainExpect(basketMark("badge", { x: 0, y: 0 }, 1, "#222222")).toContain('stroke="#ffffff"');
});

plain("courses saved before basket marks keep their look", () => {
  const forest = normalizeCourse({ holes: [], items: [], style: { theme: "forest" } });
  plainExpect(forest.style.basketMark).toBe("basket");
  const topo = normalizeCourse({ holes: [], items: [], style: { theme: "topo" } });
  plainExpect(topo.style.basketMark).toBe("target");
  const chosen = normalizeCourse({ holes: [], items: [], style: { theme: "topo", basketMark: "flag" } });
  plainExpect(chosen.style.basketMark).toBe("flag");
});

plain("the wide tee sign's north arrow stands out from its disc in every style", () => {
  const lum = (c: string) => {
    const v = c.startsWith("#") ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    return (0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2]) / 255;
  };
  for (const theme of ["forest", "illustrated", "satellite", "topo", "minimal", "night"] as const) {
    const doc = sample();
    doc.style.theme = theme;
    const sign = renderTeeSign(doc, doc.holes[0].id, "18x12", { contours: null, hillshade: null })!;
    const m = sign.svg.match(/<circle r="[\d.]+" fill="([^"]+)" fill-opacity="0.9"[^>]*\/><path d="M0 [^"]+" fill="([^"]+)"/);
    plainExpect(m, theme).not.toBeNull();
    plainExpect(Math.abs(lum(m![1]) - lum(m![2])), theme).toBeGreaterThan(0.4);
  }
});
