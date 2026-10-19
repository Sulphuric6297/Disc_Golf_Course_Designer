import { test as plain, expect as plainExpect } from "@playwright/test";
import { test, expect, addHole, blankCourse, course, editorState, importSite, stubNetwork } from "./fixtures";
import { createBasket, createEmptyCourse, createTee, newHole } from "../../src/lib/course";
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
  plainExpect(packed[0]).toBe("z");
  plainExpect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
  plainExpect(courseInHash(`#course=${packed}`)).toBe(packed);
  const back = await decodeCourse(packed);
  plainExpect(back.name).toBe("Link Test");
  plainExpect(back.background).toBeNull();
  plainExpect(back.terrainHeights).toEqual({});
  plainExpect(back.holes[0].notes).toBe("OB left");
  plainExpect(back.items.find(i => i.type === "tee")!.x).toBe(100.1);
  plainExpect("background" in shareable(doc)).toBe(false);
});

plain("a broken link says so", async () => {
  await plainExpect(decodeCourse("xnotacourse")).rejects.toThrow(/doesn't hold a course/);
});

test("share a course: the link opens it for someone else, view only, with the map downloaded again", async ({ page, browser }) => {
  await importSite(page, { trees: false, osm: false });
  const doc = await course(page);
  await addHole(page, { x: doc.canvas.width * 0.3, y: doc.canvas.height * 0.6 }, { x: doc.canvas.width * 0.6, y: doc.canvas.height * 0.6 });
  await page.keyboard.press("Escape");
  await page.getByTestId("share-button").click();
  const input = page.getByLabel("Share link");
  await expect(input).toHaveValue(/#course=z/);
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
  await theirs.getByTestId("make-copy").click();
  await expect(theirs.getByTestId("view-only-banner")).toBeHidden();
  await expect(theirs.getByRole("toolbar", { name: "Tools" })).toBeVisible();
  expect((await course(theirs)).name).toBe(`${doc.name} (copy)`);
  expect(new URL(theirs.url()).hash).toBe("");
  // It is saved: a reload brings the copy back
  await theirs.waitForTimeout(900);
  await theirs.reload();
  await expect.poll(async () => (await course(theirs)).name).toBe(`${doc.name} (copy)`);
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
