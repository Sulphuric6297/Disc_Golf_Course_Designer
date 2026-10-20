import { test as plain, expect as plainExpect, type Page } from "@playwright/test";
import { test, expect, addHole, course, geoAt, importSite } from "./fixtures";
import { osmFeaturesFrom, overpassQuery } from "../../src/lib/geo/osm";
import { clipPathToRect, clipPolygonToRect } from "../../src/lib/geom";

/** OpenStreetMap's servers answer with these elements (or `fail` for a server that can't be reached). */
const overpass = (page: Page, answer: (host: string) => object | "fail" | number, asked: string[] = []) =>
  page.route(/overpass|maps\.mail\.ru/, route => {
    const host = new URL(route.request().url()).host;
    asked.push(host);
    const a = answer(host);
    if (a === "fail") return route.abort();
    if (typeof a === "number") return route.fulfill({ status: a, body: "busy" });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(a) });
  });
const footway = { type: "way", tags: { highway: "footway" }, geometry: [geoAt(-200, -80), geoAt(0, -20), geoAt(200, 40)] };
const pond = { type: "way", tags: { natural: "water" }, geometry: Array.from({ length: 13 }, (_, i) => geoAt(-150 + Math.cos((i / 12) * Math.PI * 2) * 35, -60 + Math.sin((i / 12) * Math.PI * 2) * 35)) };
const osmCount = async (page: Page) => (await course(page)).items.filter((i: any) => i.importSource === "osm").length;

test("bringing in a site: photo, elevation, trees, and OpenStreetMap paths and water", async ({ page }) => {
  const summary = await importSite(page);
  expect(summary).toMatch(/ft of elevation change across the site/);
  expect(summary).toMatch(/From OpenStreetMap: 1 path, 1 road, 1 stream|From OpenStreetMap: 1 path, 1 road, 1 water area, 1 parking lot/);
  const doc = await course(page);
  expect(doc.background).toMatch(/^data:image\/jpeg/);
  expect(doc.terrainHeights).toBeGreaterThan(1000);
  expect(doc.site.location.label).toMatch(/Springfield Park/);
  expect(doc.site.baseElevationFt).toBeGreaterThan(1900);
  expect(doc.site.elevationSource).toMatch(/global terrain tiles/);
  // About 1,500 x 1,000 ft framed around the place found
  expect(doc.canvas.width).toBeGreaterThan(1300);
  expect(doc.canvas.width).toBeLessThan(1700);
  const kinds = doc.items.map((i: any) => `${i.type}:${i.kind ?? ""}`);
  expect(kinds).toContain("area:water");
  expect(kinds).toContain("line:path");
  expect(kinds).toContain("line:road");
  expect(kinds).toContain("area:parking");
  expect(doc.items.find((i: any) => i.type === "area" && i.kind === "water").label).toBe("Mill Pond");
  expect(doc.items.filter((i: any) => i.type === "tree").length).toBeGreaterThan(0);
  expect(doc.name).toBe("Springfield Park Disc Golf Course");
  // Straight on to laying out holes
  await expect(page.getByTestId("tool-hint")).toContainText("Click where the tee goes");
});

test("a hole up the hill: elevation change and par on the real terrain", async ({ page }) => {
  await importSite(page, { trees: false, osm: false });
  const doc = await course(page);
  // The stub hill rises to the north-east of the middle: tee south-west of it, basket on top
  const mid = { x: doc.canvas.width / 2, y: doc.canvas.height / 2 };
  const top = { x: mid.x + 120 * 3.28084, y: mid.y - 120 * 3.28084 };
  await addHole(page, { x: top.x - 300, y: top.y + 150 }, top);
  const row = page.getByTestId("hole-row");
  await expect(row).toContainText(/\+\d+(\.\d)? ft/);
  await page.keyboard.press("Escape");
  await row.click();
  await expect(page.getByTestId("hole-stats")).toContainText("uphill");
  await expect(page.getByTestId("elevation-profile")).toBeVisible();
  // The hover readout gives the real elevation above sea level (the mouse moved again while a busy
  // page catches up)
  let nudge = 0;
  await expect.poll(async () => {
    await page.mouse.move(800 + (nudge++ % 2) * 4, 500);
    return page.getByTestId("hover-readout").textContent();
  }, { timeout: 20_000 }).toMatch(/Elevation (19|20)\d\d ft/);
});

