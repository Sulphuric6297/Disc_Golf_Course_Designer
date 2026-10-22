import { test, expect, addHole, blankCourse, course } from "./fixtures";

test("checks: one ignored is out of the list and the count, kept with the course, brought back; one undo step", async ({ page }) => {
  await blankCourse(page);
  // Two holes side by side, too close
  await addHole(page, { x: 300, y: 500 }, { x: 700, y: 500 });
  await addHole(page, { x: 700, y: 540 }, { x: 300, y: 540 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "2 Design" }).click();
  const list = page.getByTestId("issues");
  const row = list.getByTestId("issue-row").filter({ hasText: "apart" });
  await expect(row).toHaveCount(1);
  const before = await list.getByTestId("issue-row").count();
  await expect(list).toContainText(`Checks (${before})`);
  await list.locator("li").filter({ hasText: "apart" }).getByRole("button", { name: "Ignore" }).click();
  await expect(row).toHaveCount(0);
  await expect(list).toContainText(`Checks (${before - 1})`);
  const ignored = (await course(page)).ignoredChecks;
  expect(ignored).toHaveLength(1);
  expect(ignored[0]).toMatch(/^close:/);
  // Still ignored with the holes moved a little
  await page.evaluate(() => {
    const w = window as any;
    const d = w.__dgCourse();
    const tee = d.items.find((i: any) => i.type === "tee" && i.holeId === d.holes[1].id);
    w.__dgActions.select(tee.id);
  });
  await page.keyboard.press("ArrowDown");
  await expect(row).toHaveCount(0);
  // Brought back
  await page.getByTestId("issues-ignored").getByRole("button", { name: "Ignored (1)" }).click();
  await expect(page.getByTestId("ignored-row")).toHaveCount(1);
  await page.getByTestId("ignored-row").getByRole("button", { name: "Check again" }).click();
  await expect(row).toHaveCount(1);
  await expect.poll(async () => (await course(page)).ignoredChecks).toBeUndefined();
  // (ignoring is one undo step)
  await list.locator("li").filter({ hasText: "apart" }).getByRole("button", { name: "Ignore" }).click();
  await expect(row).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(row).toHaveCount(1);
});
