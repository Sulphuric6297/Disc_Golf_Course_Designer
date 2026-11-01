// Every setting of the illustrated map works in every map style: its properties are the same
// whatever the look, only how they're drawn differs. Each style is painted over a stretch with
// woods, a placed tree, water, a path and a fairway, then again with one setting changed; a change
// that leaves the picture as it was is a setting that does nothing in that look.
import { test, expect, blankCourse, addHole } from "./fixtures";

// (one test a style: they run side by side)
for (const theme of ["handpainted", "classic", "brushwood", "hollow", "golden", "storybook", "gouache"])
test(`every map setting changes the map in the ${theme} style`, async ({ page }) => {
  test.setTimeout(400_000);
  await blankCourse(page);
  await addHole(page, { x: 400, y: 700 }, { x: 750, y: 700 });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const w = window as any;
    const ring = (cx: number, cy: number, r: number) => Array.from({ length: 32 }, (_, i) => ({ x: cx + Math.cos((i / 32) * Math.PI * 2) * r, y: cy + Math.sin((i / 32) * Math.PI * 2) * r }));
    w.__dgEditor().set({ areaKind: "woods" }); w.__dgActions.addDrawn("area", ring(560, 590, 100));
    w.__dgEditor().set({ areaKind: "water" }); w.__dgActions.addDrawn("area", ring(510, 765, 42));
    w.__dgEditor().set({ areaKind: "fairway" }); w.__dgActions.addDrawn("area", [{ x: 420, y: 680 }, { x: 740, y: 680 }, { x: 740, y: 720 }, { x: 420, y: 720 }]);
    w.__dgEditor().set({ lineKind: "path" }); w.__dgActions.addDrawn("line", [{ x: 360, y: 750 }, { x: 800, y: 770 }]);
    w.__dgActions.placeAt("add-tree", { x: 655, y: 645 });
    w.__dgEditor().set({ tool: "select" });
  });
  // (the map's painter, and the tests' measure with it)
  await page.getByRole("button", { name: "3 Map" }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__dgMapDiff), { timeout: 60_000 }).toBe("function");
  const dead = await page.evaluate(async (theme: string) => {
    const w = window as any, doc = w.__dgCourse();
    const view = { cx: 580, cy: 700, rotation: 0, scale: 0.9, width: 220, height: 160 };
    // (each style's own choice for each part: picking it again changes nothing, as it should)
    const OWN: Record<string, Record<string, string>> = {
      handpainted: { trees: "brushed", grass: "painted", fairway: "soft", paths: "painted", water: "deep" },
      classic: { trees: "classic", grass: "painted", fairway: "soft", paths: "painted", water: "deep" },
      brushwood: { trees: "cluster", grass: "meadow", fairway: "soft", paths: "painted", water: "painterly" },
      hollow: { trees: "drybrush", grass: "meadow", fairway: "soft", paths: "painted", water: "painterly" },
      golden: { trees: "brushed", grass: "field", fairway: "sunlit", paths: "painted", water: "glinting" },
      storybook: { trees: "cloud", grass: "storybook", fairway: "outlined", paths: "trail", water: "flat" },
      gouache: { trees: "gouache", grass: "painted", fairway: "sunlit", paths: "clean", water: "deep" }
    };
    const CHOICES = { trees: ["classic", "brushed", "cluster", "drybrush", "cloud", "gouache"], grass: ["painted", "meadow", "field", "storybook", "mown"], fairway: ["soft", "stripes", "sunlit", "outlined"], paths: ["painted", "clean", "trail"], water: ["deep", "painterly", "glinting", "flat"] } as Record<string, string[]>;
    const MIX = ["#7a4b26", "#8c6a24", "#6e2f20", "#80582a", "#3f4a2b", "#93782e"];
    const lp = (s: any, part: string, patch: object) => ({ ...s, lookParts: { ...s.lookParts, [part]: { ...s.lookParts?.[part], ...patch } } });
    const found: string[] = [];
    for (const t of [theme]) {
      const base = { ...doc.style, mapLook: t === "classic" ? undefined : t, lookParts: undefined, lightMode: undefined, goldenSun: undefined };
      const own = (part: string) => OWN[t][part];
      const settings: [string, (s: any) => any, ((s: any) => any)?][] = [
        ["trees size", s => lp(s, "trees", { size: 1.45 })],
        ["grass brightness", s => lp(s, "grass", { bright: 1.35 })],
        ["grass texture", s => lp(s, "grass", { texture: 0 })],
        ["fairway brightness", s => lp(s, "fairway", { bright: 0.6 })],
        ["shadows", s => ({ ...s, shadows: 0.1 })],
        ["light", s => ({ ...s, light: 1.3 })],
        ["contrast", s => ({ ...s, contrast: 1.4 })],
        ["color strength", s => ({ ...s, colorStrength: 0.5 })],
        ["sun from", s => ({ ...s, sunFrom: 300 })],
        ["sun height", s => ({ ...s, sunHeight: 70 }), s => ({ ...s, lightMode: "midday" })],
        ["night", s => ({ ...s, lightMode: "night" })],
        ["autumn colors", s => ({ ...s, autumnVivid: 1.6 }), s => ({ ...s, treeMix: MIX })],
        ["tree color", s => ({ ...s, trees: "#2f5a8a" })],
        ["grass color", s => ({ ...s, rough: "#9a7a3a" })],
        ["fairway color", s => ({ ...s, fairway: "#d9f07a" })],
        ["path color", s => ({ ...s, path: "#d23c3c" })],
        ["water color", s => ({ ...s, water: "#7a2a8a" })],
        ...Object.entries(CHOICES).flatMap(([part, ids]) => ids.filter(id => id !== own(part)).map(id => [`${part} ${id}`, (s: any) => lp(s, part, { style: id })] as [string, (s: any) => any]))
      ];
      for (const [name, change, pre] of settings) {
        const from = pre ? pre(base) : base;
        const d = await w.__dgMapDiff(doc, from, change(from), view);
        if (d < 0.02) found.push(`${t}: ${name} (${d.toFixed(3)})`);
      }
    }
    return found;
  }, theme);
  expect(dead, `settings that change nothing: ${dead.join("; ")}`).toEqual([]);
});
