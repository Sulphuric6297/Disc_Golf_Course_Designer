import { test as plain, expect as plainExpect } from "@playwright/test";
import { test, expect, addHole, blankCourse, course, editorState, importSite } from "./fixtures";
import { autoWalks, createAmenity, createArea, createBasket, createDropZone, createEmptyCourse, createLine, createMando, createTee, createTree, curves, linePath, newHole, normalizeCourse } from "../../src/lib/course";
import { contourInterval, meander, paintedFrom, paintedLine } from "../../src/lib/forest";
import { contoursOf, reliefExaggeration } from "../../src/lib/relief";
import { dist, distanceToPath } from "../../src/lib/geom";
import { BASKET_MARKS, basketMark, bestRotation, renderPoster } from "../../src/lib/mapSvg";
import { renderScorecard, renderTeeSign } from "../../src/lib/teeSign";

test("the Design step shows the printed map; its styles are the painted map in each landscape", async ({ page }) => {
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
  // One style, the painted Forest map: the styles are its landscapes (colors and woods)
  await expect(page.getByTestId("styles").getByRole("radio")).toHaveCount(6);
  await expect(page.getByTestId("theme-illustrated")).toHaveCount(0);
  await page.getByTestId("style-autumn").click();
  await expect.poll(async () => (await course(page)).style.landscape).toBe("autumn");
  const autumn = await course(page);
  expect(autumn.style.theme).toBe("forest");
  expect(autumn.style.trees).toBe("#7a4b26");
  await expect(page.getByTestId("style-autumn")).toHaveAttribute("aria-checked", "true");
  // Title and toggles go straight onto the map
  await page.getByLabel("Map title").fill("Ridge Run");
  await expect(pageSvg).toContainText("Ridge Run");
  await page.getByRole("button", { name: "Show Legend" }).click();
  await expect(pageSvg).toContainText("LEGEND");
  await page.getByRole("button", { name: "Show Hole guide" }).click();
  await expect(pageSvg).toContainText("TOTAL");
  // Tee sign and scorecard previews
  await page.getByRole("tab", { name: "Tee sign" }).click();
  await expect(pageSvg).toContainText("PAR 3");
  await expect(pageSvg).toContainText("350");
  await page.getByRole("tab", { name: "Scorecard" }).click();
  await expect(pageSvg).toContainText("Distance or Par");
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
  // How light the painted land is (dark canopy against lighter grass)
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
      const l: number[] = [];
      for (let i = 0; i < d.length; i += 4) l.push((d[i] + d[i + 1] + d[i + 2]) / 3);
      return l.sort((a, b) => a - b);
    }, href!);
  };
  await expect(painting).toHaveAttribute("href", /^(data:image\/jpeg|blob:)/);
  const dense = await lightness();
  // (the share of the land lighter than all but a quarter of the thick woods)
  const light = dense[Math.floor(dense.length * 0.75)];
  const share = (l: number[]) => l.filter(v => v > light).length / l.length;
  const before = await painting.getAttribute("href");
  const slider = page.getByLabel("Tree cover");
  await expect(page.getByTestId("forest-options")).toContainText("Dense");
  await slider.fill("0.2");
  await slider.dispatchEvent("pointerup");
  await expect.poll(async () => (await course(page)).style.treeCover).toBe(0.2);
  await expect(page.getByTestId("forest-options")).toContainText("Sparse");
  await expect.poll(async () => painting.getAttribute("href")).not.toBe(before);
  // Grass between the trees: far more of the land is lighter
  expect(share(await lightness())).toBeGreaterThan(share(dense) + 0.2);
  // One undo step brings the thick woods back
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).style.treeCover).toBe(1);
});

