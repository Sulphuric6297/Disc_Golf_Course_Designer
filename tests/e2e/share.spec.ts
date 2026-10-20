import { test as plain, expect as plainExpect } from "@playwright/test";
import { test, expect, addHole, blankCourse, course, editorState, importSite, stubNetwork } from "./fixtures";
import { createArea, createBasket, createEmptyCourse, createLine, createTee, createTree, newHole } from "../../src/lib/course";
import { deflateRawSync } from "zlib";
import { courseInHash, decodeCourse, encodeCourse, shareable } from "../../src/lib/share";

plain("a course packs into a link and comes back the same (without photo and terrain)", async () => {
  const doc = createEmptyCourse();
  doc.name = "Link Test";
  doc.background = "data:image/jpeg;base64,AAAA";
  doc.terrainHeights = { "0,0": 3 };
  const h = newHole({ name: "Ace Run", notes: "OB left" });
  doc.holes.push(h);
  doc.items.push(createTee(h.id, { x: 100.123, y: 200 }), createBasket(h.id, { x: 400, y: 210.98 }));
  const packed = await encodeCourse(doc);
  plainExpect(packed[0]).toBe("y");
  plainExpect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
  plainExpect(courseInHash(`#course=${packed}`)).toBe(packed);
  const back = await decodeCourse(packed);
  plainExpect(back.name).toBe("Link Test");
  plainExpect(back.background).toBeNull();
  plainExpect(back.terrainHeights).toEqual({});
  plainExpect(back.holes[0].notes).toBe("OB left");
  // (to a hundredth of a foot)
  plainExpect(back.items.find(i => i.type === "tee")!.x).toBe(100.12);
  plainExpect(back.items.find(i => i.type === "basket")!.y).toBe(210.98);
  plainExpect(back.items.find(i => i.type === "tee")!.holeId).toBe(back.holes[0].id);
  plainExpect("background" in shareable(doc)).toBe(false);
  // Nor the course's logo (a picture: the link would be too long to send)
  doc.style.logo = "data:image/png;base64,iVBORw0KGgo=";
  plainExpect("logo" in shareable(doc).style).toBe(false);
  plainExpect(doc.style.logo).toBeTruthy();
});

plain("links are short and lose nothing: every item, point, hole and setting comes back; old links still open", async () => {
  // A made-up 18-hole course: turns, trees, big imported woods, paths, OB, settings that refer to things
  const doc = createEmptyCourse();
  doc.name = "Springfield Park";
  doc.style.shadows = 0.65;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 18; k++) {
    const h = newHole({ doglegs: [{ x: 120 + k * 60 + rnd() * 30, y: 300 + rnd() * 50 }], fairwayWidth: 30 + k });
    doc.holes.push(h);
    doc.items.push(createTee(h.id, { x: 100.37 + k * 60, y: 200.81 + rnd() * 40 }), createBasket(h.id, { x: 140 + k * 60, y: 520 + rnd() * 60 }));
  }
  for (let k = 0; k < 80; k++) doc.items.push(createTree({ x: rnd() * 1500, y: rnd() * 1000 }, { radius: 8 + rnd() * 10 }));
  for (let w = 0; w < 2; w++) {
    const ring = Array.from({ length: 120 }, (_, i) => { const a = (i / 120) * Math.PI * 2, r = 150 + rnd() * 3; return { x: 400 + w * 600 + Math.cos(a) * r, y: 700 + Math.sin(a) * r }; });
    doc.items.push({ ...createArea("woods", ring), importSource: "osm" } as typeof doc.items[number]);
  }
  for (let k = 0; k < 6; k++) doc.items.push(createLine("path", Array.from({ length: 30 }, (_, i) => ({ x: 50 + i * 30 + rnd() * 2, y: 100 + k * 140 + Math.sin(i / 4) * 20 }))));
  const ob = { ...createLine("ob", [{ x: 10, y: 10 }, { x: 1400, y: 15 }]), holeId: doc.holes[0].id, alsoHoles: [doc.holes[1].id] } as typeof doc.items[number];
  doc.items.push(ob);
  doc.ignoredChecks = [`crosses:${doc.holes[0].id}:${ob.id}`];
  doc.style.labelAt = { [`num:${doc.holes[2].id}`]: { dx: 12, dy: -4 } };
  // The link as it was made before
  const oldCompact = (_k: string, v: unknown) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v);
  const oldLink = `z${deflateRawSync(Buffer.from(JSON.stringify(shareable(doc), oldCompact))).toString("base64url")}`;
  const link = await encodeCourse(doc);
  console.log(`share link: ${oldLink.length} -> ${link.length} characters`);
  plainExpect(link[0]).toBe("y");
  const back = await decodeCourse(link);
  // Everything, in order: each item's every setting and point (to a hundredth of a foot)
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const holeOf = new Map(doc.holes.map((h, k) => [h.id, back.holes[k].id]));
  plainExpect(back.holes.map(h => [h.name, h.fairwayWidth, h.doglegs.map(p => [p.x, p.y])])).toEqual(doc.holes.map(h => [h.name, h.fairwayWidth, h.doglegs.map(p => [r2(p.x), r2(p.y)])]));
  plainExpect(back.items).toHaveLength(doc.items.length);
  doc.items.forEach((i, k) => {
    const b = back.items[k] as unknown as Record<string, unknown>;
    for (const [key, v] of Object.entries(i)) {
      if (key === "id" || v === undefined) continue;
      if (key === "holeId") plainExpect(b.holeId).toBe(holeOf.get(v as string));
      else if (key === "alsoHoles") plainExpect(b.alsoHoles).toEqual((v as string[]).map(x => holeOf.get(x)));
      else if (key === "points") plainExpect(b.points).toEqual((v as { x: number; y: number }[]).map(p => ({ x: r2(p.x), y: r2(p.y) })));
      else plainExpect(b[key]).toEqual(typeof v === "number" ? r2(v) : v);
    }
  });
  plainExpect(back.style.shadows).toBe(0.65);
  // (what refers to things still finds them)
  const backOb = back.items[doc.items.length - 1];
  plainExpect(back.ignoredChecks).toEqual([`crosses:${back.holes[0].id}:${backOb.id}`]);
  plainExpect(back.style.labelAt).toEqual({ [`num:${back.holes[2].id}`]: { dx: 12, dy: -4 } });
  plainExpect(back.id).toBe(doc.id);
  plainExpect(link.length).toBeLessThan(oldLink.length);
  // The old kind of link still opens
  const old = await decodeCourse(oldLink);
  plainExpect(old.holes.map(h => h.id)).toEqual(doc.holes.map(h => h.id));
});

