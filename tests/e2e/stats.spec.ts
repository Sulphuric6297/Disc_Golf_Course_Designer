// Pure-logic tests (no browser page) for the hole and course numbers and the checks.
import { test, expect } from "@playwright/test";
import { FAIRWAY_STATIONS, createArea, createBasket, createEmptyCourse, createLine, createTee, createTree, fairwayOutline, fairwayWidthAt, newHole } from "../../src/lib/course";
import { corridor, pathLength, pointInPolygon, smoothPath } from "../../src/lib/geom";
import { courseTotals, designChecks, holeStats, isOb, parForDistance, safetyIssues } from "../../src/lib/holeStats";
import type { CourseDoc, P, TeeLevel } from "../../src/types";

/** A course with holes from [tee, basket] pairs, on flat ground (or with `heights`). */
const make = (holes: [P, P, TeeLevel?][], heights: Record<string, number> = {}): CourseDoc => {
  const doc = createEmptyCourse();
  doc.terrainHeights = heights;
  for (const [t, b, level] of holes) {
    const h = newHole();
    doc.holes.push(h);
    doc.items.push(createTee(h.id, t, level ?? "blue"), createBasket(h.id, b));
  }
  return doc;
};

/** A plane rising `ftPer100` ft every 100 ft east. */
const slopeEast = (ftPer100: number, doc = createEmptyCourse()) => {
  const out: Record<string, number> = {};
  for (let x = 0; x <= doc.canvas.width; x += doc.gridSize) for (let y = 0; y <= doc.canvas.height; y += doc.gridSize) out[`${x},${y}`] = (x / 100) * ftPer100;
  return out;
};

test.describe("par and effective length (PDGA)", () => {
  test("par limits for each tee color", () => {
    expect(parForDistance(300, "blue")).toBe(3);
    expect(parForDistance(524, "blue")).toBe(3);
    expect(parForDistance(525, "blue")).toBe(4);
    expect(parForDistance(800, "blue")).toBe(5);
    expect(parForDistance(625, "gold")).toBe(4);
    expect(parForDistance(380, "red")).toBe(4);
    expect(parForDistance(330, "green")).toBe(4);
  });

  test("uphill plays longer by 3 ft per ft of climb; downhill shorter", () => {
    const up = make([[{ x: 100, y: 500 }, { x: 400, y: 500 }]], slopeEast(3));
    const s = holeStats(up, up.holes[0]);
    expect(Math.round(s.length)).toBe(300);
    expect(Math.round(s.elevationChange)).toBe(9);
    expect(Math.round(s.playsLike)).toBe(327);
    const down = make([[{ x: 400, y: 500 }, { x: 100, y: 500 }]], slopeEast(3));
    expect(Math.round(holeStats(down, down.holes[0]).playsLike)).toBe(273);
  });

  test("a hole that climbs enough becomes a par 4", () => {
    // 480 ft and 20 ft up: 540 ft effective, over the blue par 4 minimum of 525
    const flat = make([[{ x: 100, y: 500 }, { x: 580, y: 500 }]]);
    expect(holeStats(flat, flat.holes[0]).par).toBe(3);
    const hill = make([[{ x: 100, y: 500 }, { x: 580, y: 500 }]], slopeEast(20 / 4.8));
    expect(holeStats(hill, hill.holes[0]).par).toBe(4);
  });

  test("length follows the doglegs; the shape says which way it turns", () => {
    const doc = make([[{ x: 100, y: 500 }, { x: 400, y: 200 }]]);
    doc.holes[0].doglegs = [{ x: 400, y: 500 }];
    const s = holeStats(doc, doc.holes[0]);
    expect(Math.round(s.length)).toBe(600);
    expect(Math.round(s.direct)).toBe(424);
    // East then north: a left turn on a north-up map
    expect(s.shape).toBe("left");
    // A 90° dogleg plays longer than its line
    expect(s.playsLike).toBeGreaterThan(s.length);
  });

  test("heavy foliage: trees all along the fairway", () => {
    const doc = make([[{ x: 100, y: 500 }, { x: 460, y: 500 }]]);
    expect(holeStats(doc, doc.holes[0]).foliage).toBe("light");
    for (let x = 120, i = 0; x < 460; x += 50, i++) doc.items.push(createTree({ x, y: 500 + (i % 2 ? 3 : -9) }, { radius: 6 }));
    const s = holeStats(doc, doc.holes[0]);
    expect(s.foliage).toBe("heavy");
    expect(s.treesInFairway).toBeGreaterThanOrEqual(6);
    expect(s.treesOnLine).toBeGreaterThan(0);
  });

  test("OB the line crosses, and OB next to the basket", () => {
    const doc = make([[{ x: 100, y: 500 }, { x: 500, y: 500 }]]);
    doc.items.push(createArea("ob", [{ x: 250, y: 450 }, { x: 300, y: 450 }, { x: 300, y: 550 }, { x: 250, y: 550 }]));
    let s = holeStats(doc, doc.holes[0]);
    expect(s.obCrossed).toBe(1);
    expect(s.obInPlay).toBe(true);
    expect(s.obNearBasket).toBe(false);
    doc.items.push(createLine("ob", [{ x: 520, y: 400 }, { x: 520, y: 600 }]));
    s = holeStats(doc, doc.holes[0]);
    expect(s.obNearBasket).toBe(true);
  });

  test("course totals: length, par, walking between holes", () => {
    const doc = make([[{ x: 100, y: 100 }, { x: 400, y: 100 }], [{ x: 450, y: 100 }, { x: 450, y: 400 }]]);
    const t = courseTotals(doc);
    expect(t.complete).toBe(2);
    expect(t.par).toBe(6);
    expect(Math.round(t.length)).toBe(600);
    expect(Math.round(t.walk)).toBe(50);
  });
});

