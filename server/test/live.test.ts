import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { adminSignedIn, Client, memberSignedIn, world, type World } from "./helpers.js";

const doc = () => ({ version: 1, name: "Springfield Park", holes: [{ id: "h0" }], items: [{ id: "t1", type: "tree", x: 1 }], layouts: [], style: { theme: "forest" }, background: null });

/** A course's live connection, as the app opens it: its events as they come. */
async function connect(w: World, who: Client, courseId: string, client: string, headers: Record<string, string> = {}) {
  if (!w.app.server.listening) await w.app.listen({ host: "127.0.0.1", port: 0 });
  const { port } = w.app.server.address() as AddressInfo;
  const events: { event: string; data: any }[] = [];
  const waiters: (() => void)[] = [];
  let status = 0, done = false;
  const onEnd: (() => void)[] = [];
  const req = http.get({ host: "127.0.0.1", port, path: `/api/courses/${courseId}/live?client=${client}`, headers: { cookie: [...who.cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...headers } });
  await new Promise<void>((ok, bad) => {
    req.on("error", bad);
    req.on("response", res => {
      status = res.statusCode ?? 0;
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (ev) events.push({ event: ev, data: data ? JSON.parse(data) : null });
          waiters.splice(0).forEach(f => f());
        }
      });
      res.on("end", () => { done = true; onEnd.splice(0).forEach(f => f()); });
      ok();
    });
  });
  const next = async (event: string, after = 0) => {
    const deadline = Date.now() + 8000;
    for (;;) {
      const found = events.slice(after).find(e => e.event === event);
      if (found) return found.data;
      if (Date.now() > deadline) throw new Error(`No ${event} event (got ${events.map(e => e.event).join(", ")})`);
      await new Promise<void>(ok => { waiters.push(ok); setTimeout(ok, 200); });
    }
  };
  /** Calls back when the server ends the connection. */
  const ended = (f: () => void) => (done ? f() : onEnd.push(f));
  return { status, events, next, ended, close: () => req.destroy() };
}

const put = (value: object) => ({ op: "put", list: "items", value });

test("live: changes go to everyone in the course as they're made, in order, and are written a moment after", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}`;
    await admin.post(`${url}/members`, { username: "pat", role: "editor" });

    // An editor works in a draft until they choose to change the course as they go
    assert.equal((await pat.get(url)).body.live, false);
    assert.equal((await pat.post(`${url}/live`, { live: true })).status, 200);
    assert.equal((await pat.get(url)).body.live, true);

    const a = await connect(w, admin, made.id, "adminTab01");
    const p = await connect(w, pat, made.id, "patTab0001");
    assert.equal(a.status, 200);
    const hello = await p.next("hello");
    assert.deepEqual(hello.people.map((x: any) => x.name).sort(), ["Admin", "Pat"]);

    const sent = await pat.post(`${url}/live/changes`, { client: "patTab0001", batch: 1, changes: [put({ id: "t1", type: "tree", x: 9 }), put({ id: "t2", type: "tree", x: 3 })] });
    assert.equal(sent.status, 200);
    const got = await a.next("changes");
    assert.equal(got.client, "patTab0001");
    assert.equal(got.batch, 1);
    assert.equal(got.seq, sent.body.seq);
    // (the sender gets its own back too: that's when it knows where it went in the order)
    assert.equal((await p.next("changes")).batch, 1);

    // Written a moment later, and everyone told
    const saved = await a.next("saved");
    assert.equal(saved.seq, sent.body.seq);
    const [row] = await w.sql`select doc, version, updated_by from courses where id = ${made.id}`;
    assert.deepEqual(row.doc.items.map((i: any) => [i.id, i.x]), [["t1", 9], ["t2", 3]]);
    assert.equal(row.version, 2);

    // Someone opening it now gets it as it is
    assert.deepEqual((await admin.get(url)).body.doc.items.map((i: any) => i.x), [9, 3]);

    // Taken out, put in order, a part of the course set
    const at = a.events.length, pAt = p.events.length;
    await admin.post(`${url}/live/changes`, { client: "adminTab01", batch: 1, changes: [{ op: "del", list: "items", id: "t1" }, { op: "set", key: "style", value: { theme: "classic" } }] });
    assert.equal((await p.next("changes", pAt)).client, "adminTab01");
    await a.next("saved", at);
    const [row2] = await w.sql`select doc from courses where id = ${made.id}`;
    assert.deepEqual(row2.doc.items.map((i: any) => i.id), ["t2"]);
    assert.deepEqual(row2.doc.style, { theme: "classic" });
    a.close(); p.close();
  } finally { await w.close(); }
});

test("live: only those who may change it do; viewers watch; others and other sites get nothing", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { c: sam } = await memberSignedIn(w, admin, "sam");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}`;
    await admin.post(`${url}/members`, { username: "pat", role: "viewer" });

    // Not on the course: not found
    assert.equal((await connect(w, sam, made.id, "samTab0001")).status, 404);
    // Another site's page using your sign-in: refused
    assert.equal((await connect(w, admin, made.id, "adminTab01", { "sec-fetch-site": "cross-site" })).status, 403);
    // Not signed in
    assert.equal((await connect(w, new Client(w.app), made.id, "anonTab001")).status, 401);

    // A viewer watches, but can't change it
    const v = await connect(w, pat, made.id, "patTab0001");
    assert.equal(v.status, 200);
    assert.equal((await pat.post(`${url}/live/changes`, { client: "patTab0001", batch: 1, changes: [put({ id: "t9" })] })).status, 403);
    assert.equal((await pat.post(`${url}/live`, { live: true })).status, 403);

    // Changes from a tab that isn't connected: it opens its connection again first
    const late = await admin.post(`${url}/live/changes`, { client: "adminTab02", batch: 1, changes: [put({ id: "t9" })] });
    assert.equal(late.status, 409);
    assert.equal(late.body.rejoin, true);

    // The list's own parts and the photo can't be set as parts
    await connect(w, admin, made.id, "adminTab01");
    for (const key of ["items", "holes", "background", "id"]) {
      assert.equal((await admin.post(`${url}/live/changes`, { client: "adminTab01", batch: 1, changes: [{ op: "set", key, value: [] }] })).status, 400);
    }
    // Taken off the course: let go (and can't come back in)
    const patId = (await admin.get(`${url}/members`)).body.find((m: any) => m.username === "pat").userId;
    const ended = new Promise<void>(ok => v.ended(ok));
    assert.equal((await admin.del(`${url}/members/${patId}`)).status, 200);
    await ended;
    assert.equal((await connect(w, pat, made.id, "patTab0001")).status, 404);
  } finally { await w.close(); }
});

