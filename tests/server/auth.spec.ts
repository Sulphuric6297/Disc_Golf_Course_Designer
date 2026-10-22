import { test, expect, type Page } from "@playwright/test";
import { stepAt, totp } from "../../server/src/crypto";
import { SETUP_CODE } from "../../playwright.server.config";

// The browser stays offline but for the app and its server
test.beforeEach(async ({ context }) => {
  await context.route(url => !/^http:\/\/localhost:4175\//.test(url.href), r => r.abort());
});

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
  await expect(page.getByTestId("account-menu")).toBeVisible();
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
  // 2FA before anything else
  await expect(page.getByRole("heading", { name: "Set up two-factor sign-in" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code for the authenticator app" })).toBeVisible();
  const admin = await setUp2fa(page);
  await expect(page.getByRole("textbox", { name: "Course name" }).first()).toBeVisible();

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
  await setUp2fa(pat);
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
  await expect(page.getByTestId("account-menu")).toBeVisible();

  // Account: both of the admin's sign-ins listed (this one marked)
  await page.getByTestId("account-menu").click();
  await page.getByRole("menuitem", { name: "Account" }).click();
  await expect(page.getByTestId("my-sessions").getByText("This device")).toBeVisible();
  await expect(page.getByText("9 left")).toBeVisible();
  await other.close();
});
