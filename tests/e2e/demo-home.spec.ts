import { test, expect, course, editorState } from "./fixtures";

test("a new visitor to the demo lands on Courses with the example course open behind it, takes the walk round it, and comes back", async ({ page }) => {
  test.setTimeout(300_000);
  // (a new visitor: not the tests' empty start)
  await page.evaluate(() => localStorage.removeItem("hyzerlab-start-blank"));
  await page.reload();
  await expect(page.getByTestId("demo-home")).toBeVisible();
  await expect(page.getByTestId("example-card")).toContainText("Thunder Hollow");
  // The example, open behind the page: its holes, and nothing that places it on the earth
  await expect.poll(async () => (await course(page)).holes.length, { timeout: 60_000 }).toBe(18);
  const doc = await course(page);
  expect(doc.name).toBe("Thunder Hollow");
  expect(doc.site.location).toBe(null);
  expect(doc.site.bounds).toBe(null);
  // The walk: every stop, Next to the end
  await page.getByTestId("home-tour-start").click();
  await expect(page.getByTestId("demo-home")).toHaveCount(0);
  await expect(page.getByTestId("tour-title")).toHaveText("Welcome to Thunder Hollow");
  const seen: string[] = [];
  const next = async () => { seen.push((await page.getByTestId("tour-title").textContent()) ?? ""); await page.getByTestId("tour-next").click(); };
  for (let i = 0; i < 3; i++) await next();
  // (its two stops in 3D: the whole course in 3D is more than software drawing keeps up with, so
  // the walk is taken through them by its state rather than clicks)
  const at = (n: number) => page.evaluate(n => (window as any).__dgTour.setState({ at: n }), n);
  await at(3);
  await expect.poll(async () => (await editorState(page)).view, { timeout: 60_000 }).toBe("3d");
  await at(4);
  await expect.poll(async () => (await editorState(page)).teeView, { timeout: 60_000 }).toBeTruthy();
  seen.push("In 3D", "From the tee");
  await at(5);
  await expect.poll(async () => (await editorState(page)).teeView, { timeout: 60_000 }).toBe(null);
  await expect.poll(async () => (await editorState(page)).view, { timeout: 60_000 }).toBe("2d");
  for (let i = 0; i < 4; i++) await next();
  await expect(page.getByTestId("tour-title")).toHaveText("Make it yours");
  expect(seen).toContain("A hole");
  expect(seen).toContain("The printed map");
  await page.getByTestId("tour-next").click();
  await expect(page.getByTestId("tour")).toHaveCount(0);
  expect((await editorState(page)).teeView).toBe(null);
  // The logo brings Courses back; the example is there, open now
  await page.getByTestId("logo-home").click();
  await expect(page.getByTestId("example-card")).toContainText("open now");
  await page.getByTestId("demo-home-back").click();
  await expect(page.getByTestId("demo-home")).toHaveCount(0);
});