test("live: when the owner wants to OK changes first, editors go back to drafts (told), and their changes are refused", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}`;
    await admin.post(`${url}/members`, { username: "pat", role: "editor" });
    await pat.post(`${url}/live`, { live: true });
    const p = await connect(w, pat, made.id, "patTab0001");
    await p.next("hello");
    assert.equal((await admin.post(`${url}/settings`, { approval: true })).status, 200);
    await p.next("drafts");
    const r = await pat.post(`${url}/live/changes`, { client: "patTab0001", batch: 1, changes: [put({ id: "t9" })] });
    assert.equal(r.status, 409);
    assert.equal(r.body.drafts, true);
    assert.equal((await pat.get(url)).body.live, false);
    assert.equal((await pat.post(`${url}/live`, { live: true })).status, 403);
    p.close();
  } finally { await w.close(); }
});

test("live: a whole-course save (an app opened before live editing) over newer live changes is refused and asked about; one that goes in is read again by everyone", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}`;
    const a = await connect(w, admin, made.id, "adminTab01");
    await a.next("hello");
    await admin.post(`${url}/live/changes`, { client: "adminTab01", batch: 1, changes: [put({ id: "t2" })] });
    // (an old tab still on version 1: the live change went in first)
    const old = await admin.req("PUT", url, { doc: { ...doc(), name: "Old tab" }, version: 1 });
    assert.equal(old.status, 409);
    const { body: now } = await admin.get(url);
    assert.deepEqual(now.doc.items.map((i: any) => i.id), ["t1", "t2"]);
    // Saved over the newest: in, and everyone reads it again
    const at = a.events.length;
    assert.equal((await admin.req("PUT", url, { doc: { ...now.doc, name: "Old tab" }, version: now.version })).status, 200);
    await a.next("reload", at);
    assert.equal((await admin.get(url)).body.doc.name, "Old tab");
    a.close();
  } finally { await w.close(); }
});

test("live: drafts aren't touched by live changes, and publishing one goes through what's open live", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}`;
    await admin.post(`${url}/members`, { username: "pat", role: "editor" });
    // Pat's draft, from version 1
    const draft = { ...doc(), name: "Pat's draft" };
    await pat.req("PUT", `${url}/draft`, { doc: draft, base: { doc: doc(), version: 1 } });
    const a = await connect(w, admin, made.id, "adminTab01");
    await a.next("hello");
    await admin.post(`${url}/live/changes`, { client: "adminTab01", batch: 1, changes: [put({ id: "t2" })] });
    await a.next("saved");
    const { body: d } = await pat.get(`${url}/draft`);
    assert.equal(d.draft.doc.name, "Pat's draft");
    assert.equal(d.draft.baseVersion, 1);
    // Publishing from version 1 now: refused (the app merges again)
    assert.equal((await pat.post(`${url}/publish`, { doc: draft, version: 1 })).status, 409);
    const { body: c } = await pat.get(url);
    const at = a.events.length;
    assert.equal((await pat.post(`${url}/publish`, { doc: { ...c.doc, name: "Pat's draft" }, version: c.version })).status, 200);
    await a.next("reload", at);
    assert.equal((await admin.get(url)).body.doc.name, "Pat's draft");
    a.close();
  } finally { await w.close(); }
});

test("live: the server stopping writes what's open first", async () => {
  const w = await world();
  const { c: admin } = await adminSignedIn(w);
  const { body: made } = await admin.post("/api/courses", { doc: doc() });
  const a = await connect(w, admin, made.id, "adminTab01");
  await a.next("hello");
  await admin.post(`/api/courses/${made.id}/live/changes`, { client: "adminTab01", batch: 1, changes: [put({ id: "t7" })] });
  await w.app.close();
  const [row] = await w.sql`select doc from courses where id = ${made.id}`;
  assert.deepEqual(row.doc.items.map((i: any) => i.id), ["t1", "t7"]);
  await w.sql.end();
});
