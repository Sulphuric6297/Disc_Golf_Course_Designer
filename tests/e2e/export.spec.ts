import { readFileSync } from "fs";
import JSZip from "jszip";
import type { Page } from "@playwright/test";
import { test, expect, addHole, importSite, course } from "./fixtures";

/** Clicks an export button and returns the downloaded file's name and contents. */
const exported = async (page: Page, testid: string) => {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByTestId(testid).click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), data: readFileSync(path!) };
};

/** An imported site with two holes, a mando and an OB area. */
async function setup(page: Page) {
  await importSite(page, { trees: false, osm: false });
  const doc = await course(page);
  const W = doc.canvas.width, H = doc.canvas.height;
  await addHole(page, { x: W * 0.3, y: H * 0.7 }, { x: W * 0.5, y: H * 0.7 });
  await addHole(page, { x: W * 0.55, y: H * 0.65 }, { x: W * 0.55, y: H * 0.35 });
  await page.evaluate(() => {
    const a = (window as any).__dgActions;
    const d = (window as any).__dgCourse();
    (window as any).__dgEditor().set({ activeHoleId: d.holes[1].id, areaKind: "ob" });
    a.placeAt("add-mando", { x: d.canvas.width * 0.56, y: d.canvas.height * 0.5 });
    a.addDrawn("area", [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]);
    (window as any).__dgEditor().set({ tool: "select" });
  });
  await page.getByRole("button", { name: "6 Export" }).click();
  return { W, H };
}

test("GPS files: GeoJSON, KML and GPX hold the tees, baskets and holes with real coordinates", async ({ page }) => {
  await setup(page);
  const geo = await exported(page, "export-geojson");
  expect(geo.name).toBe("springfield-park-disc-golf-course.geojson");
  const fc = JSON.parse(geo.data.toString());
  const kinds = fc.features.map((f: any) => f.properties.kind);
  expect(kinds.filter((k: string) => k === "tee")).toHaveLength(2);
  expect(kinds.filter((k: string) => k === "basket")).toHaveLength(2);
  expect(kinds).toContain("mando");
  expect(kinds).toContain("ob");
  const hole = fc.features.find((f: any) => f.properties.kind === "hole" && f.properties.hole === 1);
  expect(hole.properties.par).toBe(3);
  expect(hole.properties.disc_golf).toBe("hole");
  const [lon, lat] = hole.geometry.coordinates[0];
  expect(Math.abs(lat - 39.78)).toBeLessThan(0.01);
  expect(Math.abs(lon + 89.68)).toBeLessThan(0.01);
  const kml = (await exported(page, "export-kml")).data.toString();
  expect(kml).toContain("<kml");
  expect(kml).toContain("<name>Hole 1</name>");
  expect(kml).toContain("1 basket A");
  const gpx = (await exported(page, "export-gpx")).data.toString();
  expect((gpx.match(/<wpt /g) ?? []).length).toBe(5);
  expect(gpx).toContain("H2 Blue tee");
  expect(gpx).toContain("<rte><name>Hole 2</name>");
});

test("spreadsheets: the hole list, the stake-out list and the parts list", async ({ page }) => {
  await setup(page);
  const holes = (await exported(page, "export-holes-csv")).data.toString().split("\n");
  expect(holes[0]).toMatch(/^hole,name,layout,tee,par,length_ft/);
  expect(holes).toHaveLength(3);
  expect(holes[1]).toMatch(/^1,,Main,Blue,3,/);
  const stake = (await exported(page, "export-stakeout")).data.toString();
  expect(stake).toContain("Blue tee (pad middle)");
  expect(stake).toContain("Basket A");
  // (East of a hole running north: passed on its left, on the line's side)
  expect(stake).toMatch(/Mando \(pass left\)/);
  await expect(page.getByTestId("parts")).toContainText("Baskets");
  await expect(page.getByTestId("parts-total")).toHaveText(/\$\d/);
  const parts = (await exported(page, "export-parts")).data.toString();
  expect(parts).toMatch(/Baskets,2,each,450,900/);
  expect(parts).toMatch(/Tee pads,2,each/);
});

test("printing: course map PDF and SVG, tee signs PDF and pictures, scorecard", async ({ page }) => {
  test.setTimeout(180_000);
  await setup(page);
  const svg = await exported(page, "export-map-svg");
  expect(svg.name).toMatch(/-map\.svg$/);
  expect(svg.data.toString()).toContain("<svg");
  const pdf = await exported(page, "export-map-pdf");
  expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.data.toString("latin1")).toContain("/Count 1");
  const signs = await exported(page, "export-signs-pdf");
  expect(signs.data.toString("latin1")).toContain("/Count 2");
  const zip = await JSZip.loadAsync((await exported(page, "export-signs-zip")).data);
  const names = Object.keys(zip.files).sort();
  expect(names).toEqual(["hole-01.png", "hole-01.svg", "hole-02.png", "hole-02.svg"]);
  const png = await zip.file("hole-01.png")!.async("uint8array");
  expect(Buffer.from(png.subarray(1, 4)).toString()).toBe("PNG");
  expect(png.length).toBeLessThan(5 * 1024 * 1024);
  const card = await exported(page, "export-scorecard");
  expect(card.data.subarray(0, 5).toString()).toBe("%PDF-");
});
