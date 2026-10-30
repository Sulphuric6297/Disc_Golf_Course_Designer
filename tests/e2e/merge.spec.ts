import { test, expect } from "@playwright/test";
import { changesBetween, describeChanges, holesChanged } from "../../src/lib/merge";

// What changed between two versions of a course (pure logic)
const hole = (id: string, x = 0, name = "") => ({ id, name, tee: { x, y: 0 } });
const doc = (holes: object[], items: object[] = [], style: object = { theme: "forest" }) => ({ name: "Springfield Park", holes, items, layouts: [], style, background: null });

test("what changed, counted", () => {
  const c = changesBetween(doc([hole("a"), hole("b")], [{ id: "x" }]), doc([hole("a", 1), hole("c")], [{ id: "x" }, { id: "y" }], { theme: "classic" }));
  expect(c.holes).toEqual({ added: 1, removed: 1, changed: 1 });
  expect(c.items).toEqual({ added: 1, removed: 0, changed: 0 });
  expect(c.other).toEqual(["style"]);
});

test("a version's name from what changed; the holes that changed (a moved basket counts)", () => {
  const before = doc([hole("a"), hole("b")], [{ id: "t", type: "tee", holeId: "a", x: 0 }, { id: "k", type: "basket", holeId: "b", x: 0 }]);
  const after = doc([hole("a"), hole("b"), hole("c")], [{ id: "t", type: "tee", holeId: "a", x: 0 }, { id: "k", type: "basket", holeId: "b", x: 9 }, { id: "z", type: "tree" }]);
  expect(describeChanges(before, after)).toBe("Holes: 1 added, 1 changed · On the map: 1 added");
  expect([...holesChanged(before, after)].sort()).toEqual(["b", "c"]);
  expect(describeChanges(before, before)).toBe("No changes");
});

test("only tees and baskets moved: changes all the same", () => {
  const before = doc([hole("a"), hole("b")], [{ id: "t", type: "tee", holeId: "a", x: 0 }, { id: "k", type: "basket", holeId: "a", x: 0 }, { id: "u", type: "tee", holeId: "b", x: 0 }]);
  // (both of hole a's moved: one change; a tee added to hole b: another)
  const after = doc([hole("a"), hole("b")], [{ id: "t", type: "tee", holeId: "a", x: 5 }, { id: "k", type: "basket", holeId: "a", x: 9 }, { id: "u", type: "tee", holeId: "b", x: 0 }, { id: "v", type: "tee", holeId: "b", x: 3 }]);
  expect(changesBetween(before, after).holes).toEqual({ added: 0, removed: 0, changed: 2 });
  expect(describeChanges(before, after)).toBe("Holes: 2 changed");
  // (a pin taken out counts too)
  const fewer = doc([hole("a"), hole("b")], [{ id: "t", type: "tee", holeId: "a", x: 0 }, { id: "u", type: "tee", holeId: "b", x: 0 }]);
  expect(describeChanges(before, fewer)).toBe("Holes: 1 changed");
});

test("one ground for the park: a course takes another's ground where they overlap, its own elsewhere; its holes as they are (pure logic)", async () => {
  const { withGround } = await import("../../src/lib/sharedGround");
  const site = (west: number) => ({ location: null, bounds: { north: 40, south: 39.99, west, east: west + 0.01 }, baseElevationFt: 100 });
  const from = { name: "A", holes: [], items: [], canvas: { width: 100, height: 100 }, gridSize: 50, site: site(-89), terrainHeights: { "0,0": 7, "50,0": 7, "100,0": 7, "0,50": 7, "50,50": 7, "100,50": 7, "0,100": 7, "50,100": 7, "100,100": 7 }, lidar: { source: "USGS 2017", trees: [[25, 25, 40, 10, 0]] } } as any;
  // (B's site starts halfway across A's)
  const to = { name: "B", holes: [{ id: "h" }], items: [{ id: "x" }], canvas: { width: 100, height: 100 }, gridSize: 50, site: { ...site(-88.995), baseElevationFt: 98 }, terrainHeights: { "0,0": 1, "100,0": 1 } } as any;
  const out = withGround(to, from, true);
  expect(out.terrainHeights["0,0"]).toBe(9);
  expect(out.terrainHeights["100,0"]).toBe(1);
  expect(out.holes).toEqual(to.holes);
  expect(out.items).toEqual(to.items);
  expect(out.lidar.trees).toEqual([]);
  const back = withGround(from, to, true);
  // (none measured there: this one keeps its own)
  expect(back.lidar).toEqual(from.lidar);
});

