import { test as plain, expect as plainExpect, type Page } from "@playwright/test";
import { test, expect, addHole, blankCourse, course, geoAt, SITE } from "./fixtures";
import { fileCourse, readCsv, readGeoJson, readName, settle } from "../../src/lib/courseFile";
import { holeHints, mappedCourse, osmFeaturesFrom } from "../../src/lib/geo/osm";
import { pinPositions, teeLevels } from "../../src/lib/importSite";

// Holes from a GPS file (lib/courseFile, components/CourseFileDialog): GPX, KML, GeoJSON and CSV
// files of a course's tees and baskets, each point worked out from its name, every pin position
// and tee a hole has kept; and OpenStreetMap's own alternate pins.

plain("a point's name says what it is: tee or basket, which hole, which pin (pure logic)", () => {
  plainExpect(readName("Hole 3 Tee")).toMatchObject({ role: "tee", hole: 3 });
  plainExpect(readName("3T")).toMatchObject({ role: "tee", hole: 3 });
  plainExpect(readName("T12")).toMatchObject({ role: "tee", hole: 12 });
  plainExpect(readName("Basket 7")).toMatchObject({ role: "basket", hole: 7 });
  plainExpect(readName("Target 7")).toMatchObject({ role: "basket", hole: 7 });
  plainExpect(readName("5A")).toMatchObject({ role: "basket", hole: 5, tag: "A" });
  plainExpect(readName("Pin 4 long")).toMatchObject({ role: "basket", hole: 4, tag: "long" });
  plainExpect(readName("Hole 2 blue tee")).toMatchObject({ role: "tee", hole: 2, tag: "blue" });
  plainExpect(readName("Bench by 4").other).toBe(true);
  // Pins: a letter said keeps it, the rest short before long; tees longest at the back
  plainExpect(pinPositions(["long", "short"])).toEqual(["B", "A"]);
  plainExpect(pinPositions(["B", undefined])).toEqual(["B", "A"]);
  plainExpect(teeLevels([{ far: 100 }, { far: 250 }])).toEqual(["red", "blue"]);
});

plain("a CSV with a row a hole and two targets, as UDisc sends it; GeoJSON with OpenStreetMap's tags (pure logic)", () => {
  const csv = readCsv([
    "Hole,Par,Tee Latitude,Tee Longitude,Target A Latitude,Target A Longitude,Target B Latitude,Target B Longitude",
    "1,3,35.2900,-83.1800,35.2905,-83.1795,35.2907,-83.1792",
    "2,4,35.2910,-83.1790,35.2920,-83.1780,,"
  ].join("\n"));
  const c = fileCourse(settle(csv));
  plainExpect(c.holes.map(h => [h.number, h.tees?.length, h.baskets?.map(b => b.tag)])).toEqual([[1, 1, ["A", "B"]], [2, 1, ["A"]]]);
  const geo = readGeoJson(JSON.stringify({ type: "FeatureCollection", features: [
    { type: "Feature", properties: { disc_golf: "tee", ref: "1" }, geometry: { type: "Point", coordinates: [-83.18, 35.29] } },
    { type: "Feature", properties: { disc_golf: "basket", ref: "1A" }, geometry: { type: "Point", coordinates: [-83.179, 35.291] } },
    { type: "Feature", properties: { disc_golf: "basket", ref: "1B" }, geometry: { type: "Point", coordinates: [-83.1788, 35.2912] } },
    { type: "Feature", properties: { highway: "footway" }, geometry: { type: "LineString", coordinates: [[-83.18, 35.29], [-83.17, 35.28]] } }
  ] }));
  const g = fileCourse(settle(geo));
  plainExpect(g.holes.length).toBe(1);
  plainExpect(g.holes[0].baskets?.map(b => b.tag)).toEqual(["A", "B"]);
  // (a footpath isn't a hole)
  plainExpect(geo.lines.length).toBe(0);
});

plain("OpenStreetMap: a hole's second basket kept as another pin; a course mapped only as hole points said, no holes made (pure logic)", () => {
  const node = (tags: Record<string, string>, e: number, n: number) => ({ type: "node", id: Math.round(e * 1000 + n), ...geoAt(e, n), tags });
  const mc = mappedCourse(osmFeaturesFrom({ elements: [
    node({ disc_golf: "tee", ref: "5" }, 0, 0),
    node({ disc_golf: "basket", ref: "5A" }, 60, 20),
    node({ disc_golf: "basket", ref: "5B" }, 75, 30)
  ] }))!;
  plainExpect(mc.holes.length).toBe(1);
  plainExpect(mc.holes[0].baskets?.map(b => b.tag)).toEqual(["A", "B"]);
  const hints = osmFeaturesFrom({ elements: [1, 2, 3].map(i => node({ leisure: "disc_golf_course", name: `Disc golf hole ${i}` }, i * 40, 0)) });
  plainExpect(mappedCourse(hints)).toBeNull();
  plainExpect(holeHints(hints)).toBe(3);
});