test("light and shadow: the sun, shadows and brightness repaint the Forest map, and Reset brings them back", async ({ page }) => {
  test.setTimeout(150_000);
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  await page.getByTestId("forest-options").getByRole("radio", { name: "Everywhere" }).click();
  const painting = page.getByTestId("design-page").locator("image").first();
  await expect(painting).toHaveAttribute("href", /^(data:image\/jpeg|blob:)/);
  const panel = page.getByTestId("light-shadow");
  await expect(panel).toBeVisible();
  const set = async (label: string, value: string) => {
    const slider = panel.getByLabel(label);
    await slider.fill(value);
    await slider.dispatchEvent("pointerup");
  };
  let before = await painting.getAttribute("href");
  await set("Sun from the", "90");
  await expect.poll(async () => (await course(page)).style.sunAngle).toBe(90);
  await expect(panel).toContainText("right");
  await expect.poll(async () => painting.getAttribute("href")).not.toBe(before);
  before = await painting.getAttribute("href");
  await set("Shadows", "1");
  await expect.poll(async () => (await course(page)).style.shadows).toBe(1);
  await expect.poll(async () => painting.getAttribute("href")).not.toBe(before);
  before = await painting.getAttribute("href");
  await set("Brightness", "0.3");
  await expect.poll(async () => (await course(page)).style.light).toBe(0.3);
  await expect.poll(async () => painting.getAttribute("href")).not.toBe(before);
  await panel.getByRole("button", { name: "Reset" }).click();
  await expect.poll(async () => { const s = (await course(page)).style; return [s.sunAngle, s.shadows, s.light]; }).toEqual([315, 0.65, 0]);
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
  // Another style keeps the mark chosen
  await page.getByTestId("style-pines").click();
  await expect.poll(async () => (await course(page)).style.landscape).toBe("pines");
  expect((await course(page)).style.basketMark).toBe("number");
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
  plainExpect(p.svg).not.toContain("Made with");
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
  // The info column: the length from each tee, the hole notes, the course in miniature with this
  // hole's "you are here", which hole of how many
  plainExpect(wide.svg).toContain(">300 FT<");
  plainExpect(wide.svg).toContain("Creek &amp; beyond OB");
  plainExpect(wide.svg).toContain("HOLE NOTES");
  plainExpect(wide.svg).toContain('data-part="course-map"');
  plainExpect(wide.svg).toContain("YOU ARE HERE");
  plainExpect(wide.svg).toContain("HOLE 2 OF 2");
  plainExpect(wide.svg).not.toContain("COURSE MAP<");
  plainExpect(wide.svg).toContain("ELEVATION CHANGE FROM TEE");
  const first = renderTeeSign(doc, doc.holes[0].id, "12x18", { contours: null, hillshade: null })!;
  plainExpect(first.height).toBe(18 * 72);
  plainExpect(first.svg).toContain("HOLE 2 ·");
});

plain("scorecard like the classic course card: Date, Par, Course; par and lengths; Name and the holes; two to a page; the logo", () => {
  const doc = sample();
  const s = renderScorecard(doc);
  for (const t of ["Distance or Par", "Name ↴", "Main (ft)", "Gold (ft)", ">Total<", "+/−", ">Date<", ">Par<", ">Course<", "The Hollow Disc Golf Course"]) plainExpect(s.svg, t).toContain(t);
  plainExpect(s.svg).not.toContain("PLAYER");
  // Two cards on the page, a cut line between
  plainExpect(s.svg.match(/data-part="scorecard"/g)).toHaveLength(2);
  plainExpect(s.svg).toContain('stroke-dasharray="6 5"');
  // 18 holes: Front and Back
  for (let i = 0; i < 16; i++) {
    const h = newHole();
    doc.holes.push(h);
    doc.items.push(createTee(h.id, { x: 100 + i * 30, y: 100 }), createBasket(h.id, { x: 100 + i * 30, y: 400 }));
  }
  const s18 = renderScorecard(doc).svg;
  for (const t of [">Front<", ">Back<", ">18<"]) plainExpect(s18, t).toContain(t);
  // The course's logo in place of its name
  doc.style.logo = "data:image/png;base64,iVBORw0KGgo=";
  plainExpect(renderScorecard(doc).svg).toContain('<image href="data:image/png;base64,iVBORw0KGgo="');
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

plain("paths curve through their points, painted exactly where drawn (no wobble); OB lines and Straight ones go straight", () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 60 }, { x: 200, y: 0 }, { x: 300, y: 60 }];
  const path = createLine("path", pts);
  const curve = linePath(path);
  plainExpect(curve.length).toBeGreaterThan(pts.length * 4);
  // (through every point it was drawn with)
  for (const p of pts) plainExpect(Math.min(...curve.map(q => dist(p, q)))).toBeLessThan(0.01);
  // Not straight between them: the middle of the first stretch is off the straight line
  const mid = curve.filter(q => q.x > 40 && q.x < 60);
  plainExpect(mid.some(q => Math.abs(q.y - q.x * 0.6) > 2)).toBe(true);
  // The painting follows that curve
  plainExpect(paintedLine(path, 2).points).toEqual(curve);
  // Straight on request; OB lines always
  plainExpect(linePath({ ...path, straight: true })).toEqual(pts);
  plainExpect(linePath(createLine("ob", pts))).toEqual(pts);
  plainExpect(curves({ kind: "road" })).toBe(true);
  plainExpect(curves({ kind: "fence" })).toBe(false);
});

