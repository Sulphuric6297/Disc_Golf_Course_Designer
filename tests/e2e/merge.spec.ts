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
  expect(describeChanges(before, after)).toBe("Holes: 1 added · Features: 1 added");
  expect([...holesChanged(before, after)].sort()).toEqual(["b", "c"]);
  expect(describeChanges(before, before)).toBe("No changes");
});
