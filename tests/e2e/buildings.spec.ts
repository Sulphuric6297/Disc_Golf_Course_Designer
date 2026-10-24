import { test, expect } from "@playwright/test";
import { tileId, type TracedBuilding } from "../../src/lib/geo/buildings";
import { tracedItems } from "../../src/lib/importSite";
import { createStructure } from "../../src/lib/course";
import type { StructureItem } from "../../src/types";

test("the tile file's tiles are found by their place along its curve", () => {
  expect(tileId(0, 0, 0)).toBe(0);
  expect([tileId(1, 0, 0), tileId(1, 0, 1), tileId(1, 1, 1), tileId(1, 1, 0)]).toEqual([1, 2, 3, 4]);
  expect(tileId(2, 0, 0)).toBe(5);
});

test("buildings traced from the air come in only where the map has none, big enough, whole on the site and sure", () => {
  // (a site 1,000 ft square; 1/1000 of a degree is about 364 ft north-south here)
  const ref = { north: 35.003, south: 35.0, west: -83.0035, east: -83.0, width: 1000, height: 1000 };
  const ft = (x: number, y: number) => ({ lon: ref.west + (x / ref.width) * (ref.east - ref.west), lat: ref.north - (y / ref.height) * (ref.north - ref.south) });
  const box = (x: number, y: number, w: number, h: number, more: Partial<TracedBuilding> = {}): TracedBuilding => ({ points: [ft(x, y), ft(x + w, y), ft(x + w, y + h), ft(x, y + h)], source: "Microsoft ML Buildings", confidence: null, ...more });
  const mapped = createStructure("building", [{ x: 100, y: 100 }, { x: 160, y: 100 }, { x: 160, y: 150 }, { x: 100, y: 150 }]);
  const made = tracedItems(
    [
      box(400, 400, 40, 30, { heightM: 5 }), // a house: in, 5 m tall
      box(110, 110, 30, 20), // where the map has one already
      box(600, 600, 6, 6), // too small for a building
      box(980, 500, 40, 30), // off the site's edge
      box(700, 200, 40, 30, { confidence: 0.4 }), // not sure
      box(700, 700, 40, 30, { confidence: 0.9 }), // sure
      box(405, 405, 30, 20) // the same house again
    ],
    [mapped],
    ref
  ) as StructureItem[];
  expect(made.length).toBe(2);
  expect(made.every(m => m.kind === "building" && m.importSource === "traced")).toBe(true);
  expect(made[0].height).toBe(16.5);
  // (shaped as traced: its corners where they are on the ground)
  const xs = made[0].points.map(p => p.x), ys = made[0].points.map(p => p.y);
  expect(Math.min(...xs)).toBeCloseTo(400, 0);
  expect(Math.max(...xs)).toBeCloseTo(440, 0);
  expect(Math.min(...ys)).toBeCloseTo(400, 0);
  expect(Math.max(...ys)).toBeCloseTo(430, 0);
});