plain("the painting is made again when anything painted changes (a tree's kind or size, a tee pad), not for a name", () => {
  const doc = createEmptyCourse();
  const h = newHole();
  doc.holes.push(h);
  const tee = createTee(h.id, { x: 100, y: 100 });
  const tree = createTree({ x: 200, y: 200 });
  doc.items.push(tee, tree);
  const key = (d: typeof doc) => JSON.stringify(paintedFrom(d));
  const k0 = key(doc);
  const edit = (id: string, patch: object) => key({ ...doc, items: doc.items.map(i => (i.id === id ? { ...i, ...patch } : i)) as typeof doc.items });
  plainExpect(edit(tree.id, { treeType: "conifer" })).not.toBe(k0);
  plainExpect(edit(tree.id, { width: 1.5 })).not.toBe(k0);
  plainExpect(edit(tree.id, { height: 70 })).not.toBe(k0);
  plainExpect(edit(tee.id, { padLength: 14 })).not.toBe(k0);
  plainExpect(key({ ...doc, holes: [{ ...h, name: "The Gauntlet", par: 4 }] })).toBe(k0);
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

plain("courses saved before basket marks keep their look; old styles come back as Forest", () => {
  const forest = normalizeCourse({ holes: [], items: [], style: { theme: "forest" } });
  plainExpect(forest.style.basketMark).toBe("basket");
  const topo = normalizeCourse({ holes: [], items: [], style: { theme: "topo" } });
  plainExpect(topo.style.basketMark).toBe("target");
  const chosen = normalizeCourse({ holes: [], items: [], style: { theme: "topo", basketMark: "flag" } });
  plainExpect(chosen.style.basketMark).toBe("flag");
  // The old styles come back as the painted Forest map, in their landscape's colors, keeping what they showed
  const night = normalizeCourse({ holes: [], items: [], style: { theme: "night", landscape: "pines", legend: true, font: "Bitter", fairway: "#2f6b3a", rough: "#16211b" } as any });
  plainExpect(night.style.theme).toBe("forest");
  plainExpect(night.style.rough).toBe("#55703f");
  plainExpect(night.style.legend).toBe(true);
  plainExpect(night.style.font).toBe("Bitter");
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

plain("features on the printed map: mandos, drop zones, amenity pictograms, OB and hazard tags, red OB edges", () => {
  const doc = sample();
  doc.style.theme = "illustrated";
  doc.style.legend = true;
  const h = doc.holes[0];
  doc.items.push(
    { ...createMando({ x: 280, y: 480 }, h.id, 0), side: "right" },
    createDropZone({ x: 250, y: 560 }, h.id),
    createAmenity({ x: 120, y: 620 }, "restroom"),
    createAmenity({ x: 160, y: 620 }, "here"),
    createArea("hazard", [{ x: 600, y: 300 }, { x: 800, y: 300 }, { x: 800, y: 450 }, { x: 600, y: 450 }])
  );
  const road = { ...createLine("road", [{ x: 0, y: 700 }, { x: 900, y: 700 }]), label: "Park Rd" };
  doc.items.push(road);
  const plainSvg = renderPoster(doc, { contours: null, hillshade: null }).svg;
  for (const sym of ["mando", "dropzone", "restroom", "here"]) {
    // On the map, and its sample in the legend
    plainExpect(plainSvg.split(`data-symbol="${sym}"`).length - 1, sym).toBe(2);
  }
  plainExpect(plainSvg).toContain(">Mando<");
  plainExpect(plainSvg).not.toContain("Mando: pass on the arrow's side");
  plainExpect(plainSvg).toContain(">You are here<");
  plainExpect(plainSvg).toContain(">HAZARD<");
  plainExpect(plainSvg).toContain(">OB<");
  // The road marked OB: red edges along both sides and an OB tag of its own
  const tagsBefore = plainSvg.split(">OB<").length;
  road.ob = true;
  const marked = renderPoster(doc, { contours: null, hillshade: null }).svg;
  plainExpect(marked.split(">OB<").length).toBe(tagsBefore + 1);
  plainExpect(marked.split(`stroke="${doc.style.ob}" stroke-width`).length).toBeGreaterThan(plainSvg.split(`stroke="${doc.style.ob}" stroke-width`).length + 1);
  // A gate (two paired posts) is one symbol, with its own legend line
  const a = { ...createMando({ x: 380, y: 491 }, h.id, 0), side: "right" as const }, b = { ...createMando({ x: 380, y: 509 }, h.id, 0), side: "left" as const };
  a.pairId = b.id;
  b.pairId = a.id;
  doc.items.push(a, b);
  const gated = renderPoster(doc, { contours: null, hillshade: null }).svg;
  plainExpect(gated.split('data-symbol="gate"').length - 1).toBe(2);
  plainExpect(gated.split('data-symbol="mando"').length - 1).toBe(2);
  plainExpect(gated).toContain(">Mando gate<");
  plainExpect(gated).not.toContain("Gate: pass between");
});

plain("marking colors: map colors (red OB) or PDGA colors (white OB, red out of play); casual areas in blue", () => {
  const doc = sample();
  doc.style.theme = "illustrated";
  doc.style.legend = true;
  const box = (x: number, y: number) => [{ x, y }, { x: x + 150, y }, { x: x + 150, y: y + 120 }, { x, y: y + 120 }];
  doc.items.push(createArea("ob", box(600, 300)), createArea("nogo", box(600, 500)), createArea("casual", box(100, 600)), createArea("hazard", box(300, 600)));
  const pond = createArea("water", box(800, 600));
  doc.items.push(pond);
  const legendOf = (svg: string) => svg.slice(svg.indexOf("Out of bounds") - 2000);
  const map = renderPoster(doc, { contours: null, hillshade: null }).svg;
  plainExpect(doc.style.markings).toBe("map");
  plainExpect(map).toContain(">CASUAL<");
  plainExpect(map).toContain(">OUT OF PLAY<");
  plainExpect(map).toContain(">Casual area<");
  plainExpect(map).toContain(">Out of play<");
  plainExpect(map).toContain(">Hazard<");
  plainExpect(map).not.toMatch(/free relief|relief required|one-throw penalty/);
  // A pond is OB by default: its own legend line
  plainExpect(map).toContain("OB water");
  plainExpect(map).toContain(`stroke="${doc.style.ob}" stroke-width`);
  plainExpect(map).toContain('stroke="#7c3aed"');
  plainExpect(map).toContain('stroke="#3b82f6"');
  // PDGA colors: no red OB left, white OB cased dark, red out of play
  doc.style.markings = "pdga";
  const pdga = renderPoster(doc, { contours: null, hillshade: null }).svg;
  plainExpect(pdga).not.toContain(`stroke="${doc.style.ob}" stroke-width`);
  plainExpect(pdga).not.toContain('stroke="#7c3aed"');
  plainExpect(pdga).toContain('stroke="#e11d2e"');
  plainExpect(pdga).toContain('stroke="#1b1d1a" stroke-opacity="0.9"');
  plainExpect(legendOf(pdga)).toContain('stroke="#ffffff" stroke-width');
  // Not marked OB (the pond, and the sample's creek): no OB water line
  pond.ob = false;
  for (const i of doc.items) if (i.type === "line" && i.kind === "stream") i.ob = false;
  plainExpect(renderPoster(doc, { contours: null, hillshade: null }).svg).not.toContain("OB water");
});

test("choosing PDGA marking colors in the Design step", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  await expect(page.getByTestId("markings-map")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("markings-pdga").click();
  await expect.poll(async () => (await course(page)).style.markings).toBe("pdga");
  await expect(page.getByTestId("markings-pdga")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).style.markings).toBe("map");
});

plain("elevation on the map: relief exaggerated to suit the course, tidy contour intervals, heights on the bolder contours", () => {
  // A gentle course's rises still show; a steep one isn't overdone
  plainExpect(reliefExaggeration(0.03)).toBeCloseTo(12, 0);
  plainExpect(reliefExaggeration(0.5)).toBe(1.5);
  plainExpect(reliefExaggeration(0.0001)).toBe(14);
  plainExpect(contourInterval(30)).toBe(5);
  plainExpect(contourInterval(110)).toBe(10);
  plainExpect(contourInterval(8)).toBe(1);
  // A slope rising to the east: the topographic style labels the bolder lines with their height
  const doc = sample();
  doc.style.theme = "topo";
  doc.style.contours = true;
  doc.site.baseElevationFt = 1000;
  const heights: Record<string, number> = {};
  for (let x = 0; x <= doc.canvas.width; x += doc.gridSize) for (let y = 0; y <= doc.canvas.height; y += doc.gridSize) heights[`${x},${y}`] = x * 0.1;
  doc.terrainHeights = heights;
  const contours = contoursOf(heights, doc.gridSize, doc.canvas.width, doc.canvas.height);
  const svg = renderPoster(doc, { contours, hillshade: null }).svg;
  const labels = [...svg.matchAll(/>(1\d{3})<\/text>/g)].map(m => Number(m[1]));
  plainExpect(labels.length).toBeGreaterThan(1);
  for (const l of labels) plainExpect(l % contours.interval).toBe(0);
  // In meters when the course is
  doc.units = "m";
  plainExpect(renderPoster(doc, { contours, hillshade: null }).svg).toMatch(/>3\d\d<\/text>/);
});

test("elevation on the Forest map: hills shade the painting, contour lines are painted in on request, Hills fine-tunes the relief", async ({ page }) => {
  test.setTimeout(150_000);
  await importSite(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  const painting = page.getByTestId("design-page").locator("image").first();
  await expect(painting).toHaveAttribute("href", /^(data:image\/jpeg|blob:)/);
  const shaded = await painting.getAttribute("href");
  // Hill shading off: a different picture (the hill's light and shade gone)
  await page.getByLabel("Hill shading").uncheck();
  await expect.poll(async () => painting.getAttribute("href")).not.toBe(shaded);
  await page.getByLabel("Hill shading").check();
  await expect.poll(async () => painting.getAttribute("href")).toBe(shaded);
  // Contour lines: painted into the land, not drawn over it
  await page.getByLabel("Contour lines").check();
  await expect.poll(async () => (await course(page)).style.contours).toBe(true);
  await expect.poll(async () => painting.getAttribute("href")).not.toBe(shaded);
  expect(await page.getByTestId("design-page").locator("path[stroke-linejoin='round'][fill='none'][stroke^='rgba(20,40,10']").count()).toBe(0);
  await page.getByLabel("Contour lines").uncheck();
  await expect.poll(async () => painting.getAttribute("href")).toBe(shaded);
  // Hills: the relief fine-tuned, from flat (the same as no hill shading) to stronger
  const hills = page.getByLabel("Hills");
  await hills.fill("0");
  await hills.dispatchEvent("pointerup");
  await expect.poll(async () => (await course(page)).style.reliefScale).toBe(0);
  await expect(page.getByText("Flat", { exact: true })).toBeVisible();
  await expect.poll(async () => painting.getAttribute("href")).not.toBe(shaded);
  await hills.fill("2");
  await hills.dispatchEvent("pointerup");
  await expect.poll(async () => (await course(page)).style.reliefScale).toBe(2);
  await expect.poll(async () => painting.getAttribute("href")).not.toBe(shaded);
});

test("painted water: a pond is lighter at its rim and in the shallows, deep and dark in the middle", async ({ page }) => {
  test.setTimeout(150_000);
  await blankCourse(page);
  await addHole(page, { x: 150, y: 950 }, { x: 450, y: 950 });
  await page.keyboard.press("Escape");
  // A round pond beside the hole (in the map's frame)
  await page.evaluate(() => {
    const cx = 300, cy = 860;
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: cx + Math.cos((i / 40) * Math.PI * 2) * 70, y: cy + Math.sin((i / 40) * Math.PI * 2) * 70 }));
    (window as any).__dgEditor().set({ areaKind: "water" });
    (window as any).__dgActions.addDrawn("area", pts);
  });
  await page.getByRole("button", { name: "5 Design" }).click();
  await page.getByTestId("forest-options").getByRole("radio", { name: "Drawn only" }).click();
  const painting = page.getByTestId("design-page").locator("image").first();
  await expect(painting).toHaveAttribute("href", /^(data:image\/jpeg|blob:)/);
  await page.waitForTimeout(1500);
  // Along the row through the pond's middle (its widest): the water's edge against its middle
  const profile = await page.evaluate(async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const all = g.getImageData(0, 0, img.width, img.height).data;
    let best: number[] = [];
    for (let y = 0; y < img.height; y += 2) {
      const water: number[] = [];
      for (let x = 0; x < img.width; x++) {
        const k = (y * img.width + x) * 4, r = all[k], gg = all[k + 1], b = all[k + 2];
        if (b > r + 15 && b > gg - 10) water.push(0.3 * r + 0.59 * gg + 0.11 * b);
      }
      if (water.length > best.length) best = water;
    }
    return best;
  }, (await painting.getAttribute("href"))!);
  expect(profile.length).toBeGreaterThan(100);
  const n = profile.length, mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const rim = mean([...profile.slice(0, Math.round(n * 0.06)), ...profile.slice(n - Math.round(n * 0.06))]);
  const middle = mean(profile.slice(Math.round(n * 0.35), Math.round(n * 0.65)));
  expect(rim).toBeGreaterThan(middle + 12);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  test("the live preview's painting is smaller on a phone (quicker, lighter on memory)", async ({ page }) => {
    await blankCourse(page);
    await page.evaluate(() => {
      (window as any).__dgActions.addHole({ x: 300, y: 700 }, { x: 650, y: 700 }, "blue");
      (window as any).__dgEditor().set({ step: "design", tool: "select" });
    });
    const painting = page.getByTestId("design-page").locator("image").first();
    await expect(painting).toHaveAttribute("href", /^(data:image\/jpeg|blob:)/, { timeout: 30_000 });
    const width = await page.evaluate(async (url: string) => { const img = new Image(); img.src = url; await img.decode(); return Math.max(img.width, img.height); }, (await painting.getAttribute("href"))!);
    expect(width).toBeLessThanOrEqual(1500);
    expect(width).toBeGreaterThan(1000);
  });
});