/** A site round the made-up park (no import: just its place and frame). */
async function siteHere(page: Page) {
  await page.evaluate(s => (window as any).__dgActions.site({ location: { lat: s.lat, lon: s.lon, label: "Springfield Park" }, bounds: { north: s.lat + 0.003, south: s.lat - 0.003, west: s.lon - 0.004, east: s.lon + 0.004 } }), SITE);
  await expect.poll(async () => !!(await course(page)).site.bounds).toBe(true);
}
const open = (page: Page, name: string, text: string) =>
  page.getByTestId("course-file-input").first().setInputFiles({ name, mimeType: "application/octet-stream", buffer: Buffer.from(text) });
const ll = (e: number, n: number) => { const g = geoAt(e, n); return { lat: g.lat.toFixed(7), lon: g.lon.toFixed(7) }; };
const wpt = (name: string, e: number, n: number) => { const g = ll(e, n); return `<wpt lat="${g.lat}" lon="${g.lon}"><name>${name}</name></wpt>`; };

test("a GPX of waypoints: two holes, one with pins A and B; a bench left out; brought in as one undo step", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("Escape");
  await siteHere(page);
  await open(page, "course.gpx", `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
    ${wpt("1T", -100, -50)}${wpt("1A", -40, -20)}${wpt("1B", -30, -5)}
    ${wpt("Hole 2 Tee", 0, 0)}${wpt("Hole 2 Basket", 70, 30)}${wpt("Bench", 10, 10)}</gpx>`);
  const dialog = page.getByTestId("course-file-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("course-file-summary")).toContainText("course.gpx: 2 holes, 1 with more than one pin");
  await expect(page.getByTestId("course-file-hole-row").first()).toContainText("Hole 1: pins A, B");
  await page.getByTestId("course-file-bring").click();
  await expect(dialog).toBeHidden();
  const c = await course(page);
  plainExpect(c.holes.length).toBe(2);
  const first = c.holes.find((h: any) => h.number === 1);
  plainExpect(c.items.filter((i: any) => i.type === "basket" && i.holeId === first.id).map((i: any) => i.position).sort()).toEqual(["A", "B"]);
  plainExpect(c.items.filter((i: any) => i.type === "tee").length).toBe(2);
  // One undo step
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).holes.length).toBe(0);
});

test("a KML from Google Earth: folders per hole, and a hole drawn as a line with a bend", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("Escape");
  await siteHere(page);
  const pm = (name: string, e: number, n: number) => { const g = ll(e, n); return `<Placemark><name>${name}</name><Point><coordinates>${g.lon},${g.lat},0</coordinates></Point></Placemark>`; };
  const [a, b, c] = [ll(0, 0), ll(40, 60), ll(90, 70)];
  await open(page, "course.kml", `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Test DGC</name>
    <Folder><name>Hole 1</name>${pm("Tee", -120, -80)}${pm("Basket", -60, -60)}</Folder>
    <Placemark><name>Hole 2</name><LineString><coordinates>${a.lon},${a.lat},0 ${b.lon},${b.lat},0 ${c.lon},${c.lat},0</coordinates></LineString></Placemark>
    </Document></kml>`);
  await expect(page.getByTestId("course-file-summary")).toContainText("course.kml: 2 holes");
  await page.getByTestId("course-file-bring").click();
  const d = await course(page);
  plainExpect(d.holes.length).toBe(2);
  plainExpect(d.holes.find((h: any) => h.number === 2).doglegs.length).toBe(1);
});

test("a point that doesn't say what it is: listed to check, fixed by hand; the holes here kept and these added", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("Escape");
  await siteHere(page);
  await addHole(page, { x: 300, y: 300 }, { x: 600, y: 300 });
  // (nothing picked: the hole list at its full width, with the GPS file button)
  await page.evaluate(() => { (window as any).__dgEditor().set({ tool: "select" }); (window as any).__dgActions.select(null); });
  await open(page, "walk.gpx", `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
    ${wpt("Tee 4", 20, -60)}${wpt("4", 80, -30)}${wpt("Tee 5", 100, 40)}${wpt("Basket 5", 150, 80)}</gpx>`);
  // (hole 4's one other point, a bare "4": worked out as its basket, and listed to check)
  const check = page.getByTestId("course-file-check");
  await expect(check.getByTestId("course-file-point")).toHaveCount(1);
  await expect(page.getByTestId("course-file-summary")).toContainText("2 holes");
  // Left out by hand: hole 4 has no basket, so it doesn't come; put back as a basket, it does
  await check.getByTestId("course-file-role").selectOption("skip");
  await expect(page.getByTestId("course-file-summary")).toContainText("walk.gpx: 1 hole");
  await check.getByTestId("course-file-role").selectOption("basket");
  await expect(page.getByTestId("course-file-summary")).toContainText("walk.gpx: 2 holes");
  // Add these to the hole here
  await page.getByTestId("course-file-mode").getByText("Add these to them").click();
  await page.getByTestId("course-file-bring").click();
  const c = await course(page);
  plainExpect(c.holes.length).toBe(3);
});

test("no site yet: Find the park there opens Find your park on the file's spot", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("Escape");
  await open(page, "course.gpx", `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${wpt("1T", 0, 0)}${wpt("1B", 60, 20)}</gpx>`);
  await expect(page.getByTestId("course-file-no-site")).toBeVisible();
  await expect(page.getByTestId("course-file-bring")).toBeDisabled();
  await page.getByTestId("course-file-find-park").click();
  await expect(page.getByTestId("site-size")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("course-file-dialog")).toBeHidden();
});
