import { test, expect } from "@playwright/test";
import { changesBetween, describeChanges, holesChanged, keepTheirs, mergeCourse } from "../../src/lib/merge";

// Putting a draft into a course that changed meanwhile (pure logic)
const hole = (id: string, x = 0, name = "") => ({ id, name, tee: { x, y: 0 } });
const doc = (holes: object[], items: object[] = [], style: object = { theme: "forest" }) => ({ name: "Springfield Park", holes, items, layouts: [], style, background: null });

test("what only one side changed is kept; both: the draft's, listed", () => {
  const base = doc([hole("a"), hole("b"), hole("c")], [{ id: "x", kind: "bench" }]);
  // The course meanwhile: b moved, d added, x removed, the style changed
  const theirs = doc([hole("a"), hole("b", 50), hole("c"), hole("d")], [], { theme: "classic" });
  // The draft: a moved, c removed, e added, and b moved too, elsewhere
  const mine = doc([hole("a", 10), hole("b", 90, "Hole 2"), hole("e")], [{ id: "x", kind: "bench" }]);
  const { doc: out, clashes } = mergeCourse(base, theirs, mine);
  // (a hole added meanwhile goes where it is in the course: after the draft's new one here)
  expect(out.holes.map(h => h.id)).toEqual(["a", "b", "e", "d"]);
  expect((out.holes.find(h => h.id === "a") as any).tee.x).toBe(10);
  expect((out.holes.find(h => h.id === "b") as any).tee.x).toBe(90);
  expect(out.items).toEqual([]);
  expect(out.style).toEqual({ theme: "classic" });
  expect(clashes.map(c => c.label)).toEqual(["Hole 2"]);
  // Keeping the course's for the clash: its b
  const kept = keepTheirs({ doc: out, clashes }, new Set([0]));
  expect((kept.holes.find(h => h.id === "b") as any).tee.x).toBe(50);
  expect((kept.holes.find(h => h.id === "a") as any).tee.x).toBe(10);
});

test("a hole removed in the draft but changed meanwhile: removed, and listed", () => {
  const base = doc([hole("a"), hole("b")]);
  const theirs = doc([hole("a"), hole("b", 5, "Long one")]);
  const mine = doc([hole("a")]);
  const { doc: out, clashes } = mergeCourse(base, theirs, mine);
  expect(out.holes.map(h => h.id)).toEqual(["a"]);
  expect(clashes.map(c => c.label)).toEqual(["Long one"]);
  expect(clashes[0].mine).toBeUndefined();
  // Keeping the course's: it comes back
  expect(keepTheirs({ doc: out, clashes }, new Set([0])).holes.map(h => h.id)).toEqual(["a", "b"]);
});

test("nothing changed meanwhile: the draft as it is; the photo never merged", () => {
  const base = doc([hole("a")]);
  const mine = { ...doc([hole("a", 3), hole("b")]), background: "data:image/png;base64,AA" };
  const { doc: out, clashes } = mergeCourse(base, base, mine);
  expect(out.holes).toEqual(mine.holes);
  expect(out.background).toBe("data:image/png;base64,AA");
  expect(clashes).toEqual([]);
});

test("the same part changed on both sides: the draft's, listed once per part", () => {
  const base = doc([], [{ id: "x", n: 1 }, { id: "y", n: 1 }], { theme: "forest" });
  const theirs = doc([], [{ id: "x", n: 2 }, { id: "y", n: 2 }], { theme: "classic" });
  const mine = doc([], [{ id: "x", n: 3 }, { id: "y", n: 3 }], { theme: "paper" });
  const { doc: out, clashes } = mergeCourse(base, theirs, mine);
  expect(out.items).toEqual(mine.items);
  expect(out.style).toEqual({ theme: "paper" });
  expect(clashes.map(c => c.label)).toEqual(["A feature", "A feature", "The map's style"]);
  expect(keepTheirs({ doc: out, clashes }, new Set([2])).style).toEqual({ theme: "classic" });
});

test("what a draft changes, counted", () => {
  const c = changesBetween(doc([hole("a"), hole("b")], [{ id: "x" }]), doc([hole("a", 1), hole("c")], [{ id: "x" }, { id: "y" }], { theme: "classic" }));
  expect(c.holes).toEqual({ added: 1, removed: 1, changed: 1 });
  expect(c.items).toEqual({ added: 1, removed: 0, changed: 0 });
  expect(c.other).toEqual(["style"]);
});

test("a version's name from what changed; the holes a draft changes (a moved basket counts)", () => {
  const before = doc([hole("a"), hole("b")], [{ id: "t", type: "tee", holeId: "a", x: 0 }, { id: "k", type: "basket", holeId: "b", x: 0 }]);
  const after = doc([hole("a"), hole("b"), hole("c")], [{ id: "t", type: "tee", holeId: "a", x: 0 }, { id: "k", type: "basket", holeId: "b", x: 9 }, { id: "z", type: "tree" }]);
  expect(describeChanges(before, after)).toBe("Holes: 1 added · On the map: 1 added");
  expect([...holesChanged(before, after)].sort()).toEqual(["b", "c"]);
  expect(describeChanges(before, before)).toBe("No changes");
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
