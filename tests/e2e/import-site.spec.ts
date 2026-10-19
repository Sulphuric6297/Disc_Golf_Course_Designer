import { test, expect, addHole, course, importSite } from "./fixtures";

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
  // The hover readout gives the real elevation above sea level
  await page.mouse.move(800, 500);
  await expect(page.getByTestId("hover-readout")).toContainText(/Elevation (19|20)\d\d ft/);
});

test("re-importing replaces the trees and shapes it brought in, and keeps the holes", async ({ page }) => {
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