test("one ground for the park: each course's own tree decisions stay its own (pure logic)", async () => {
  const { withGround } = await import("../../src/lib/sharedGround");
  const site = { location: null, bounds: { north: 40, south: 39.99, west: -89, east: -88.99 }, baseElevationFt: 100 };
  const base = { holes: [], items: [], canvas: { width: 100, height: 100 }, gridSize: 50, site, terrainHeights: {} };
  // A cut tree 0 down and kept tree 1 (on its fairway); B, framed the same, cut tree 1 down and kept tree 2
  const from = { ...base, name: "A", lidar: { source: "USGS 2017", trees: [[10, 10, 40, 10, 0], [20, 20, 50, 12, 0], [30, 30, 60, 14, 1]], removed: [0], kept: [1] } } as any;
  const to = { ...base, name: "B", lidar: { source: "old", trees: [[20.4, 19.8, 45, 11, 0], [30, 30, 55, 13, 1], [90, 90, 20, 5, 0]], removed: [0], kept: [1] } } as any;
  const out = withGround(to, from, true);
  expect(out.lidar.trees).toHaveLength(3);
  expect(out.lidar.removed).toEqual([1]);
  expect(out.lidar.kept).toEqual([2]);
  expect(out.lidar.removed).not.toContain(0);
});

test("one ground for the park: the trees planted by hand come across; one cut down on a course stays cut there (pure logic)", async () => {
  const { withGround } = await import("../../src/lib/sharedGround");
  const site = { location: null, bounds: { north: 40, south: 39.99, west: -89, east: -88.99 }, baseElevationFt: 100 };
  const tree = (id: string, x: number) => ({ id, type: "tree", x, y: 50, rotation: 0, radius: 12, color: "#1a5" });
  const from = { name: "A", holes: [], items: [tree("t1", 10), tree("t2", 20), { id: "ob", type: "area", kind: "ob", x: 0, y: 0, rotation: 0, points: [] }], canvas: { width: 100, height: 100 }, gridSize: 50, site, terrainHeights: {} } as any;
  const to = { name: "B", holes: [], items: [], canvas: { width: 100, height: 100 }, gridSize: 50, site, terrainHeights: {} } as any;
  const once = withGround(to, from, { trees: false, planted: true });
  expect(once.items.map((i: any) => i.id)).toEqual(["t1", "t2"]);
  expect(once.site.sharedTrees).toEqual(["t1", "t2"]);
  // B cuts t1 down (it's on B's fairway); A shares the ground again: t1 stays cut on B, t2 stands
  const cut = { ...once, items: once.items.filter((i: any) => i.id !== "t1") };
  const again = withGround(cut, from, { trees: false, planted: true });
  expect(again.items.map((i: any) => i.id)).toEqual(["t2"]);
  // A cuts t2 down: B keeps its own
  const aCut = { ...from, items: from.items.filter((i: any) => i.id !== "t2") };
  expect(withGround(cut, aCut, { trees: false, planted: true }).items.map((i: any) => i.id)).toEqual(["t2"]);
});

test("one ground for the park: the taking course keeps its own measured trees where the other doesn't reach (pure logic)", async () => {
  const { withGround } = await import("../../src/lib/sharedGround");
  const site = (west: number) => ({ location: null, bounds: { north: 40, south: 39.99, west, east: west + 0.01 }, baseElevationFt: 100 });
  const from = { name: "A", holes: [], items: [], canvas: { width: 100, height: 100 }, gridSize: 50, site: site(-89), terrainHeights: {}, lidar: { source: "s", trees: [[25, 25, 40, 10, 0]] } } as any;
  // (B's site starts halfway across A's: its tree at x=90 is past A's edge, its tree at x=10 is on A)
  const to = { name: "B", holes: [], items: [], canvas: { width: 100, height: 100 }, gridSize: 50, site: site(-88.995), terrainHeights: {}, lidar: { source: "old", trees: [[90, 50, 30, 8, 0], [10, 50, 30, 8, 1]], removed: [0] } } as any;
  const out = withGround(to, from, true);
  expect(out.lidar.trees).toContainEqual([90, 50, 30, 8, 0]);
  expect(out.lidar.trees.some((t: number[]) => t[0] === 10 && t[4] === 1)).toBe(false);
  expect(out.lidar.removed).toEqual([out.lidar.trees.findIndex((t: number[]) => t[0] === 90)]);
});