test.describe("safety and design checks", () => {
  test("crossing throw lines are dangerous", () => {
    const doc = make([[{ x: 100, y: 300 }, { x: 500, y: 300 }], [{ x: 300, y: 100 }, { x: 300, y: 500 }]]);
    const issues = safetyIssues(doc);
    expect(issues.some(i => i.level === "danger" && /cross/.test(i.text))).toBe(true);
  });

  test("parallel holes too close: a warning with the gap; far enough: none", () => {
    const close = make([[{ x: 100, y: 300 }, { x: 500, y: 300 }], [{ x: 500, y: 340 }, { x: 100, y: 340 }]]);
    const near = safetyIssues(close).find(i => /apart/.test(i.text));
    expect(near?.text).toMatch(/40 ft apart \(60 ft recommended\)/);
    const far = make([[{ x: 100, y: 300 }, { x: 500, y: 300 }], [{ x: 500, y: 450 }, { x: 100, y: 450 }]]);
    expect(safetyIssues(far).some(i => /apart/.test(i.text))).toBe(false);
    // A set safe distance is used instead
    far.rules.safetyGapFt = 200;
    expect(safetyIssues(far).some(i => /apart \(200 ft recommended\)/.test(i.text))).toBe(true);
  });

  test("throwing across a road or a path, and over a parking lot", () => {
    const doc = make([[{ x: 100, y: 300 }, { x: 500, y: 300 }]]);
    doc.items.push(createLine("road", [{ x: 300, y: 100 }, { x: 300, y: 500 }]));
    doc.items.push(createArea("parking", [{ x: 380, y: 280 }, { x: 420, y: 280 }, { x: 420, y: 320 }, { x: 380, y: 320 }]));
    const t = safetyIssues(doc).map(i => i.text).join("\n");
    expect(t).toMatch(/throws across a road/);
    expect(t).toMatch(/throws over a parking lot/);
  });

  test("small tee pads, a tree right in front of a tee, too short a hole", () => {
    const doc = make([[{ x: 100, y: 300 }, { x: 180, y: 300 }]]);
    const tee = doc.items.find(i => i.type === "tee")! as any;
    tee.padWidth = 3;
    doc.items.push(createTree({ x: 118, y: 302 }, { radius: 6 }));
    const t = designChecks(doc, doc.holes.map(h => holeStats(doc, h))).map(i => i.text).join("\n");
    expect(t).toMatch(/at least 4 x 10 ft/);
    expect(t).toMatch(/tree stands within 20 ft in front/);
    expect(t).toMatch(/shorter than the 100 ft minimum/);
  });

  test("the shortest tee over water, and a long walk to the next tee", () => {
    const doc = make([[{ x: 100, y: 300 }, { x: 500, y: 300 }], [{ x: 1000, y: 800 }, { x: 1300, y: 800 }]]);
    doc.items.push(createArea("water", [{ x: 250, y: 250 }, { x: 320, y: 250 }, { x: 320, y: 350 }, { x: 250, y: 350 }]));
    const t = safetyIssues(doc).map(i => i.text).join("\n");
    expect(t).toMatch(/shortest tee throws over water/);
    expect(t).toMatch(/Long walk from Hole 1's basket to Hole 2's tee/);
  });
});

test.describe("geometry", () => {
  test("a fairway corridor holds its line and has the width asked for", () => {
    const line = [{ x: 0, y: 0 }, { x: 300, y: 0 }];
    const poly = corridor(line, 40);
    expect(pointInPolygon({ x: 150, y: 19 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 21 }, poly)).toBe(false);
    expect(pointInPolygon({ x: -15, y: 0 }, poly)).toBe(true); // round end
  });

  test("a smoothed line goes through its points and is a little longer", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 0 }];
    const s = smoothPath(pts, 10);
    expect(s[0]).toEqual(pts[0]);
    expect(s[s.length - 1]).toEqual(pts[2]);
    expect(s.some(p => Math.hypot(p.x - 100, p.y - 100) < 0.01)).toBe(true);
    expect(pathLength(s)).toBeGreaterThan(pathLength(pts) * 0.98);
  });
});

