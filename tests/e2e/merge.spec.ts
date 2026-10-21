import { test, expect } from "@playwright/test";
import { changesBetween, mergeCourse } from "../../src/lib/merge";

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
  expect(clashes).toEqual(["Hole 2"]);
});

test("a hole removed in the draft but changed meanwhile: removed, and listed", () => {
  const base = doc([hole("a"), hole("b")]);
  const theirs = doc([hole("a"), hole("b", 5, "Long one")]);
  const mine = doc([hole("a")]);
  const { doc: out, clashes } = mergeCourse(base, theirs, mine);
  expect(out.holes.map(h => h.id)).toEqual(["a"]);
  expect(clashes).toEqual(["Long one"]);
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
  expect(clashes).toEqual(["the map's style", "2 features"]);
});

test("what a draft changes, counted", () => {
  const c = changesBetween(doc([hole("a"), hole("b")], [{ id: "x" }]), doc([hole("a", 1), hole("c")], [{ id: "x" }, { id: "y" }], { theme: "classic" }));
  expect(c.holes).toEqual({ added: 1, removed: 1, changed: 1 });
  expect(c.items).toEqual({ added: 1, removed: 0, changed: 0 });
  expect(c.other).toEqual(["style"]);
});
