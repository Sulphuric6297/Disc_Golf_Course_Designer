import { devices } from "@playwright/test";
import { test, expect, blankCourse, course } from "./fixtures";

// The kinds of trees a course grows (lib/treeMix): picked in the map style's Trees part, the woods
// and measured trees growing only those; the kinds most common in the course's region (the US
// Forest Service's forest survey) to use in one tap; and a tree's own Species on a phone.

/** Every tree of every wood in the 3D view: its kind of shape and variant. */
const woodsTrees = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const out: { shape: string; variant: number }[] = [];
  (window as any).__dgView.scene.traverse((o: any) => { if (o.name === "woods" && o.userData.spots) for (const s of o.userData.spots) out.push({ shape: s.shape, variant: s.variant }); });
  return out;
});

/** A wood, then the Site step's Trees fold open. */
async function woodsAndTrees(page: import("@playwright/test").Page, place: { lat: number; lon: number; label: string }) {
  await blankCourse(page);
  await page.keyboard.press("Escape");
  await page.evaluate(p => {
    (window as any).__dgActions.site({ location: p });
    (window as any).__dgEditor().set({ areaKind: "woods", tool: "select" });
    (window as any).__dgActions.addDrawn("area", [{ x: 200, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 600 }, { x: 200, y: 600 }]);
    (window as any).__dgActions.select(null);
  }, place);
  await expect.poll(async () => (await woodsTrees(page)).length).toBeGreaterThan(50);
  await page.getByRole("button", { name: "1 Site" }).click();
  const fold = page.getByTestId("site-trees");
  if (!(await fold.evaluate(d => (d as HTMLDetailsElement).open))) await fold.locator("summary").click();
  // (the Map step's style has no kinds: the map draws each tree as the kind it is in 3D)
  return page.getByTestId("tree-kinds");
}
const chip = (kinds: import("@playwright/test").Locator, name: string) => kinds.getByRole("button", { name, exact: true });

test("a course near Seattle: the region's kinds offered and used; the woods grow only the kinds that are on", async ({ page }) => {
  const kinds = await woodsAndTrees(page, { lat: 47.61, lon: -122.33, label: "Seattle" });
  // At first: oak, ash and pine, and nothing saved
  await expect(chip(kinds, "Oak")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(kinds, "Spruce")).toHaveAttribute("aria-pressed", "false");
  expect((await course(page)).style.treeKinds).toBeUndefined();
  // The region: the Pacific Northwest, spruce first
  const region = page.getByTestId("tree-kinds-region");
  await expect(region).toContainText("the Pacific Northwest: spruce, pine");
  await region.getByRole("button", { name: "Use these" }).click();
  await expect.poll(async () => (await course(page)).style.treeKinds).toEqual(["oak", "pine", "tallpine", "spruce", "cedar"]);
  await expect(region).toContainText("In use.");
  // The woods grown again: spruces, cedars and tall pines among the needle trees (variants 4 to 9), every
  // leafy one an oak (0, 2, 4)
  await expect.poll(async () => (await woodsTrees(page)).some(s => s.shape === "conifer" && s.variant >= 4), { timeout: 20_000 }).toBe(true);
  expect((await woodsTrees(page)).filter(s => s.shape === "broadleaf").every(s => [0, 2, 4].includes(s.variant))).toBe(true);
  // No needle kinds on: no needle trees
  for (const k of ["Pine", "Tall pine", "Spruce", "Cedar"]) await chip(kinds, k).click();
  await expect.poll(async () => (await course(page)).style.treeKinds).toEqual(["oak"]);
  await expect.poll(async () => { const t = await woodsTrees(page); return t.length > 50 && t.every(s => s.shape === "broadleaf"); }, { timeout: 20_000 }).toBe(true);
  // The last kind stays on
  await chip(kinds, "Oak").click();
  expect((await course(page)).style.treeKinds).toEqual(["oak"]);
  await expect(chip(kinds, "Oak")).toHaveAttribute("aria-pressed", "true");
  // Back to oak, ash and pine: nothing saved again
  await chip(kinds, "Ash").click();
  await chip(kinds, "Pine").click();
  await expect.poll(async () => (await course(page)).style.treeKinds).toBeUndefined();
});

