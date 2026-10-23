// Pure-logic tests (no browser page) for the hole and course numbers and the checks.
import { test, expect } from "@playwright/test";
import { FAIRWAY_STATIONS, areaPath, createArea, createBasket, createEmptyCourse, createLine, createTee, createTree, fairwayOutline, fairwayWidthAt, linePath, closestHole, mergeStretches, newHole, normalizeCourse, obPieces, obSides, withoutStretch } from "../../src/lib/course";
import { corridor, lengthInside, pathLength, pathTouchesPolygon, pointInPolygon, smoothPath } from "../../src/lib/geom";
import { courseIssues, courseStats, courseTotals, designChecks, holeStats, isOb, openIssues, parForDistance, safetyIssues } from "../../src/lib/holeStats";
import type { CourseDoc, P, TeeLevel } from "../../src/types";
import { renderPoster } from "../../src/lib/mapSvg";
import { autoRules, renderScorecard } from "../../src/lib/teeSign";
const plainPar = expect;

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

test("a road OB along a stretch of it, or OB and beyond: in play only there, said on the tee sign, drawn on the hole's side", () => {
  // A hole running east, a road 10 ft south of its line, 1,000 ft long
  const doc = make([[{ x: 300, y: 300 }, { x: 700, y: 300 }]]);
  const road = createLine("road", [{ x: 0, y: 310 }, { x: 1000, y: 310 }]);
  road.ob = true;
  doc.items.push(road);
  expect(holeStats(doc, doc.holes[0]).obInPlay).toBe(true);
  // Only a stretch far down the road: not in play
  road.obStretches = [[0.85, 1]];
  const [far] = obPieces(road);
  expect(far[0].x).toBeCloseTo(850, 3);
  expect(far[far.length - 1].x).toBeCloseTo(1000, 3);
  expect(holeStats(doc, doc.holes[0]).obInPlay).toBe(false);
  // A stretch beside the hole: in play again
  road.obStretches = [[0.4, 0.6]];
  expect(holeStats(doc, doc.holes[0]).obInPlay).toBe(true);
  // Stretches put in order, overlapping ones joined, next to nothing left out
  expect(mergeStretches([[0.6, 0.4], [0.5, 0.7], [0.9, 0.9005]])).toEqual([[0.4, 0.7]]);
  // The hole is north of the road: left of it, as it runs east
  expect(obSides(obPieces(road)[0], [holeStats(doc, doc.holes[0]).line])).toEqual([-1]);
  expect(obSides(obPieces(road)[0], [])).toEqual([1, -1]);
  // On the tee sign
  expect(autoRules(doc, doc.holes[0].id)).toContain("Road is OB.");
  road.obBeyond = true;
  expect(autoRules(doc, doc.holes[0].id)).toContain("Road and beyond is OB.");
  road.obStretches = [[0.85, 1]];
  expect(autoRules(doc, doc.holes[0].id).join(" ")).not.toContain("Road");
  road.obStretches = [[0.3, 0.7]];
  // The printed map: one red edge, along the stretch only, on the hole's side of the road
  const svg = renderPoster(doc, { contours: null, hillshade: null }).svg;
  const edges = [...svg.matchAll(new RegExp(`<path d="([^"]+)" fill="none" stroke="${doc.style.ob}" stroke-width="[^"]+" stroke-linejoin`, "g"))].map(m => [...m[1].matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(c => ({ x: +c[1], y: +c[2] })));
  expect(edges).toHaveLength(1);
  for (const p of edges[0]) {
    expect(p.x).toBeGreaterThan(290);
    expect(p.x).toBeLessThan(710);
    expect(p.y).toBeLessThan(310);
  }
  // (with ticks into the road)
  expect(svg).toMatch(new RegExp(`stroke="${doc.style.ob}" stroke-width="[^"]+" stroke-linecap="round" opacity`));
  // Opened from a file: stretches that aren't pairs of numbers left out
  const back = normalizeCourse({ ...doc, items: [{ ...road, obStretches: [[0.2, "x"], [0.5, 0.3], 7] as any }] });
  expect((back.items[0] as any).obStretches).toEqual([[0.3, 0.5]]);
});

test("OB and beyond for the holes picked: drawn on their side (one side when none are picked, with holes either side), in play and on the tee sign only for them", () => {
  // Hole 1 running east 10 ft north of a road; hole 2 across the road, from 35 ft south of it
  const doc = make([[{ x: 300, y: 300 }, { x: 700, y: 300 }], [{ x: 500, y: 345 }, { x: 500, y: 700 }]]);
  const road = createLine("road", [{ x: 0, y: 310 }, { x: 1000, y: 310 }]);
  road.ob = true;
  road.obBeyond = true;
  doc.items.push(road);
  const [h1, h2] = doc.holes;
  const piece = obPieces(road)[0], line = (h: typeof h1) => holeStats(doc, h).line;
  // Each hole's side (hole 1 left of it, as it runs east); the one running along it is the closest
  expect(obSides(piece, [line(h1), line(h2)])).toEqual([-1, 1]);
  expect(obSides(piece, [line(h1), line(h2)], 300, true)).toEqual([-1]);
  expect(closestHole(piece, doc.holes.map(h => ({ id: h.id, line: line(h) })))).toBe(h1.id);
  const edges = () => [...renderPoster(doc, { contours: null, hillshade: null }).svg.matchAll(new RegExp(`<path d="([^"]+)" fill="none" stroke="${doc.style.ob}" stroke-width="[^"]+" stroke-linejoin`, "g"))].map(m => [...m[1].matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(c => ({ x: +c[1], y: +c[2] })));
  // None picked: one edge, on the side of the hole running along it (not one each side)
  expect(edges()).toHaveLength(1);
  expect(edges()[0].every(p => p.y < 310)).toBe(true);
  expect(autoRules(doc, h2.id)).toContain("Road and beyond is OB.");
  // For hole 2 only: its side; in play and on the tee sign for it, not for hole 1
  road.obHoles = [h2.id];
  expect(edges()).toHaveLength(1);
  expect(edges()[0].every(p => p.y > 310)).toBe(true);
  expect(autoRules(doc, h2.id)).toContain("Road and beyond is OB.");
  expect(autoRules(doc, h1.id).join(" ")).not.toContain("Road");
  expect(holeStats(doc, h1).obInPlay).toBe(false);
  road.obHoles = [h1.id];
  expect(holeStats(doc, h1).obInPlay).toBe(true);
  // Both picked: an edge on each side
  road.obHoles = [h1.id, h2.id];
  expect(edges()).toHaveLength(2);
  // From a file: holes no longer on the course left out
  expect((normalizeCourse({ ...doc, items: [{ ...road, obHoles: ["gone", h2.id] }] }).items[0] as any).obHoles).toEqual([h2.id]);
  expect((normalizeCourse({ ...doc, items: [{ ...road, obHoles: ["gone"] }] }).items[0] as any).obHoles).toBeUndefined();
});

test("a stretch taken out of a line: the pieces either side (the first keeping its id), each with its share of the OB stretches and a creek's widths; at an end, only shorter", () => {
  const road = createLine("road", [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 }]);
  road.straight = true;
  road.ob = true;
  road.obStretches = [[0.1, 0.3], [0.6, 0.9]];
  road.label = "Park Rd";
  const [a, b] = withoutStretch(road, 0.4, 0.5, () => "new");
  expect(a.id).toBe(road.id);
  expect(b.id).toBe("new");
  expect(a.points).toEqual([{ x: 0, y: 0 }, { x: 400, y: 0 }]);
  expect(b.points).toEqual([{ x: 500, y: 0 }, { x: 1000, y: 0 }]);
  expect(a.label).toBe("Park Rd");
  // (OB 100 to 300 ft of the first 400; 600 to 900 of the last 500 from 500 ft)
  expect(a.obStretches).toEqual([[0.25, 0.75]]);
  expect(b.obStretches).toEqual([[0.2, 0.8]]);
  // A piece along none of its OB stretches isn't OB
  const [c] = withoutStretch(road, 0.5, 1);
  expect(c.points).toEqual([{ x: 0, y: 0 }, { x: 500, y: 0 }]);
  const [d] = withoutStretch(road, 0, 0.55);
  expect(d.points[0]).toEqual({ x: 550, y: 0 });
  expect(d.obStretches).toEqual([[1 / 9, 7 / 9].map(v => Math.round(v * 10000) / 10000) as [number, number]]);
  road.obStretches = [[0.6, 0.9]];
  const [e] = withoutStretch(road, 0.5, 1);
  expect(e.ob).toBeUndefined();
  // Nothing left: no pieces
  expect(withoutStretch(road, 0, 1)).toEqual([]);
  // A creek wider at its end keeps its widths along each piece
  const creek = createLine("stream", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
  creek.straight = true;
  creek.widths = [1, 1, 3];
  const [f, g] = withoutStretch(creek, 0.25, 0.75);
  expect(f.widths).toEqual([1, 1]);
  expect(g.widths).toEqual([2, 3]);
});

test("a hole with two numbers (3/4) is played twice: the course's par, length and holes count it twice, the scorecard has both", () => {
  const doc = make([[{ x: 100, y: 300 }, { x: 400, y: 300 }], [{ x: 100, y: 500 }, { x: 400, y: 500 }], [{ x: 100, y: 700 }, { x: 400, y: 700 }]]);
  doc.holes[2].alsoNumbers = [4];
  const t = courseTotals(doc);
  const one = holeStats(doc, doc.holes[0]);
  plainPar(t.complete).toBe(4);
  plainPar(t.par).toBe(one.par * 4);
  plainPar(Math.round(t.length)).toBe(Math.round(one.length * 4));
  // The title's layout chip and the scorecard
  const poster = renderPoster(doc, { contours: null, hillshade: null }).svg;
  plainPar(poster).toContain(`PAR ${one.par * 4}`);
  const card = renderScorecard(doc).svg;
  for (const n of [">1<", ">2<", ">3<", ">4<"]) plainPar(card).toContain(n);
  plainPar(card).not.toContain(">3/4<");
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

  test("each check keeps its id as the course changes, and checks set aside are left out", () => {
    const doc = make([[{ x: 100, y: 300 }, { x: 500, y: 300 }], [{ x: 500, y: 340 }, { x: 100, y: 340 }]]);
    const near = safetyIssues(doc).find(i => /apart/.test(i.text))!;
    // (the second hole moved a little: another gap in its text, the same check)
    const moved = { ...doc, items: doc.items.map((it, k) => (k >= 2 ? { ...it, y: 330 } : it)) as CourseDoc["items"] };
    const again = safetyIssues(moved).find(i => /apart/.test(i.text))!;
    expect(again.text).not.toBe(near.text);
    expect(again.id).toBe(near.id);
    const ids = safetyIssues(doc).map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Set aside: out of the open checks, in the ignored ones
    const { open, ignored } = openIssues({ ignoredChecks: [near.id] }, safetyIssues(doc));
    expect(open.some(i => i.id === near.id)).toBe(false);
    expect(ignored.map(i => i.id)).toEqual([near.id]);
    expect(openIssues({}, safetyIssues(doc)).open).toHaveLength(ids.length);
  });

  test("a check between two holes keeps its id whichever order the holes are in (and one set aside before stays aside)", () => {
    const doc = make([[{ x: 100, y: 300 }, { x: 500, y: 300 }], [{ x: 300, y: 100 }, { x: 300, y: 500 }]]);
    const cross = safetyIssues(doc).find(i => /cross/.test(i.text))!;
    const turned = { ...doc, holes: [...doc.holes].reverse() };
    expect(safetyIssues(turned).find(i => /cross/.test(i.text))!.id).toBe(cross.id);
    // (ignored with the holes the other way round)
    const [, a, b] = cross.id.split(":");
    const { open, ignored } = openIssues({ ignoredChecks: [`cross:${b}:${a}`] }, safetyIssues(turned));
    expect(open.some(i => /cross/.test(i.text))).toBe(false);
    expect(ignored).toHaveLength(1);
  });

  test("holes to one basket wait on each other: no alarms between them; a third hole still counts", () => {
    const doc = make([[{ x: 100, y: 300 }, { x: 400, y: 300 }], [{ x: 400, y: 0 }, { x: 400, y: 300 }], [{ x: 250, y: 100 }, { x: 250, y: 500 }]]);
    // (the second one bent across the first's line, its tee by the first's line)
    doc.holes[1].doglegs = [{ x: 150, y: 450 }];
    const t = safetyIssues(doc).filter(i => i.holes.length === 2 && !i.holes.includes(doc.holes[2].id)).map(i => i.text);
    expect(t).toEqual([]);
    expect(safetyIssues(doc).some(i => /Hole 1 and Hole 3: the throw lines cross/.test(i.text))).toBe(true);
  });

  test("curved OB, water and roads count where they are drawn, not their corners", () => {
    // An OB triangle drawn curved bulges out past its straight bottom edge (y 200)
    const tri = [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 300, y: 373 }];
    expect(Math.min(...areaPath({ kind: "ob", points: tri }).map(p => p.y))).toBeLessThan(185);
    const doc = make([[{ x: 100, y: 190 }, { x: 500, y: 190 }]]);
    doc.items.push(createArea("ob", tri));
    expect(holeStats(doc, doc.holes[0]).obCrossed).toBe(1);
    const straight = { ...doc, items: doc.items.map(i => (i.type === "area" ? { ...i, straight: true } : i)) };
    expect(holeStats(straight, straight.holes[0]).obCrossed).toBe(0);
    // An OB line round a corner swings out past its points; a hole ending between the two
    const corner = [{ x: 100, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 600 }];
    const curve = linePath({ kind: "ob", points: corner });
    const q = curve.reduce((m, p) => (p.y < m.y ? p : m));
    expect(q.y).toBeLessThan(290);
    const lined = make([[{ x: q.x + 1, y: q.y - 250 }, { x: q.x + 1, y: (q.y + 300) / 2 }]]);
    lined.items.push(createLine("ob", corner));
    expect(holeStats(lined, lined.holes[0]).obCrossed).toBe(1);
    // A road drawn curved across the line of fire
    const road = make([[{ x: q.x + 1, y: q.y - 250 }, { x: q.x + 1, y: (q.y + 300) / 2 }]]);
    road.items.push(createLine("road", corner));
    expect(safetyIssues(road).some(i => /across a road/.test(i.text))).toBe(true);
    // The printed map draws an OB line as its curve
    const svg = renderPoster(lined, { contours: null, hillshade: null }).svg;
    expect(svg).not.toContain('d="M100 300L400 300L400 600"');
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

  test("no path from one hole to the next: said, until paths that meet lead there; holes close together need none", () => {
    const doc = make([[{ x: 100, y: 300 }, { x: 500, y: 300 }], [{ x: 800, y: 600 }, { x: 1100, y: 600 }], [{ x: 1150, y: 650 }, { x: 1400, y: 650 }]]);
    const noPath = (d: CourseDoc) => safetyIssues(d).filter(i => i.id.startsWith("no-path:")).map(i => i.text);
    // (hole 2's basket and hole 3's tee 71 ft apart: no path needed)
    expect(noPath(doc)).toEqual(["No path from Hole 1's basket to Hole 2's tee. Draw one with the Line tool so players can find the next hole."]);
    // Two paths that meet: from near the basket, then on to near the tee
    doc.items.push(createLine("path", [{ x: 520, y: 320 }, { x: 650, y: 450 }]), createLine("walk", [{ x: 660, y: 455 }, { x: 790, y: 590 }]));
    expect(noPath(doc)).toEqual([]);
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

test("the course length check counts a two-number hole twice", () => {
  // Nine 100 ft holes, one of them played twice
  const doc = make(Array.from({ length: 9 }, (_, k): [P, P] => [{ x: 100, y: 100 + k * 150 }, { x: 200, y: 100 + k * 150 }]));
  doc.holes[0].alsoNumbers = [10];
  const checks = [...safetyIssues(doc), ...designChecks(doc, doc.holes.map(h => holeStats(doc, h)))];
  expect(checks.find(i => i.id === "course-length")?.text).toMatch(/^10 holes total 1,000 ft/);
});

test("an OB line belonging to two holes counts for both (and for neither of the others)", () => {
  const doc = make([[{ x: 0, y: 0 }, { x: 400, y: 0 }], [{ x: 0, y: 60 }, { x: 400, y: 60 }], [{ x: 0, y: 120 }, { x: 400, y: 120 }]]);
  const [h1, h2, h3] = doc.holes;
  // Across all three holes' lines
  const ob = createLine("ob", [{ x: 200, y: -50 }, { x: 200, y: 170 }]);
  doc.items.push({ ...ob, holeId: h1.id, alsoHoles: [h2.id] });
  const crossed = (h: typeof h1) => holeStats(doc, h).obCrossed;
  expect(crossed(h1)).toBe(1);
  expect(crossed(h2)).toBe(1);
  expect(crossed(h3)).toBe(0);
});

test("the course's numbers and checks are worked out once for each version of the course", () => {
  const doc = make([[{ x: 100, y: 500 }, { x: 400, y: 500 }], [{ x: 100, y: 540 }, { x: 400, y: 560 }], [{ x: 100, y: 900 }, { x: 400, y: 900 }]]);
  const stats = courseStats(doc);
  expect(courseStats(doc)).toBe(stats);
  expect(stats).toEqual(doc.holes.map(h => holeStats(doc, h)));
  expect(courseIssues(doc)).toBe(courseIssues(doc));
  expect(courseIssues(doc)).toEqual(safetyIssues(doc));
  expect(courseIssues(doc).filter(i => /apart/.test(i.text))).toHaveLength(1);
  // A changed course is worked out again
  const basket = doc.items.find(i => i.type === "basket" && i.holeId === doc.holes[1].id)!;
  const moved = { ...doc, items: doc.items.map(i => (i === basket ? { ...i, y: 300 } : i)) };
  expect(courseStats(moved)).not.toBe(stats);
  expect(Math.round(courseStats(moved)[1].length)).toBe(Math.round(Math.hypot(300, 240)));
  expect(courseIssues(moved).some(i => /cross/.test(i.text))).toBe(true);
});

test("shapes far from a line are passed over without changing what touches it", () => {
  const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  // left of the square, level with it (a ray to the right crosses it twice)
  expect(pathTouchesPolygon([{ x: -50, y: 20 }, { x: -10, y: 80 }], square)).toBe(false);
  // a long leg straight across, both ends far outside
  expect(pathTouchesPolygon([{ x: -500, y: 50 }, { x: 500, y: 50 }], square)).toBe(true);
  expect(pathTouchesPolygon([{ x: -500, y: 300 }, { x: -400, y: 300 }, { x: 50, y: 50 }], square)).toBe(true);
  expect(lengthInside([{ x: -500, y: 50 }, { x: 500, y: 50 }], square, 1)).toBeCloseTo(100, 0);
  expect(lengthInside([{ x: -500, y: 150 }, { x: 500, y: 150 }], square, 1)).toBe(0);
});