test("the page never freezes while the map paints: it paints between frames, the last picture standing in", async ({ page }) => {
  test.setTimeout(150_000);
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await addHole(page, { x: 700, y: 650 }, { x: 900, y: 350 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  const painting = page.getByTestId("design-page").locator("image").first();
  await expect(painting).toHaveAttribute("href", /^(data:image\/jpeg|blob:)/, { timeout: 60_000 });
  const before = await painting.getAttribute("href");
  // Watch the frames while a new painting is made
  await page.evaluate(() => {
    const w = window as any;
    w.__gaps = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      w.__gaps.push(now - last);
      last = now;
      if (!w.__stopTick) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const slider = page.getByLabel("Tree cover");
  await slider.fill("0.55");
  await slider.dispatchEvent("pointerup");
  // The old picture stays up while the new one paints
  await expect.poll(() => page.evaluate(() => (window as any).__dgPainting())).toBe(true);
  expect(await painting.getAttribute("href")).toBe(before);
  await expect.poll(async () => painting.getAttribute("href"), { timeout: 60_000 }).not.toBe(before);
  const gaps = await page.evaluate(() => { (window as any).__stopTick = true; return (window as any).__gaps as number[]; });
  expect(gaps.length).toBeGreaterThan(20);
  // No frame held up for long (a painting all at once took over a second here)
  expect(Math.max(...gaps)).toBeLessThan(400);
});

test("no explainers: the steps' panels and the printed pages say what things are, not how they work", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  const explainers = [/Make the course map beautiful/, /Click a tee spot, then a basket spot/, /A layout plays each hole/, /Quick OB/, /Draw around it/, /Anyone with the link/, /budgets usually run/, /The same sun lights/, /Short on fairways/, /stay clear\. Lone trees/, /Made with/, /PDGA par guidelines/, /Play safe/];
  for (const step of ["1 Site", "2 Holes", "3 Features", "4 Review", "5 Design", "6 Export"]) {
    await page.getByRole("button", { name: step }).click();
    const text = (await page.getByTestId("side-panel").textContent()) ?? "";
    for (const e of explainers) expect(text, `${step}: ${e}`).not.toMatch(e);
  }
  // The printed pages: the course map, a tee sign, the scorecard
  for (const tab of ["Course map", "Tee sign", "Scorecard"]) {
    await page.getByRole("button", { name: "5 Design" }).click();
    await page.getByRole("tab", { name: tab }).click();
    const text = (await page.getByTestId("design-page").textContent()) ?? "";
    for (const e of explainers) expect(text, `${tab}: ${e}`).not.toMatch(e);
  }
});

plain("a walk drawn to the next tee takes the automatic walk's place (pure logic)", () => {
  // Three holes: baskets at (400, 500), (500, 150); tees at (100, 500), (500, 450), (800, 150)
  const stats = [
    { holeId: "1", complete: true, line: [{ x: 100, y: 500 }, { x: 400, y: 500 }] },
    { holeId: "2", complete: true, line: [{ x: 500, y: 450 }, { x: 500, y: 150 }] },
    { holeId: "3", complete: true, line: [{ x: 800, y: 150 }, { x: 800, y: 600 }] }
  ];
  const pairs = (items: any[]) => autoWalks(items, stats).map(w => `${w.a.holeId}>${w.b.holeId}`);
  plainExpect(pairs([])).toEqual(["1>2", "2>3"]);
  // A winding walk drawn from hole 1's basket to hole 2's tee: only 2 > 3 is left automatic
  const walk = createLine("walk", [{ x: 410, y: 510 }, { x: 460, y: 560 }, { x: 495, y: 470 }]);
  plainExpect(pairs([walk])).toEqual(["2>3"]);
  // Drawn the other way round, the same
  plainExpect(pairs([{ ...walk, points: [...walk.points].reverse() }])).toEqual(["2>3"]);
  // A walk somewhere else, or a path (not a walk), changes nothing
  plainExpect(pairs([createLine("walk", [{ x: 0, y: 0 }, { x: 50, y: 0 }]), createLine("path", walk.points)])).toEqual(["1>2", "2>3"]);
});

test("trees placed on a fairway are painted where and as they were placed, and the woods add none there", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 500 }, { x: 700, y: 500 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  await page.getByTestId("forest-options").getByRole("radio", { name: "Drawn only" }).click();
  const painting = page.getByTestId("design-page").locator("image").first();
  await expect(painting).toHaveAttribute("href", /^(data:image\/jpeg|blob:)/);
  // The share of the land in canopy shade (much darker than the grass)
  const dark = async () => {
    const href = await painting.getAttribute("href");
    return page.evaluate(async (url: string) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 300;
      c.height = 200;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0, 300, 200);
      const d = g.getImageData(0, 0, 300, 200).data;
      const l: number[] = [];
      for (let i = 0; i < d.length; i += 4) l.push((d[i] + d[i + 1] + d[i + 2]) / 3);
      const median = [...l].sort((a, b) => a - b)[l.length >> 1];
      return l.filter(v => v < median * 0.62).length / l.length;
    }, href!);
  };
  // Nothing drawn, nothing placed: no trees at all (the woods once stood a few along every fairway)
  expect(await dark()).toBeLessThan(0.002);
  // A big pine placed in the middle of the fairway: there, at its own size
  const before = await painting.getAttribute("href");
  await page.evaluate(() => {
    const e = (window as any).__dgEditor();
    e.set({ treeKind: "conifer" });
    (window as any).__dgActions.placeAt("add-tree", { x: 500, y: 500 });
  });
  const tree = (await course(page)).items.find((i: any) => i.type === "tree");
  expect(tree.treeType).toBe("conifer");
  await expect.poll(() => painting.getAttribute("href"), { timeout: 30_000 }).not.toBe(before);
  const share = await dark();
  // (its crown's share of the land, give or take its shaded side and the page's margins)
  const doc = await course(page);
  const crown = (Math.PI * tree.radius * tree.radius) / (doc.canvas.width * doc.canvas.height);
  expect(share).toBeGreaterThan(crown * 0.3);
});

