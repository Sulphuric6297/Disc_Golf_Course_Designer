import { test as plain, expect as plainExpect } from "@playwright/test";
import { test, expect, addHole, blankCourse, course } from "./fixtures";
import { createArea, createBasket, createEmptyCourse, createLine, createTee, newHole } from "../../src/lib/course";
import { bestRotation, renderPoster } from "../../src/lib/mapSvg";
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