test("a course in the Carolina sandhills: the South's tall pines recommended", async ({ page }) => {
  await woodsAndTrees(page, { lat: 35.19, lon: -79.47, label: "Pinehurst" });
  await expect(page.getByTestId("tree-kinds-region")).toContainText("the Southeast: maple, oak, tall pine");
});

test("outside the US: the kinds to pick, no region's", async ({ page }) => {
  const kinds = await woodsAndTrees(page, { lat: 51.5, lon: -0.12, label: "London" });
  await expect(chip(kinds, "Weeping willow")).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("tree-kinds-region")).toHaveCount(0);
});

test("the Trees tool plants one species: a Bradford pear, then a stand of them, which grows only pears and says so in its panel", async ({ page }) => {
  await blankCourse(page);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).__dgEditor().set({ tool: "add-tree", treeKind: "deciduous", standOf: null }));
  const row = page.getByTestId("tree-species");
  await expect(row.getByRole("radio", { name: "Any kind" })).toHaveAttribute("aria-checked", "true");
  await expect(row.getByRole("radio", { name: "Spruce" })).toHaveCount(0);
  await row.getByRole("radio", { name: "Bradford pear" }).click();
  await page.evaluate(() => (window as any).__dgActions.placeAt("add-tree", { x: 900, y: 300 }));
  expect((await course(page)).items.find((i: any) => i.type === "tree").species).toBe("pear");
  // A stand of them: a wood of only pears
  await page.getByTestId("draw-shape-box").click();
  const id = await page.evaluate(() => {
    (window as any).__dgActions.addDrawn("area", [{ x: 200, y: 400 }, { x: 700, y: 400 }, { x: 700, y: 750 }, { x: 200, y: 750 }]);
    const d = (window as any).__dgCourse();
    return d.items[d.items.length - 1].id;
  });
  const wood = (await course(page)).items.find((i: any) => i.id === id);
  expect([wood.kind, wood.pines, wood.species]).toEqual(["woods", 0, "pear"]);
  await expect.poll(async () => { const t = await woodsTrees(page); return t.length > 20 && t.every(s => s.shape === "broadleaf" && (s.variant === 13 || s.variant === 14)); }, { timeout: 20_000 }).toBe(true);
  // Its panel: Species, the pear picked; Any kind gives it the course's kinds again
  await page.evaluate(i => { (window as any).__dgEditor().set({ tool: "select" }); (window as any).__dgActions.select(i); }, id);
  const sp = page.getByTestId("stand-species");
  await expect(sp.getByRole("radio", { name: "Bradford pear" })).toHaveAttribute("aria-checked", "true");
  await sp.getByRole("radio", { name: "Any kind" }).click();
  await expect.poll(async () => (await course(page)).items.find((i: any) => i.id === id).species).toBeUndefined();
  // The kind is called Conifer now; its species: pine, tall pine, spruce, cedar
  await page.evaluate(() => (window as any).__dgEditor().set({ tool: "add-tree", treeKind: "conifer", standOf: null }));
  await expect(page.getByTestId("tree-kind-conifer")).toContainText("Conifer");
  await expect(page.getByTestId("tree-species").getByRole("radio", { name: "Tall pine" })).toBeVisible();
});

test.describe("phone", () => {
  const { defaultBrowserType: _b, ...phone } = devices["iPhone 13"];
  test.use(phone);

  test("a tree's Species chip in its strip: a Bradford pear", async ({ page }) => {
    await page.getByTestId("welcome-blank").click();
    await page.evaluate(() => {
      (window as any).__dgEditor().set({ tool: "select" });
      (window as any).__dgActions.placeAt("add-tree", { x: 500, y: 500 });
    });
    const id = (await course(page)).items.find((i: any) => i.type === "tree").id;
    await page.evaluate(i => (window as any).__dgActions.select(i), id);
    await page.getByTestId("strip-species").tap();
    await page.getByTestId("strip-pane").getByRole("radio", { name: "Bradford pear" }).tap();
    await expect.poll(async () => (await course(page)).items.find((i: any) => i.id === id).species).toBe("pear");
  });
});