test("the course map's page edited like Canva: pick, drag, size, style, hide; text added, typed, moved, deleted", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByTestId("hole-row").click();
  await page.getByRole("button", { name: "5 Design" }).click();
  const svg = page.getByTestId("design-page");
  const style = async () => (await course(page)).style;
  // (Delete on the page with nothing picked never deletes the hole picked on the map)
  await page.keyboard.press("Delete");
  expect((await course(page)).holes).toHaveLength(1);
  await page.getByRole("button", { name: "Show Legend" }).click();
  const legend = svg.locator('[data-el="legend"]');
  await expect(legend).toHaveCount(1);
  const box = (await legend.boundingBox())!;
  const pageBox = (await svg.boundingBox())!;
  // Picked by a click: its settings in the panel
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await editorState(page)).designSel).toBe("legend");
  await expect(page.getByTestId("page-selection")).toBeVisible();
  await expect(page.getByTestId("page-selected")).toContainText("Legend");
  // Dragged to the middle of the page
  const to = { x: pageBox.x + pageBox.width / 2, y: pageBox.y + pageBox.height / 2 };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await style()).page?.legend?.x ?? 0).toBeGreaterThan(0.2);
  expect((await style()).page.legend.x).toBeLessThan(0.7);
  await expect.poll(async () => { const b = (await legend.boundingBox())!; return Math.abs(b.x + b.width / 2 - to.x); }).toBeLessThan(pageBox.width * 0.1);
  // One undo step; then back in place
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await style()).page?.legend?.x).toBeUndefined();
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await style()).page?.legend?.x).toBeTruthy();
  await page.getByTestId("page-reset").click();
  await expect.poll(async () => (await style()).page?.legend?.x).toBeUndefined();
  // Sized with a corner square
  const corner = page.getByTestId("page-corner").nth(3);
  const c = (await corner.boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y + 80, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await style()).page?.legend?.scale ?? 1).toBeGreaterThan(1.1);
  // Its heading and panel; then Delete hides it
  await page.getByLabel("Legend heading").fill("Key");
  await expect(svg).toContainText("KEY");
  await page.keyboard.press("Escape");
  await page.locator('[data-el="legend"]').click();
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await style()).legend).toBe(false);
  // The hole guide's columns
  await page.getByRole("button", { name: "Show Hole guide" }).click();
  await page.getByTestId("page-element").filter({ hasText: "Hole guide" }).click();
  await page.getByTestId("hole-guide-columns").getByText("Elevation").click();
  await expect(svg).toContainText("ELEV");
  // The title hidden from its panel
  await page.getByTestId("page-element").filter({ hasText: "Title" }).click();
  await page.getByTestId("page-hide").click();
  await expect.poll(async () => (await style()).page?.title?.hidden).toBe(true);
  await expect(svg.locator('[data-el="title"]')).toHaveCount(0);
  // Text: added, typed, dragged, deleted
  await page.getByTestId("page-add-text").click();
  await expect.poll(async () => (await style()).texts?.length ?? 0).toBe(1);
  await page.getByTestId("page-text").fill("Sponsored by Acme");
  await page.getByTestId("page-text").blur();
  await expect(svg).toContainText("Sponsored by Acme");
  const t0 = (await style()).texts[0];
  const added = svg.locator(`[data-el="text:${t0.id}"]`);
  await expect(added).toBeVisible();
  await page.waitForTimeout(300);
  const tb = (await added.boundingBox())!;
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 - 100, tb.y + tb.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await style()).texts[0].x).toBeLessThan(t0.x - 0.02);
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await style()).texts.length).toBe(2);
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await style()).texts.length).toBe(1);
  expect((await course(page)).holes).toHaveLength(1);
});

