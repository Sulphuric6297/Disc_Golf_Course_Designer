import { expect as plainExpect, test as plain } from "@playwright/test";
import { test, expect, course, importSite, STAND, withNaip } from "./fixtures";
import { pointInPolygon as inPoly } from "../../src/lib/geom";
import { openClearings } from "../../src/lib/geo/detect";
import { photoDateText, photoScore, seasonOf } from "../../src/lib/geo/photoSources";
import { sunElevation } from "../../src/lib/geo/shadows";

/** A point given in meters east and north of the site's center, on the plan (ft from its north-west corner). */
const planOf = (doc: any, e: number, n: number) => ({ x: doc.canvas.width / 2 + e * 3.28084, y: doc.canvas.height / 2 - n * 3.28084 });

/** How dark the photo's bottom-right corner is (mean brightness, 0-255), where the provider's
 * credit used to be drawn as a dark box. */
const cornerLight = (page: any) => page.evaluate(async () => {
  const img = new Image();
  img.src = (window as any).__dgCourse().background;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const w = Math.round(img.naturalWidth * 0.2), h = Math.max(4, Math.round(img.naturalWidth / 140));
  const d = g.getImageData(img.naturalWidth - w, img.naturalHeight - h, w, h).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return s / (d.length / 4);
});

test("the summer aerial photo where NAIP covers the site: its date, season and credit kept with the site, none drawn on it", async ({ page }) => {
  await withNaip(page);
  const asked: string[] = [];
  page.on("request", r => { if (/USGSNAIPPlus\/ImageServer\/exportImage/.test(r.url())) asked.push(new URL(r.url()).searchParams.get("bandIds") ?? ""); });
  const summary = await importSite(page);
  const doc = await course(page);
  expect(doc.site.imagerySource).toBe("NAIP aerial photo");
  expect(doc.site.photo).toMatchObject({ id: "naip", date: "2023-08-16", season: "leaf-on" });
  expect(doc.site.photo.credit).toMatch(/USGS/);
  // (at the photo's own 60 cm: a few large requests, not hundreds of tiles; its infrared too)
  expect(doc.site.photo.metersPerPx).toBeCloseTo(0.6, 1);
  expect(asked).toContain("0,1,2");
  expect(asked).toContain("3");
  expect(asked.length).toBeLessThan(6);
  // No credit box in the corner: the grass goes right to the edge
  expect(await cornerLight(page)).toBeGreaterThan(90);
  // The leaves told apart by the infrared: the stand is one wood, the lone crowns trees
  const woods = doc.items.filter((i: any) => i.type === "area" && i.kind === "woods" && i.importSource === "photo");
  expect(woods).toHaveLength(1);
  expect(inPoly(planOf(doc, STAND.e, STAND.n), woods[0].points)).toBe(true);
  const trees = doc.items.filter((i: any) => i.type === "tree" && i.importSource === "photo");
  expect(trees.length).toBeGreaterThan(0);
  // (no shadows on the made-up photo to measure them by: a grown park tree's height)
  for (const t of trees) expect(t.height).toBe(30);
  expect(summary).toMatch(/On the photo: 1 wooded area, \d+ trees?\./);
});

test("Esri's photo where no aerial covers the site: no credit drawn on it either", async ({ page }) => {
  await importSite(page, { osm: false });
  const doc = await course(page);
  expect(doc.site.imagerySource).toBe("Esri satellite");
  expect(doc.site.photo?.credit ?? "Imagery © Esri").toMatch(/Esri/);
  expect(await cornerLight(page)).toBeGreaterThan(90);
});

plain("which photo is the pick: in leaf over bare, sharp only as far as the frame needs, aerial over satellite (pure logic)", () => {
  plainExpect(seasonOf("2023-08-16", 38)).toBe("leaf-on");
  plainExpect(seasonOf("2021-11-29", 39)).toBe("leaf-off");
  plainExpect(seasonOf("2022-04-20", 39)).toBe("mixed");
  // (south of the equator the seasons turn over; near it, always in leaf)
  plainExpect(seasonOf("2023-01-10", -34)).toBe("leaf-on");
  plainExpect(seasonOf("2023-01-10", 10)).toBe("leaf-on");
  const wanted = 0.22;
  const naip = photoScore({ season: "leaf-on", metersPerPx: 0.6, year: 2022, kind: "aerial" }, wanted, 2026);
  const state = photoScore({ season: "leaf-off", metersPerPx: 0.0762, year: 2024, kind: "aerial" }, wanted, 2026);
  const esri = photoScore({ season: "leaf-off", metersPerPx: 0.5, year: 2021, kind: "satellite" }, wanted, 2026);
  plainExpect(naip).toBeGreaterThan(state);
  plainExpect(state).toBeGreaterThan(esri);
  // A summer satellite photo beats a winter one
  plainExpect(photoScore({ season: "leaf-on", metersPerPx: 0.3, year: 2024, kind: "satellite" }, wanted, 2026)).toBeGreaterThan(photoScore({ season: "leaf-off", metersPerPx: 0.3, year: 2024, kind: "satellite" }, wanted, 2026));
  plainExpect(photoDateText({ date: "2023-08-16" })).toBe("Aug 2023");
  plainExpect(photoDateText({ date: "2024" })).toBe("2024");
  plainExpect(photoDateText({ date: "2022-06-02", dateTo: "2022-07-11" })).toBe("Jun 2022 to Jul 2022");
});

plain("the sun's height from its direction on the day: noon on midsummer, and a winter morning (pure logic)", () => {
  const deg = (r: number | null) => (r === null ? null : (r * 180) / Math.PI);
  // 40° N on June 21, the sun due south: 90 - 40 + 23.4
  plainExpect(deg(sunElevation("2024-06-21", 40, Math.PI))!).toBeCloseTo(73.4, 0);
  // December 21, due south: 90 - 40 - 23.4
  plainExpect(deg(sunElevation("2024-12-21", 40, Math.PI))!).toBeCloseTo(26.6, 0);
  // A sun in the north at 40° N in winter never happens
  plainExpect(sunElevation("2024-12-21", 40, 0)).toBeNull();
});

plain("a stand's clearings: one 30 ft across or more stays open, cut through to the outside; a gap among the crowns is filled (pure logic)", () => {
  // 1 m cells: a 60 m stand with a 12 m clearing (39 ft) and a 3 m gap (10 ft)
  const w = 80, h = 80, m = new Uint8Array(w * h);
  for (let y = 10; y < 70; y++) for (let x = 10; x < 70; x++) m[y * w + x] = 1;
  for (let y = 30; y < 42; y++) for (let x = 30; x < 42; x++) m[y * w + x] = 0;
  for (let y = 55; y < 58; y++) for (let x = 55; x < 58; x++) m[y * w + x] = 0;
  openClearings(m, w, h, 1);
  // the gap is filled
  plainExpect(m[56 * w + 56]).toBe(1);
  // the clearing is open, and reaches the outside along a slit: walking the open ground from it
  // (four ways) gets to the frame's edge
  const seen = new Uint8Array(w * h), stack = [36 * w + 36];
  let out = false;
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || m[i]) continue;
    seen[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { out = true; break; }
    stack.push(i - 1, i + 1, i - w, i + w);
  }
  plainExpect(out).toBe(true);
  // and the slit is thin: the stand loses no more than a cell a row of it
  let cut = 0;
  for (let y = 10; y < 70; y++) for (let x = 10; x < 70; x++) if (!m[y * w + x] && !(y >= 30 && y < 42 && x >= 30 && x < 42)) cut++;
  plainExpect(cut).toBeLessThan(25);
});
