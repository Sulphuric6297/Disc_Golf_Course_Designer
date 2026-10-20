import { readFileSync } from "fs";
import { test, expect, addHole, blankCourse, course } from "./fixtures";

test("the course is saved as you go and comes back after a reload", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 600 }, { x: 600, y: 600 });
  await page.keyboard.press("Escape");
  await page.getByLabel("Course name").fill("Autosave Acres");
  await page.getByLabel("Course name").blur();
  await page.waitForTimeout(900);
  await page.reload();
  await expect.poll(async () => (await course(page)).name).toBe("Autosave Acres");
  expect((await course(page)).holes).toHaveLength(1);
  await expect(page.getByTestId("hole-row")).toHaveCount(1);
});

test("New keeps the old course under Recent courses, with Undo; it can be reopened", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 600 }, { x: 600, y: 600 });
  await page.keyboard.press("Escape");
  await page.getByLabel("Course name").fill("First Course");
  await page.getByLabel("Course name").blur();
  await page.getByTestId("file-menu").click();
  await page.getByRole("menuitem", { name: "New course" }).click();
  await expect.poll(async () => (await course(page)).holes.length).toBe(0);
  await expect(page.getByRole("status").filter({ hasText: "Started a new course." })).toBeVisible();
  await expect(page.getByText(/is under Open/)).toHaveCount(0);
  await page.getByTestId("file-menu").click();
  await expect(page.getByTestId("recent-course")).toContainText("First Course");
  await page.getByTestId("recent-course").getByRole("button", { name: /^First Course/ }).click();
  await expect.poll(async () => (await course(page)).name).toBe("First Course");
  expect((await course(page)).holes).toHaveLength(1);
});

test("save as a file, then open it again", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 600 }, { x: 650, y: 600 });
  await page.keyboard.press("Escape");
  await page.getByLabel("Course name").fill("File Round Trip");
  await page.getByLabel("Course name").blur();
  await page.getByTestId("file-menu").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Save as a file" }).click()]);
  expect(download.suggestedFilename()).toBe("file-round-trip.dgcourse.json");
  const path = (await download.path())!;
  const saved = JSON.parse(readFileSync(path, "utf8"));
  expect(saved.holes).toHaveLength(1);
  // Start over, then open the file
  await page.getByTestId("file-menu").click();
  await page.getByRole("menuitem", { name: "New course" }).click();
  await expect.poll(async () => (await course(page)).holes.length).toBe(0);
  await page.getByLabel("Open course file").setInputFiles(path);
  await expect.poll(async () => (await course(page)).name).toBe("File Round Trip");
  await expect(page.getByTestId("hole-row")).toContainText("350 ft");
});

test("undo and redo cover course edits", async ({ page }) => {
  await blankCourse(page);
  await addHole(page, { x: 300, y: 600 }, { x: 600, y: 600 });
  await addHole(page, { x: 650, y: 600 }, { x: 650, y: 300 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await course(page)).holes.length).toBe(1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(async () => (await course(page)).holes.length).toBe(2);
});