test("the map stays put on the Design page; its labels are dragged, hidden and put back", async ({ page }) => {
  await blankCourse(page);
  const hole = await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  const style = async () => (await course(page)).style;
  // (the map isn't one of the things to pick)
  await expect(page.getByTestId("page-element").filter({ hasText: /^Map$/ })).toHaveCount(0);
  const num = page.getByTestId("design-page").locator(`[data-label="num:${hole.id}"]`);
  await expect(num).toHaveCount(1);
  const b = (await num.boundingBox())!;
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await style()).labelAt?.[`num:${hole.id}`]?.dx ?? 0).not.toBe(0);
  expect((await editorState(page)).designSel).toBe(`label:num:${hole.id}`);
  // Drawn there now
  await expect.poll(async () => { const m = (await num.boundingBox())!; return Math.hypot(m.x + m.width / 2 - from.x - 60, m.y + m.height / 2 - from.y - 40); }).toBeLessThan(10);
  // Back in place; hidden; shown again
  await page.getByTestId("page-reset").click();
  await expect.poll(async () => (await style()).labelAt?.[`num:${hole.id}`]).toBeUndefined();
  await num.click();
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await style()).labelAt?.[`num:${hole.id}`]?.hidden).toBe(true);
  await expect(num).toHaveCount(0);
  await page.getByTestId("page-show-labels").click();
  await expect(num).toHaveCount(1);
  expect((await style()).page?.map).toBeUndefined();
});

test("the Design page zooms with the wheel and pans with a press and drag", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 700 }, { x: 650, y: 700 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "5 Design" }).click();
  const zoom = async () => parseInt((await page.getByTestId("design-zoom").textContent()) ?? "0");
  await expect.poll(zoom).toBeGreaterThan(0);
  const z0 = await zoom();
  const scroller = page.getByTestId("design-scroll");
  const area = (await scroller.boundingBox())!;
  await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.4);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
  await expect.poll(zoom).toBeGreaterThan(z0 * 1.6);
  // Dragged on the map (away from its labels): the page moves under the pointer
  const s0 = await scroller.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
  const from = { x: area.x + area.width * 0.5, y: area.y + area.height * 0.25 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 160, from.y - 90, { steps: 8 });
  await page.mouse.up();
  const s1 = await scroller.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
  expect(s1.x - s0.x).toBeGreaterThan(100);
  expect(s1.y - s0.y).toBeGreaterThan(50);
  expect((await editorState(page)).designSel).toBeNull();
});
