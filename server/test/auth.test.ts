import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSignedIn, Client, codeFor, memberSignedIn, ORIGIN, SETUP_CODE, world } from "./helpers.js";

const PW = "correct horse battery";

test("first run: the setup code, a password, then 2FA before anything else", async () => {
  const w = await world();
  try {
    const c = new Client(w.app);
    assert.equal((await c.get("/api/session")).body.needsSetup, true);
    assert.equal((await c.post("/api/setup", { code: "WRONGWRONGWRONG2", username: "admin", displayName: "Admin", password: PW })).status, 403);
    assert.equal((await c.post("/api/setup", { code: SETUP_CODE, username: "admin", displayName: "Admin", password: "short" })).status, 400);
    assert.equal((await c.post("/api/setup", { code: SETUP_CODE, username: "admin", displayName: "Admin", password: "admin-is-my-password" })).status, 400);
    const r = await c.post("/api/setup", { code: SETUP_CODE.toLowerCase(), username: "admin", displayName: "Admin", password: PW });
    assert.equal(r.status, 200);
    assert.equal(r.body.stage, "mfa-setup");
    // Nothing else until 2FA is on
    assert.equal((await c.get("/api/admin/users")).status, 401);
    const { body: e } = await c.post("/api/mfa/enroll");
    assert.match(e.uri, /^otpauth:\/\/totp\/HyzerLab:admin\?secret=/);
    assert.match(e.qr, /^<svg/);
    assert.equal((await c.post("/api/mfa/enroll/confirm", { code: "000000" })).status, 400);
    const done = await c.post("/api/mfa/enroll/confirm", { code: codeFor(e.secret) });
    assert.equal(done.status, 200);
    assert.equal(done.body.backupCodes.length, 10);
    const s = (await c.get("/api/session")).body;
    assert.equal(s.stage, "full");
    assert.equal(s.user.isAdmin, true);
    assert.equal(s.needsSetup, false);
    // Only once
    assert.equal((await new Client(w.app).post("/api/setup", { code: SETUP_CODE, username: "other", displayName: "X", password: PW })).status, 403);
  } finally { await w.close(); }
});

test("signing in: password, then a code from the app that works only once", async () => {
  const w = await world();
  try {
    const { secret } = await adminSignedIn(w);
    const c = new Client(w.app);
    assert.equal((await c.post("/api/login", { username: "admin", password: "wrong password!!" })).status, 401);
    assert.equal((await c.post("/api/login", { username: "nobody", password: PW })).status, 401);
    const r = await c.post("/api/login", { username: "ADMIN", password: PW });
    assert.equal(r.body.stage, "mfa");
    assert.equal((await c.get("/api/admin/users")).status, 401);
    // The code used to set 2FA up doesn't work again
    assert.equal((await c.post("/api/mfa/verify", { code: codeFor(secret) })).status, 400);
    const code = codeFor(secret, 1);
    assert.equal((await c.post("/api/mfa/verify", { code })).status, 200);
    assert.equal((await c.get("/api/session")).body.stage, "full");
    // A second sign-in can't reuse that code
    const d = new Client(w.app);
    await d.post("/api/login", { username: "admin", password: PW });
    assert.equal((await d.post("/api/mfa/verify", { code })).status, 400);
    // Signing out ends the session
    await c.post("/api/logout");
    assert.equal((await c.get("/api/session")).body.user, null);
  } finally { await w.close(); }
});

test("backup codes work once; five wrong codes start the sign-in over", async () => {
  const w = await world();
  try {
    const { backupCodes } = await adminSignedIn(w);
    const c = new Client(w.app);
    await c.post("/api/login", { username: "admin", password: PW });
    assert.equal((await c.post("/api/mfa/verify", { code: backupCodes[0].toUpperCase() })).status, 200);
    const d = new Client(w.app);
    await d.post("/api/login", { username: "admin", password: PW });
    assert.equal((await d.post("/api/mfa/verify", { code: backupCodes[0] })).status, 400);
    for (let i = 0; i < 3; i++) assert.equal((await d.post("/api/mfa/verify", { code: "123456" })).status, 400);
    assert.equal((await d.post("/api/mfa/verify", { code: "123456" })).status, 401);
    assert.equal((await d.get("/api/session")).body.stage, null);
    assert.equal((await d.post("/api/mfa/verify", { code: backupCodes[1] })).status, 401);
  } finally { await w.close(); }
});

test("ten wrong passwords rest the account, even for the right one", async () => {
  const w = await world();
  try {
    await adminSignedIn(w);
    const c = new Client(w.app);
    for (let i = 0; i < 10; i++) await c.post("/api/login", { username: "admin", password: `wrong password ${i}` });
    assert.equal((await c.post("/api/login", { username: "admin", password: PW })).status, 401);
    await w.sql`update users set locked_until = now() - interval '1 second'`;
    assert.equal((await c.post("/api/login", { username: "admin", password: PW })).status, 200);
  } finally { await w.close(); }
});