test("what counts as OB: water unless marked otherwise; a road or fence only when marked", () => {
  const doc = make([[{ x: 100, y: 500 }, { x: 500, y: 500 }]]);
  // A road across the hole: not OB until marked
  const road = createLine("road", [{ x: 300, y: 200 }, { x: 300, y: 800 }]);
  doc.items.push(road);
  expect(isOb(road)).toBe(false);
  expect(holeStats(doc, doc.holes[0]).obCrossed).toBe(0);
  road.ob = true;
  expect(isOb(road)).toBe(true);
  expect(holeStats(doc, doc.holes[0]).obCrossed).toBe(1);
  // Water is OB unless set otherwise
  const pond = createArea("water", [{ x: 380, y: 450 }, { x: 420, y: 450 }, { x: 420, y: 550 }, { x: 380, y: 550 }]);
  doc.items.push(pond);
  expect(isOb(pond)).toBe(true);
  expect(holeStats(doc, doc.holes[0]).obCrossed).toBe(2);
  pond.ob = false;
  expect(isOb(pond)).toBe(false);
  expect(holeStats(doc, doc.holes[0]).obCrossed).toBe(1);
  // A creek is too
  const creek = createLine("stream", [{ x: 200, y: 200 }, { x: 200, y: 800 }]);
  expect(isOb(creek)).toBe(true);
  creek.ob = false;
  expect(isOb(creek)).toBe(false);
});

test("a fairway shaped along the hole: wider at a landing zone, pinched at a gap, smooth in between", () => {
  const hole = { ...newHole(), fairwayWidth: 30 };
  const even = fairwayWidthAt(hole);
  expect(even(0)).toBe(30);
  expect(even(0.5)).toBe(30);
  hole.fairwayShape = [1, 2.5, 0.6, 1];
  const w = fairwayWidthAt(hole);
  expect(w(FAIRWAY_STATIONS[1])).toBeCloseTo(75, 5);
  expect(w(FAIRWAY_STATIONS[2])).toBeCloseTo(18, 5);
  expect(w(0)).toBe(30);
  expect(w(1)).toBe(30);
  // In between: between its neighbours
  const mid = w((FAIRWAY_STATIONS[1] + FAIRWAY_STATIONS[2]) / 2);
  expect(mid).toBeGreaterThan(18);
  expect(mid).toBeLessThan(75);
  // The outline is as wide as the shape says, where it says (along a straight 400 ft line, its
  // edges sit beside the line's own points)
  const line = Array.from({ length: 101 }, (_, i) => ({ x: i * 4, y: 0 }));
  const poly = fairwayOutline(hole, line, 0, 8);
  const across = (x: number) => { const ys = poly.filter(p => Math.abs(p.x - x) < 1e-6).map(p => p.y); return Math.max(...ys) - Math.min(...ys); };
  expect(across(160)).toBeCloseTo(75, 0);
  expect(across(260)).toBeCloseTo(18, 0);
  // A straight hole is just its tee and basket: the outline still follows the shape between them
  const plain = fairwayOutline(hole, [{ x: 0, y: 0 }, { x: 400, y: 0 }], 0, 8);
  const top = (x: number) => Math.max(...plain.filter(p => Math.abs(p.x - x) < 1e-6).map(p => p.y));
  expect(top(160)).toBeCloseTo(37.5, 0);
  expect(top(260)).toBeCloseTo(9, 0);
});

test("a fairway wider on one side only: its middle moved off the line, the other edge kept", () => {
  // Line east along y = 0 (its left-hand normal points to +y); the first station 45 ft wide, all
  // of it gained on the +y side (the -y edge stays 15 ft off the line)
  const hole = { ...newHole(), fairwayWidth: 30, fairwayShape: [1.5, 1, 1, 1], fairwayShift: [0.25, 0, 0, 0] };
  const line = Array.from({ length: 101 }, (_, i) => ({ x: i * 4, y: 0 }));
  const poly = fairwayOutline(hole, line, 0, 8);
  const ys = (x: number) => poly.filter(p => Math.abs(p.x - x) < 0.5).map(p => p.y);
  expect(Math.max(...ys(60))).toBeCloseTo(30, 0);
  expect(Math.min(...ys(60))).toBeCloseTo(-15, 0);
  // Further on, centred again
  expect(Math.max(...ys(300))).toBeCloseTo(15, 0);
  expect(Math.min(...ys(300))).toBeCloseTo(-15, 0);
});
