import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { addHole, blankCourse, course, screenOf } from "../e2e/fixtures";
import { stepAt, totp } from "../../server/src/crypto";
import { SETUP_CODE } from "../../playwright.server.config";

// One server for the file, so the tests run in order: the first makes the accounts
test.describe.configure({ mode: "serial" });

// The browser stays offline but for the app and its server
const offline = (c: BrowserContext) => c.route(url => !/^http:\/\/localhost:4175\//.test(url.href), r => r.abort());
test.beforeEach(async ({ context }) => { await offline(context); });

/** The whole site in view, at once (a hole picked earlier leaves the map zoomed to it). */
const site = (page: Page) => page.evaluate(() => (window as any).__dgView.fitSite(false));

/** Signed in, as saved at the end of the first test. */
const signedIn: Record<string, Awaited<ReturnType<BrowserContext["storageState"]>>> = {};
async function as(browser: Browser, who: string) {
  const c = await browser.newContext({ storageState: signedIn[who] });
  await offline(c);
  const page = await c.newPage();
  await page.goto("/");
  await expect(page.getByTestId("home")).toBeVisible();
  return page;
}

const b32 = (s: string) => {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, v = 0;
  const out: number[] = [];
  for (const ch of s) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
};
const code = (secret: string, ahead = 0) => totp(b32(secret), stepAt(Date.now()) + ahead);

async function setUp2fa(page: Page) {
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Code from the app").fill(code(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByTestId("backup-codes").locator("li")).toHaveCount(10);
  const backup = (await page.getByTestId("backup-codes").locator("li").allTextContents()).map(s => s.trim());
  await page.getByTestId("codes-saved").click();
  await expect(page.getByTestId("home")).toBeVisible();
  return { secret, backup };
}

/** Two-factor sign-in turned on from Account (each person's choice): the key, a code, the backup codes. */
async function turnOn2fa(page: Page) {
  await page.getByTestId("account-menu").click();
  await page.getByRole("menuitem", { name: "Account" }).click();
  await page.getByTestId("mfa-start").getByRole("button", { name: "Set it up" }).click();
  await expect(page.getByRole("img", { name: "QR code for the authenticator app" })).toBeVisible();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Code from the app").fill(code(secret));
  await page.getByRole("button", { name: "Turn it on" }).click();
  await expect(page.getByTestId("backup-codes").locator("li")).toHaveCount(10);
  const backup = (await page.getByTestId("backup-codes").locator("li").allTextContents()).map(s => s.trim());
  await page.keyboard.press("Escape");
  return { secret, backup };
}

test("the admin, an invite, signing in again with a backup code", async ({ page, browser }) => {
  await page.goto("/");
  // First run: the admin, with the setup code from the server's log
  await expect(page.getByRole("heading", { name: "Create the admin account" })).toBeVisible();
  const setup = page.getByTestId("setup");
  await setup.getByLabel(/Setup code/).fill("WRONGCODEWRONGCO");
  await setup.getByLabel("Username").fill("admin");
  await setup.getByLabel("Your name").fill("Admin");
  await setup.getByLabel(/^Password \(/).fill("correct horse battery");
  await setup.getByLabel("Password again").fill("correct horse battery");
  await setup.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong setup code");
  await setup.getByLabel(/Setup code/).fill(SETUP_CODE);
  await setup.getByRole("button", { name: "Create" }).click();
  // Signed straight in; two-factor sign-in turned on from Account
  await expect(page.getByTestId("home").getByRole("heading", { name: "No courses yet" })).toBeVisible();
  const admin = await turnOn2fa(page);

  // An invite link
  await page.getByTestId("account-menu").click();
  await page.getByRole("menuitem", { name: "People" }).click();
  await page.getByTestId("new-invite").getByLabel(/Note/).fill("for Pat");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = (await page.getByTestId("new-link").locator("code").textContent())!;
  expect(link).toMatch(/^http:\/\/localhost:4175\/#invite=[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText("Invite · for Pat")).toBeVisible();

  // Pat takes it, in another browser
  const other = await browser.newContext();
  await other.route(url => !/^http:\/\/localhost:4175\//.test(url.href), r => r.abort());
  const pat = await other.newPage();
  await pat.goto(link);
  await expect(pat.getByRole("heading", { name: "Create your account" })).toBeVisible();
  const form = pat.getByTestId("accept-link");
  await form.getByLabel("Username").fill("pat");
  await form.getByLabel("Your name").fill("Pat");
  await form.getByLabel(/^Password \(/).fill("another long passphrase");
  await form.getByLabel("Password again").fill("another long passphrase");
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(pat.getByTestId("home")).toBeVisible();
  expect(pat.url()).not.toContain("#invite");
  // Not an admin: no People
  await pat.getByTestId("account-menu").click();
  await expect(pat.getByRole("menuitem", { name: "People" })).toHaveCount(0);
  // The link is used up
  const late = await (await browser.newContext()).newPage();
  await late.route(url => !/^http:\/\/localhost:4175\//.test(url.href), r => r.abort());
  await late.goto(link);
  await expect(late.getByRole("heading", { name: "Link expired" })).toBeVisible();

  // The admin sees Pat; signs out, and back in with a backup code
  await page.reload();
  await page.getByTestId("account-menu").click();
  await page.getByRole("menuitem", { name: "People" }).click();
  await expect(page.getByTestId("people").locator("li")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.getByTestId("account-menu").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  const signIn = page.getByTestId("sign-in");
  await signIn.getByLabel("Username").fill("admin");
  await signIn.getByLabel("Password").fill("not the password");
  await signIn.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong username or password");
  await signIn.getByLabel("Password").fill("correct horse battery");
  await signIn.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel(/Code from your app/).fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong code");
  await page.getByLabel(/Code from your app/).fill(admin.backup[0]);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("home")).toBeVisible();

  // Account: both of the admin's sign-ins listed (this one marked)
  await page.getByTestId("account-menu").click();
  await page.getByRole("menuitem", { name: "Account" }).click();
  await expect(page.getByTestId("my-sessions").getByText("This device")).toBeVisible();
  await expect(page.getByText("9 left")).toBeVisible();
  signedIn.admin = await page.context().storageState();
  signedIn.pat = await other.storageState();
  await other.close();
});

test("courses: a home page; shared as viewer (look only, or copy), then editor (a draft, published and merged); history; the owner's OK", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await as(browser, "admin");
  await admin.getByTestId("new-course").click();
  await expect(admin.getByTestId("home")).toHaveCount(0);
  await blankCourse(admin);
  await addHole(admin, { x: 100, y: 200 }, { x: 650, y: 200 });
  await expect(admin.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
  // Back on the home page: the course, with its numbers
  await admin.getByTestId("logo-home").click();
  const card = admin.getByTestId("my-courses").getByTestId("course-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("1 hole · Par 4");
  // (its printed map, once made: the holes' lines until then)
  await expect(card.locator("img")).toHaveJSProperty("complete", true, { timeout: 30_000 });
  await admin.reload();
  await expect(admin.getByTestId("my-courses").getByTestId("course-card").locator("img")).toBeVisible();
  expect(await admin.getByTestId("my-courses").getByTestId("course-card").locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(640);
  await admin.getByTestId("my-courses").getByTestId("course-card").click();

  // Shared with Pat to look at
  await admin.getByTestId("share-button").click();
  await admin.getByTestId("share-add").getByLabel("Username").fill("pat");
  await admin.getByTestId("share-add").getByLabel("Role").selectOption("viewer");
  await admin.getByTestId("share-add").getByRole("button", { name: "Share" }).click();
  await expect(admin.getByTestId("members").locator("li")).toHaveCount(2);
  await admin.keyboard.press("Escape");

  const pat = await as(browser, "pat");
  const sharedCard = pat.getByTestId("shared-courses").getByTestId("course-card");
  await expect(sharedCard).toHaveCount(1);
  await expect(sharedCard).toContainText("View only");
  await expect(sharedCard).toContainText("Admin's");
  await sharedCard.click();
  // View only: nothing to change it with
  await expect(pat.getByTestId("viewer-panel")).toBeVisible();
  await expect(pat.getByTestId("view-only")).toBeVisible();
  await expect(pat.getByRole("navigation", { name: "Steps" })).toHaveCount(0);
  await expect(pat.getByRole("textbox", { name: "Course name" })).toHaveCount(0);
  await expect(pat.getByTestId("share-button")).toHaveCount(0);
  expect((await course(pat)).holes.length).toBe(1);
  await pat.getByTestId("hole-row").click();
  await expect(pat.getByTestId("viewer-hole")).toContainText("550 ft");
  await expect(pat.getByTestId("inspector")).toHaveCount(0);
  await expect(pat.locator(".dg-h")).toHaveCount(0);
  await pat.keyboard.press("h");
  const p = await pat.evaluate(() => (window as any).__dgView.toClient(300, 500, 0));
  await pat.mouse.click(p.x, p.y);
  await pat.mouse.click(p.x + 200, p.y);
  await pat.keyboard.press("Delete");
  await pat.keyboard.press("Control+z");
  expect((await course(pat)).holes.length).toBe(1);
  expect(await pat.evaluate(() => (window as any).__dgEditor().tool)).toBe("select");

  // A copy is Pat's own to change
  await pat.getByTestId("copy-course").click();
  await expect(pat.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
  await expect(pat.getByTestId("viewer-panel")).toHaveCount(0);
  expect((await course(pat)).name).toMatch(/\(copy\)$/);
  await site(pat);
  await addHole(pat, { x: 100, y: 500 }, { x: 650, y: 500 });
  await expect(pat.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
  await pat.getByTestId("logo-home").click();
  await expect(pat.getByTestId("my-courses").getByTestId("course-card")).toContainText("2 holes");

  // Now an editor of the original: Pat's changes go in a draft of Pat's own
  await admin.getByTestId("share-button").click();
  await admin.getByLabel("Role for pat").selectOption("editor");
  await admin.keyboard.press("Escape");
  await sharedCard.click();
  await expect.poll(async () => (await course(pat)).name).not.toMatch(/\(copy\)$/);
  await expect(pat.getByTestId("publish-button")).toHaveCount(0);
  await site(pat);
  await addHole(pat, { x: 100, y: 500 }, { x: 650, y: 500 });
  await expect(pat.getByTestId("course-chip")).toHaveText(/^Draft · \d+ change/);
  // The owner doesn't see it, and keeps changing the course meanwhile
  await admin.reload();
  await admin.getByTestId("my-courses").getByTestId("course-card").click();
  await expect(admin.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
  await expect.poll(async () => (await course(admin)).holes.length).toBe(1);
  await site(admin);
  await addHole(admin, { x: 100, y: 800 }, { x: 650, y: 800 });
  await expect(admin.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
  // Pat's draft is kept across a reload, and published: both new holes are in the course
  await pat.reload();
  await pat.getByTestId("shared-courses").getByTestId("course-card").click();
  await expect.poll(async () => (await course(pat)).holes.length).toBe(2);
  await pat.getByTestId("publish-button").click();
  await expect(pat.getByTestId("draft-changes")).toHaveText("Holes: 1 added");
  await pat.getByTestId("publish-form").getByLabel(/^Name/).fill("a long hole by the creek");
  await pat.getByTestId("publish-form").getByRole("button", { name: "Publish" }).click();
  await expect(pat.getByTestId("publish-button")).toHaveCount(0);
  await expect.poll(async () => (await course(pat)).holes.length).toBe(3);
  await admin.reload();
  await admin.getByTestId("my-courses").getByTestId("course-card").click();
  await expect.poll(async () => (await course(admin)).holes.length).toBe(3);

  // The history: Pat's publish, with its note; an earlier version looked at, and restored
  await admin.getByTestId("course-chip").click();
  await admin.getByTestId("history-button").click();
  const versions = admin.getByTestId("versions").locator("li");
  await expect(versions.first()).toContainText("Published by Pat");
  await expect(versions.first()).toContainText("a long hole by the creek");
  await versions.filter({ hasText: "Created" }).getByRole("button", { name: "Look" }).click();
  await expect(admin.getByTestId("preview-bar")).toBeVisible();
  await expect.poll(async () => (await course(admin)).holes.length).toBe(1);
  await expect(admin.getByTestId("viewer-panel")).toBeVisible();
  await admin.getByTestId("preview-back").click();
  await expect.poll(async () => (await course(admin)).holes.length).toBe(3);
  await expect(admin.getByTestId("preview-bar")).toHaveCount(0);

  // The owner's OK, turned on: Pat sends, the owner accepts
  await admin.getByTestId("share-button").click();
  await admin.getByTestId("approval-toggle").check();
  await admin.keyboard.press("Escape");
  await pat.reload();
  await pat.getByTestId("shared-courses").getByTestId("course-card").click();
  await expect.poll(async () => (await course(pat)).holes.length).toBe(3);
  await site(pat);
  await addHole(pat, { x: 900, y: 200 }, { x: 900, y: 700 });
  await expect(pat.getByTestId("course-chip")).toHaveText(/^Draft · \d+ change/);
  await pat.getByTestId("publish-button").click();
  await pat.getByTestId("publish-form").getByRole("button", { name: "Send to the owner" }).click();
  await expect(pat.getByTestId("publish-button")).toHaveCount(0);
  await expect.poll(async () => (await course(pat)).holes.length).toBe(3);
  await admin.reload();
  await expect(admin.getByTestId("my-courses").getByTestId("to-review")).toHaveText("1 to review");
  await admin.getByTestId("my-courses").getByTestId("course-card").click();
  await admin.getByTestId("course-chip").click();
  await admin.getByTestId("review-button").click();
  await admin.getByTestId("submissions").getByRole("button", { name: "Look" }).click();
  await expect.poll(async () => (await course(admin)).holes.length).toBe(4);
  await admin.getByTestId("preview-bar").getByRole("button", { name: "Accept" }).click();
  await expect(admin.getByTestId("preview-bar")).toHaveCount(0);
  await expect.poll(async () => (await course(admin)).holes.length).toBe(4);
  await expect(admin.getByTestId("review-count")).toHaveCount(0);

  // Restored: back to before Pat's holes; the history keeps everything
  await admin.getByTestId("course-chip").click();
  await admin.getByTestId("history-button").click();
  admin.once("dialog", d => void d.accept());
  await versions.filter({ hasText: "Created" }).getByRole("button", { name: "Restore" }).click();
  await expect.poll(async () => (await course(admin)).holes.length).toBe(1);
  await admin.getByTestId("course-chip").click();
  await admin.getByTestId("history-button").click();
  await expect(versions.first()).toContainText("Restored");
  await expect(versions.filter({ hasText: "OK'd by Admin" })).toHaveCount(1);
});

test("owners: a draft too, published to the official layout; a draft behind the course updated, picking per part", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await as(browser, "admin");
  await admin.getByTestId("my-courses").getByTestId("course-card").click();
  await expect(admin.getByTestId("course-chip")).toHaveText("Live");
  // (the editors' drafts publish straight away again)
  await admin.getByTestId("share-button").click();
  await admin.getByTestId("approval-toggle").uncheck();
  await admin.keyboard.press("Escape");
  const holes0 = (await course(admin)).holes.length;

  // The owner works in a draft: the official layout stays as it is meanwhile
  await admin.getByTestId("course-chip").click();
  await admin.getByTestId("mode-draft").click();
  await expect(admin.getByTestId("course-chip")).toHaveText("Draft");
  await site(admin);
  await addHole(admin, { x: 900, y: 300 }, { x: 900, y: 800 });
  await expect(admin.getByTestId("course-chip")).toHaveAttribute("title", "Holes: 1 added");
  await expect(admin.getByTestId("draft-dot")).toHaveCount(1);
  await admin.getByRole("textbox", { name: "Course name" }).first().fill("Admin's name");
  await admin.keyboard.press("Tab");
  await expect(admin.getByTestId("course-chip")).toHaveAttribute("title", /Course settings changed/);

  // Meanwhile Pat publishes a draft that renames the course too
  const pat = await as(browser, "pat");
  await pat.getByTestId("shared-courses").getByTestId("course-card").click();
  await expect.poll(async () => (await course(pat)).holes.length).toBe(holes0);
  await pat.getByRole("textbox", { name: "Course name" }).first().fill("Pat's name");
  await pat.keyboard.press("Tab");
  await expect(pat.getByTestId("course-chip")).toHaveText(/^Draft · \d+ change/);
  await pat.getByTestId("publish-button").click();
  await pat.getByTestId("publish-form").getByRole("button", { name: "Publish" }).click();
  await expect(pat.getByTestId("publish-button")).toHaveCount(0);

  // The owner's draft is behind: updated, keeping the course's name (Pat's)
  await admin.reload();
  await admin.getByTestId("my-courses").getByTestId("course-card").click();
  await expect(admin.getByTestId("behind-bar")).toBeVisible();
  await admin.getByTestId("update-draft").click();
  await expect(admin.getByTestId("clash")).toHaveCount(1);
  await expect(admin.getByTestId("clash")).toContainText("The course's name");
  await admin.getByTestId("clash").getByRole("combobox").selectOption("theirs");
  await admin.getByTestId("update-form").getByRole("button", { name: "Update draft" }).click();
  await expect(admin.getByTestId("behind-bar")).toHaveCount(0);
  await expect.poll(async () => (await course(admin)).name).toBe("Pat's name");
  await expect.poll(async () => (await course(admin)).holes.length).toBe(holes0 + 1);

  // Published to the official layout, named from what changed
  await admin.getByTestId("publish-button").click();
  await expect(admin.getByTestId("draft-changes")).toHaveText("Holes: 1 added");
  await expect(admin.getByTestId("clashes")).toHaveCount(0);
  await admin.getByTestId("publish-form").getByRole("button", { name: "Publish" }).click();
  await expect(admin.getByTestId("course-chip")).toHaveText("Draft");
  await admin.getByTestId("course-chip").click();
  await admin.getByTestId("history-button").click();
  const top = admin.getByTestId("versions").locator("li").first();
  await expect(top).toContainText("Published by Admin");
  await expect(top).toContainText("Holes: 1 added");
  await admin.keyboard.press("Escape");

  // Back to publishing as it goes
  await admin.getByTestId("course-chip").click();
  await admin.getByTestId("mode-live").click();
  await expect(admin.getByTestId("course-chip")).toHaveText("Live");
  await expect.poll(async () => (await course(admin)).holes.length).toBe(holes0 + 1);
});

test("comments: pinned on a basket (moving with it), @mention, the bell, a reply, resolved", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await as(browser, "admin");
  await admin.getByTestId("my-courses").getByTestId("course-card").click();
  await expect(admin.getByTestId("course-chip")).toHaveText("Live");
  await site(admin);
  const b = await admin.evaluate(() => { const d = (window as any).__dgCourse(); return d.items.find((i: any) => i.type === "basket"); });
  const at = await screenOf(admin, b.x, b.y);
  await admin.getByTestId("comments-button").click();
  await expect(admin.getByTestId("threads")).toContainText("No comments yet.");
  await admin.getByTestId("add-comment").click();
  await admin.getByTestId("comment-placing").click({ position: { x: at.x - (await admin.getByTestId("comment-placing").boundingBox())!.x + 4, y: at.y - (await admin.getByTestId("comment-placing").boundingBox())!.y } });
  await admin.getByTestId("comment-composer").getByLabel("Comment").fill("Move this basket back 10 ft @pat");
  await admin.getByTestId("comment-composer").getByRole("button", { name: "Post" }).click();
  const thread = admin.getByTestId("thread");
  await expect(thread).toHaveCount(1);
  await expect(thread).toContainText(/^1Basket of hole/);
  await expect(admin.getByTestId("comment-pin")).toHaveCount(1);

  // Pat hears of it, and goes straight to it
  const pat = await as(browser, "pat");
  await expect(pat.getByTestId("notice-count")).toHaveText("1");
  await pat.getByTestId("notice-bell").click();
  await expect(pat.getByTestId("notice")).toContainText("Admin mentioned you");
  await pat.getByTestId("notice").click();
  await expect(pat.getByTestId("comments-panel")).toBeVisible();
  await expect(pat.getByTestId("thread")).toContainText("Move this basket back 10 ft @pat");
  await pat.getByTestId("thread").getByLabel("Reply").fill("On it");
  await pat.getByTestId("thread").getByLabel("Reply").press("Enter");
  await expect(pat.getByTestId("thread")).toContainText("On it");
  await expect(pat.getByTestId("notice-count")).toHaveCount(0);

  // The admin sees the reply, and resolves the thread: its pin goes (until resolved ones are shown)
  await admin.reload();
  await admin.getByTestId("my-courses").getByTestId("course-card").click();
  await expect(admin.getByTestId("notice-count")).toHaveText("1");
  await admin.getByTestId("comments-button").click();
  await expect(admin.getByTestId("thread")).toContainText("On it");
  await admin.getByTestId("thread").getByTestId("resolve").click();
  await expect(admin.getByTestId("threads")).toContainText("No open comments.");
  await expect(admin.getByTestId("comment-pin")).toHaveCount(0);
  await admin.getByTestId("comments-panel").getByLabel("Resolved").check();
  await expect(admin.getByTestId("comment-pin")).toHaveCount(1);

  // The basket moved: its pin goes with it
  const pin0 = (await admin.getByTestId("comment-pin").boundingBox())!;
  await admin.getByTestId("comments-panel").getByRole("button", { name: "Close" }).click();
  await site(admin);
  const from = await screenOf(admin, b.x, b.y);
  await admin.mouse.move(from.x, from.y);
  await admin.mouse.down();
  await admin.mouse.move(from.x + 40, from.y + 30, { steps: 6 });
  await admin.mouse.up();
  await expect.poll(async () => (await admin.evaluate(id => (window as any).__dgCourse().items.find((i: any) => i.id === id).x, b.id))).toBeGreaterThan(b.x + 5);
  await expect.poll(async () => (await admin.getByTestId("comment-pin").boundingBox())!.x).toBeGreaterThan(pin0.x + 10);
});

test("a public link: the site with what it allows (pictures, numbers), 3D when allowed; no account", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await as(browser, "admin");
  await admin.getByTestId("my-courses").getByTestId("course-card").click();
  await admin.getByTestId("share-button").click();
  await admin.getByTestId("share-tab-public").click();
  await admin.getByTestId("new-link").click();
  await admin.getByTestId("link-form").getByLabel("Label").fill("Club website");
  await admin.getByTestId("save-link").click();
  await expect(admin.getByTestId("link")).toHaveCount(1, { timeout: 120_000 });
  await expect(admin.getByTestId("site-state")).toContainText("Shows version", { timeout: 120_000 });
  const token = await admin.evaluate(async () => {
    const id = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("hyzerlab:last:"))!) ?? "null") ?? localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("hyzerlab:last:"))!);
    const links = await (await fetch(`./api/courses/${id}/links`)).json();
    return links[0].token as string;
  }).catch(async () => {
    const id = await admin.evaluate(() => localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("hyzerlab:last:"))!));
    return admin.evaluate(async id => (await (await fetch(`./api/courses/${id}/links`)).json())[0].token as string, id);
  });

  // Anyone with it: no account
  const anon = await browser.newContext();
  await offline(anon);
  const page = await anon.newPage();
  await page.goto(`/#site=${token}`);
  await expect(page.getByTestId("public-site")).toBeVisible();
  await expect(page.getByTestId("public-totals")).toBeVisible();
  const holes = (await course(admin)).holes.length;
  await expect(page.getByTestId("public-holes").locator(":scope > li")).toHaveCount(holes);
  await expect(page.getByTestId("public-signs").locator("img")).toHaveCount(holes);
  await expect(page.getByRole("img", { name: /^Map of/ })).toBeVisible();
  await expect(page.getByTestId("explore")).toHaveCount(0);

  // 3D allowed: the course to look round, view only, no files
  await admin.getByTestId("link").getByRole("button", { name: "Change" }).click();
  await admin.getByTestId("link-form").getByTestId("part-view3d").check();
  await admin.getByTestId("save-link").click();
  await expect(admin.getByTestId("link")).toContainText("3D", { timeout: 120_000 });
  await expect(admin.getByTestId("update-site")).toHaveText(/Update site/, { timeout: 120_000 });
  await page.reload();
  await page.getByTestId("explore").click();
  // (said at once that it's opening, and the wait gone once the course is drawn)
  await expect(page.getByTestId("opening-course")).toBeVisible();
  await expect(page.getByTestId("viewer-panel")).toBeVisible();
  await expect(page.getByTestId("opening-course")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("file-menu")).toHaveCount(0);
  await expect(page.getByTestId("copy-course")).toHaveCount(0);
  await expect.poll(async () => (await course(page)).holes.length).toBe(holes);
  await anon.close();
});

test("live: two people in one course see each other's changes as they're made; undo takes back only your own; a change made offline goes in once back", async ({ browser }) => {
  test.setTimeout(240_000);
  const live = (page: Page) => page.evaluate(() => (window as any).__dgLive.state());
  const holeIds = async (page: Page) => (await course(page)).holes.map((h: any) => h.id).sort();
  const admin = await as(browser, "admin");
  await admin.getByTestId("new-course").click();
  await blankCourse(admin);
  const first = await addHole(admin, { x: 100, y: 200 }, { x: 650, y: 200 });
  await expect(admin.getByTestId("save-status")).toHaveAttribute("data-state", "saved");
  // (the course just made: changed live from now on)
  await expect.poll(async () => (await live(admin)).connected).toBe(true);
  const id = await admin.evaluate(() => (window as any).__dgServer.state().id);
  await admin.getByTestId("share-button").click();
  await admin.getByTestId("share-add").getByLabel("Username").fill("pat");
  await admin.getByTestId("share-add").getByLabel("Role").selectOption("editor");
  await admin.getByTestId("share-add").getByRole("button", { name: "Share" }).click();
  await expect(admin.getByTestId("members").locator("li")).toHaveCount(2);
  await admin.keyboard.press("Escape");

  // Pat, an editor, starts in a draft and chooses to publish as they go
  const pat = await as(browser, "pat");
  await pat.evaluate(id => (window as any).__dgServer.open(id), id);
  await expect(pat.getByTestId("course-chip")).toContainText("Draft");
  await pat.getByTestId("course-chip").click();
  await pat.getByTestId("mode-live").click();
  await expect(pat.getByTestId("course-chip")).toContainText("Live");
  await expect.poll(async () => (await live(pat)).connected).toBe(true);
  await expect.poll(async () => (await live(admin)).people).toBe(2);

  // Each sees the other's hole as it's made
  const second = await addHole(admin, { x: 100, y: 350 }, { x: 650, y: 350 });
  await expect.poll(() => holeIds(pat)).toEqual([first.id, second.id].sort());
  const third = await addHole(pat, { x: 100, y: 500 }, { x: 650, y: 500 });
  await expect.poll(() => holeIds(admin)).toEqual([first.id, second.id, third.id].sort());

  // Admin's undo takes back Admin's own hole; Pat's stays, for both
  await admin.keyboard.press("Escape");
  await admin.keyboard.press("Control+z");
  await expect.poll(() => holeIds(admin)).toEqual([first.id, third.id].sort());
  await expect.poll(() => holeIds(pat)).toEqual([first.id, third.id].sort());

  // Pat offline: the change waits, and goes in once Pat is back
  await pat.context().setOffline(true);
  await expect.poll(async () => (await live(pat)).connected).toBe(false);
  const fourth = await addHole(pat, { x: 100, y: 650 }, { x: 650, y: 650 });
  expect(await holeIds(admin)).not.toContain(fourth.id);
  await pat.context().setOffline(false);
  await expect.poll(() => holeIds(admin), { timeout: 30_000 }).toEqual([first.id, third.id, fourth.id].sort());
  await expect(pat.getByTestId("save-status")).toHaveAttribute("data-state", "saved", { timeout: 30_000 });

  // Written: opened again, it's all there
  await admin.reload();
  await expect(admin.getByTestId("home")).toBeVisible();
  await admin.evaluate(id => (window as any).__dgServer.open(id), id);
  await expect.poll(() => holeIds(admin)).toEqual([first.id, third.id, fourth.id].sort());
});