test("requests that change things only from the app itself", async () => {
  const w = await world();
  try {
    const c = new Client(w.app);
    const body = { username: "a", password: "b" };
    assert.equal((await c.req("POST", "/api/login", body, { "x-hyzerlab": "" })).status, 403);
    assert.equal((await c.req("POST", "/api/login", body, { origin: "https://evil.example.net" })).status, 403);
    assert.equal((await c.req("POST", "/api/login", body, { "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await c.req("POST", "/api/login", body, { origin: ORIGIN })).status, 401);
  } finally { await w.close(); }
});

test("sign-in tries are limited per address", async () => {
  const w = await world({ authLimit: 3 });
  try {
    const c = new Client(w.app);
    for (let i = 0; i < 3; i++) assert.equal((await c.post("/api/login", { username: "x", password: "y" })).status, 401);
    assert.equal((await c.post("/api/login", { username: "x", password: "y" })).status, 429);
  } finally { await w.close(); }
});

test("invites: admins only, used once, a taken name leaves the link working", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    assert.equal((await pat.post("/api/admin/invites", {})).status, 403);
    assert.equal((await pat.get("/api/admin/users")).status, 403);
    const { body: inv } = await admin.post("/api/admin/invites", { note: "for Sam" });
    assert.equal((await admin.get("/api/admin/invites")).body.length, 1);
    const sam = new Client(w.app);
    assert.equal((await sam.get(`/api/invites/${inv.token}`)).body.kind, "invite");
    assert.equal((await sam.post(`/api/invites/${inv.token}/accept`, { username: "PAT", displayName: "Sam", password: "a long passphrase here" })).status, 409);
    const ok = await sam.post(`/api/invites/${inv.token}/accept`, { username: "sam", displayName: "Sam", password: "a long passphrase here" });
    assert.equal(ok.body.stage, "mfa-setup");
    assert.equal((await new Client(w.app).get(`/api/invites/${inv.token}`)).status, 404);
    assert.equal((await new Client(w.app).post(`/api/invites/${inv.token}/accept`, { username: "sam2", displayName: "S", password: "a long passphrase here" })).status, 404);
    const users = (await admin.get("/api/admin/users")).body;
    assert.deepEqual(users.map((u: { username: string }) => u.username), ["admin", "pat", "sam"]);
    assert.equal(users.find((u: { username: string }) => u.username === "sam").isAdmin, false);
  } finally { await w.close(); }
});

test("admin: disable signs out, reset makes a new password and 2FA, not on your own account", async () => {
  const w = await world();
  try {
    const { c: admin, secret: adminSecret } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const users = (await admin.get("/api/admin/users")).body;
    const me = users.find((u: { username: string }) => u.username === "admin").id;
    const patId = users.find((u: { username: string }) => u.username === "pat").id;
    assert.equal((await admin.post(`/api/admin/users/${me}`, { disabled: true })).status, 400);

    await admin.post(`/api/admin/users/${patId}`, { disabled: true });
    assert.equal((await pat.get("/api/session")).body.user, null);
    assert.equal((await new Client(w.app).post("/api/login", { username: "pat", password: "another long passphrase" })).status, 401);
    await admin.post(`/api/admin/users/${patId}`, { disabled: false });

    const { body: reset } = await admin.post(`/api/admin/users/${patId}/reset`);
    const p = new Client(w.app);
    assert.equal((await p.get(`/api/invites/${reset.token}`)).body.username, "pat");
    assert.equal((await p.post(`/api/invites/${reset.token}/accept`, { password: "a brand new passphrase" })).body.stage, "mfa-setup");
    const { body: e } = await p.post("/api/mfa/enroll");
    assert.equal((await p.post("/api/mfa/enroll/confirm", { code: codeFor(e.secret) })).status, 200);
    assert.equal((await new Client(w.app).post("/api/login", { username: "pat", password: "another long passphrase" })).status, 401);

    const log = (await admin.get("/api/admin/audit")).body.map((l: { action: string }) => l.action);
    for (const a of ["user.disabled", "user.enabled", "reset.created", "reset.used", "mfa.enabled"]) assert.ok(log.includes(a), a);
    assert.ok(adminSecret);
  } finally { await w.close(); }
});

test("your account: sessions listed and ended, a new password signs out elsewhere", async () => {
  const w = await world();
  try {
    const { c, secret } = await adminSignedIn(w);
    const other = new Client(w.app);
    await other.post("/api/login", { username: "admin", password: PW });
    await other.post("/api/mfa/verify", { code: codeFor(secret, 1) });
    const { body } = await c.get("/api/me/sessions");
    assert.equal(body.sessions.length, 2);
    assert.equal(body.backupCodesLeft, 10);
    assert.equal((await c.post("/api/me/password", { current: "nope", next: "a new long passphrase", code: codeFor(secret, -1) })).status, 400);
    // (the -1 step code is older than the one just used: refused, so nothing changes)
    assert.equal((await c.post("/api/me/password", { current: PW, next: "a new long passphrase", code: codeFor(secret, -1) })).status, 400);
    await w.sql`update users set totp_last_step = 0`;
    assert.equal((await c.post("/api/me/password", { current: PW, next: "a new long passphrase", code: codeFor(secret) })).status, 200);
    assert.equal((await other.get("/api/session")).body.user, null);
    assert.equal((await c.get("/api/session")).body.stage, "full");
  } finally { await w.close(); }
});