test("re-importing replaces the trees and shapes it brought in, and keeps the holes", async ({ page }) => {
  // (two whole imports)
  test.setTimeout(180_000);
  await importSite(page);
  const before = await course(page);
  await addHole(page, { x: 300, y: 600 }, { x: 600, y: 600 });
  await page.keyboard.press("Escape");
  await importSite(page);
  const after = await course(page);
  expect(after.holes).toHaveLength(1);
  expect(after.items.filter((i: any) => i.type === "area" && i.kind === "water")).toHaveLength(1);
  expect(after.items.filter((i: any) => i.type === "tree").length).toBe(before.items.filter((i: any) => i.type === "tree").length);
});

test("rivers and lakes mapped as outlines in pieces come in, and roads and rivers are cut to the site's edges", async ({ page }) => {
  // A wide river across the whole site, mapped as a multipolygon in two pieces (one drawn the
  // other way round), its center line, and a road running a mile on past the site each way
  await overpass(page, () => ({
    elements: [
      { type: "relation", tags: { type: "multipolygon", natural: "water", water: "river", name: "Big River" }, members: [
        { type: "way", role: "outer", geometry: [geoAt(-3000, 20), geoAt(3000, 20), geoAt(3000, 60)] },
        { type: "way", role: "outer", geometry: [geoAt(-3000, 20), geoAt(-3000, 60), geoAt(3000, 60)] }
      ] },
      { type: "way", tags: { waterway: "river", name: "Big River" }, geometry: [geoAt(-3000, 40), geoAt(3000, 40)] },
      { type: "way", tags: { highway: "primary", name: "County Rd" }, geometry: [geoAt(-1500, -100), geoAt(1800, -100)] }
    ]
  }));
  const summary = await importSite(page, { trees: false });
  expect(summary).toMatch(/From OpenStreetMap: 1 road, 1 stream, 1 water area\./);
  const doc = await course(page);
  const W = doc.canvas.width, H = doc.canvas.height;
  const onSite = (pts: { x: number; y: number }[]) => pts.every(p => p.x >= -21 && p.x <= W + 21 && p.y >= -21 && p.y <= H + 21);
  const river = doc.items.find((i: any) => i.type === "area" && i.kind === "water");
  expect(river.label).toBe("Big River");
  expect(onSite(river.points)).toBe(true);
  // Across the whole site, 40 m (131 ft) wide
  const xs = river.points.map((p: any) => p.x), ys = river.points.map((p: any) => p.y);
  expect(Math.min(...xs)).toBeLessThan(0);
  expect(Math.max(...xs)).toBeGreaterThan(W);
  expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(125);
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(137);
  for (const kind of ["road", "stream"]) {
    const line = doc.items.find((i: any) => i.type === "line" && i.kind === kind);
    expect(onSite(line.points), kind).toBe(true);
  }
  expect(doc.items.find((i: any) => i.kind === "road").label).toBe("County Rd");
});

test("a busy OpenStreetMap server: the next one is asked", async ({ page }) => {
  const asked: string[] = [];
  // The main one busy, the second out of time (it still answers, with a remark), the third answers
  await overpass(page, host => (host === "overpass-api.de" ? 504 : host === "overpass.private.coffee" ? { remark: "runtime error: Query timed out in \"query\" at line 1 after 31 seconds.", elements: [] } : { elements: [footway] }), asked);
  const summary = await importSite(page, { trees: false });
  expect(summary).toMatch(/From OpenStreetMap: 1 path\./);
  expect(asked).toEqual(["overpass-api.de", "overpass.private.coffee", "maps.mail.ru"]);
});

test("OpenStreetMap out of reach: said plainly, with Try again; the Site step looks again any time", async ({ page }) => {
  let up = false;
  await overpass(page, () => (up ? { elements: [footway, pond] } : "fail"));
  await importSite(page, { trees: false });
  const warning = page.getByRole("status").filter({ hasText: "Couldn't reach OpenStreetMap" });
  await expect(warning).toBeVisible();
  expect(await osmCount(page)).toBe(0);
  up = true;
  await warning.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => osmCount(page)).toBe(2);
  await expect(page.getByRole("status").filter({ hasText: "From OpenStreetMap: 1 path, 1 water area." })).toBeVisible();
  // Again from the Site step: what came before is replaced, not doubled, and Undo brings it back
  await page.getByRole("button", { name: /^1\s*Site$/ }).click();
  await page.getByTestId("refresh-osm").click();
  await expect(page.getByRole("status").filter({ hasText: "From OpenStreetMap: 1 path, 1 water area." })).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(await osmCount(page)).toBe(2);
});

