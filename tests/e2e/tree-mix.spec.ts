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

/** A wood, then the Map step's Trees part open. */
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
  await page.getByRole("button", { name: "3 Map" }).click();
  const part = page.getByTestId("part-trees");
  if ((await part.getAttribute("aria-expanded")) !== "true") await part.click();
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