plain("a broken link says so", async () => {
  await plainExpect(decodeCourse("xnotacourse")).rejects.toThrow(/doesn't hold a course/);
});

test("share a course: the link opens it for someone else, view only, with the map downloaded again", async ({ page, browser }) => {
  // Two browsers, two site imports and a reload: a long test on a busy machine
  test.setTimeout(180_000);
  await importSite(page, { trees: false, osm: false });
  const doc = await course(page);
  await addHole(page, { x: doc.canvas.width * 0.3, y: doc.canvas.height * 0.6 }, { x: doc.canvas.width * 0.6, y: doc.canvas.height * 0.6 });
  await page.keyboard.press("Escape");
  await page.getByTestId("share-button").click();
  const input = page.getByLabel("Share link");
  await expect(input).toHaveValue(/#course=y/);
  const link = await input.inputValue();
  await expect(page.getByTestId("share-size")).toContainText("KB link");
  // Someone else opens it (a fresh browser with nothing stored)
  const other = await browser.newContext();
  const theirs = await other.newPage();
  await stubNetwork(theirs);
  const errors: string[] = [];
  theirs.on("pageerror", e => errors.push(e.message));
  await theirs.goto(link.replace(/^https?:\/\/[^/]+/, "http://localhost:4173"));
  await expect(theirs.getByTestId("view-only-banner")).toBeVisible();
  await expect.poll(async () => (await course(theirs)).holes.length).toBe(1);
  expect((await course(theirs)).name).toBe(doc.name);
  // The photo and elevation come down again for the same place
  await expect.poll(async () => (await course(theirs)).background, { timeout: 30_000 }).toMatch(/^data:image/);
  await expect.poll(async () => (await course(theirs)).terrainHeights).toBeGreaterThan(1000);
  // Looking only: no tools
  await expect(theirs.getByRole("toolbar", { name: "Tools" })).toBeHidden();
  expect((await editorState(theirs)).viewOnly).toBe(true);
  // Make a copy: it becomes theirs to edit, and the link leaves the address bar
  // (The link stays in the address bar until the copy is saved: a reload in between still has it)
  const hashOnClick = await theirs.evaluate(() => {
    (document.querySelector('[data-testid="make-copy"]') as HTMLElement).click();
    return location.hash;
  });
  expect(hashOnClick).toMatch(/^#course=/);
  await expect(theirs.getByRole("status").filter({ hasText: "Made a copy." })).toBeVisible();
  await expect(theirs.getByText(/This copy is yours to edit/)).toHaveCount(0);
  await expect(theirs.getByTestId("view-only-banner")).toBeHidden();
  await expect(theirs.getByRole("toolbar", { name: "Tools" })).toBeVisible();
  expect((await course(theirs)).name).toBe(`${doc.name} (copy)`);
  expect(new URL(theirs.url()).hash).toBe("");
  // It is saved: a reload right away brings the copy back
  await theirs.reload();
  // (Restoring a course with its photo takes a while on a busy test machine)
  await expect.poll(async () => (await course(theirs)).name, { timeout: 30_000 }).toBe(`${doc.name} (copy)`);
  expect(errors).toEqual([]);
  await other.close();
});

test("opening a shared link never overwrites your own course", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 600 }, { x: 600, y: 600 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  const shared = createEmptyCourse();
  shared.name = "Someone Else's Course";
  const h = newHole();
  shared.holes.push(h);
  shared.items.push(createTee(h.id, { x: 100, y: 100 }), createBasket(h.id, { x: 300, y: 100 }));
  await page.goto(`/#course=${await encodeCourse(shared)}`);
  await expect(page.getByTestId("view-only-banner")).toBeVisible();
  await expect.poll(async () => (await course(page)).name).toBe("Someone Else's Course");
  // Leaving without making a copy: your own course is still there
  await page.goto("/");
  await page.reload();
  await expect.poll(async () => (await course(page)).name).toBe("New Disc Golf Course");
  expect((await course(page)).holes).toHaveLength(1);
});