plain("OpenStreetMap answers: ways, multipolygon outlines joined from their pieces, riverbanks, more road kinds (pure logic)", () => {
  const p = (lat: number, lon: number) => ({ lat, lon });
  const found = osmFeaturesFrom({
    elements: [
      // A lake in three pieces, out of order and one reversed, with an island
      { type: "relation", tags: { type: "multipolygon", natural: "water", name: "Lake" }, members: [
        { type: "way", role: "outer", geometry: [p(1, 1), p(1, 0)] },
        { type: "way", role: "outer", geometry: [p(0, 0), p(0, 1)] },
        { type: "way", role: "outer", geometry: [p(1, 0), p(0, 0)] },
        { type: "way", role: "outer", geometry: [p(0, 1), p(1, 1)] },
        { type: "way", role: "inner", geometry: [p(0.4, 0.4), p(0.4, 0.6), p(0.6, 0.6), p(0.4, 0.4)] }
      ] },
      // A riverbank as a closed way, a motorway ramp, a brook
      { type: "way", tags: { waterway: "riverbank" }, geometry: [p(2, 2), p(2, 3), p(3, 3), p(2, 2)] },
      { type: "way", tags: { highway: "motorway_link" }, geometry: [p(4, 4), p(5, 5)] },
      { type: "way", tags: { waterway: "brook" }, geometry: [p(6, 6), p(7, 7)] },
      // A river's route relation (its own ways come separately) and an unclosable outline: skipped
      { type: "relation", tags: { type: "waterway", waterway: "river" }, members: [{ type: "way", role: "", geometry: [p(8, 8), p(9, 9)] }] },
      { type: "relation", tags: { type: "multipolygon", natural: "wood" }, members: [{ type: "way", role: "outer", geometry: [p(8, 8), p(9, 9), p(9, 8)] }] }
    ]
  });
  plainExpect(found.map(f => `${f.geom}:${f.kind}`)).toEqual(["area:water", "area:water", "line:road", "line:stream"]);
  const lake = found[0];
  plainExpect(lake.name).toBe("Lake");
  plainExpect(lake.points).toHaveLength(4);
  plainExpect(new Set(lake.points.map(q => `${q.lat},${q.lon}`))).toEqual(new Set(["0,0", "0,1", "1,1", "1,0"]));
  // The query asks for multipolygons too
  plainExpect(overpassQuery({ south: 1, west: 2, north: 3, east: 4 } as any)).toContain('relation["type"="multipolygon"]["natural"');
});

plain("cutting lines and shapes to the site (pure logic)", () => {
  const r = { x0: 0, y0: 0, x1: 100, y1: 50 };
  const round = (pieces: { x: number; y: number }[][]) => pieces.map(piece => piece.map(q => ({ x: Math.round(q.x * 1e6) / 1e6, y: Math.round(q.y * 1e6) / 1e6 })));
  // A road straight across: one piece from edge to edge
  plainExpect(round(clipPathToRect([{ x: -500, y: 25 }, { x: 600, y: 25 }], r))).toEqual([[{ x: 0, y: 25 }, { x: 100, y: 25 }]]);
  // A path that leaves and comes back: two pieces
  const pieces = clipPathToRect([{ x: 10, y: 10 }, { x: 10, y: 80 }, { x: 90, y: 80 }, { x: 90, y: 10 }], r);
  plainExpect(round(pieces)).toEqual([[{ x: 10, y: 10 }, { x: 10, y: 50 }], [{ x: 90, y: 50 }, { x: 90, y: 10 }]]);
  // Wholly outside: nothing
  plainExpect(clipPathToRect([{ x: -10, y: -10 }, { x: -5, y: 200 }], r)).toEqual([]);
  // A lake bigger than the site: the site
  const big = clipPolygonToRect([{ x: -100, y: -100 }, { x: 300, y: -100 }, { x: 300, y: 300 }, { x: -100, y: 300 }], r);
  plainExpect(big.map(q => `${Math.round(q.x)},${Math.round(q.y)}`).sort()).toEqual(["0,0", "0,50", "100,0", "100,50"]);
  // A pond wholly inside stays as it is; one wholly outside goes
  const pond = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }];
  plainExpect(clipPolygonToRect(pond, r)).toEqual(pond);
  plainExpect(clipPolygonToRect(pond.map(q => ({ x: q.x + 500, y: q.y })), r)).toEqual([]);
});
