import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSignedIn, Client, codeFor, memberSignedIn, world } from "./helpers.js";

const doc = (name = "Springfield Park", holes = 2) => ({ version: 1, name, holes: Array.from({ length: holes }, (_, i) => ({ id: `h${i}` })), items: [], background: "data:image/png;base64,AAAA" });
const PNG = "data:image/png;base64,iVBORw0KGgo=";

test("a new course: yours to own, saved with a version, its photo kept apart", async () => {
  const w = await world();
  try {
    const { c } = await adminSignedIn(w);
    const { body: made } = await c.post("/api/courses", { doc: doc() });
    assert.equal(made.role, "owner");
    assert.equal(made.version, 1);
    const list = (await c.get("/api/courses")).body;
    assert.deepEqual(list.map((x: { name: string; holes: number; role: string }) => [x.name, x.holes, x.role]), [["Springfield Park", 2, "owner"]]);
    const { body: got } = await c.get(`/api/courses/${made.id}`);
    assert.equal(got.doc.background, null);
    assert.equal(got.hasBackground, false);
    assert.equal((await c.req("PUT", `/api/courses/${made.id}/background`, { data: "javascript:alert(1)" })).status, 400);
    assert.equal((await c.req("PUT", `/api/courses/${made.id}/background`, { data: 'data:image/png;base64,AA" onload="x' })).status, 400);
    assert.equal((await c.req("PUT", `/api/courses/${made.id}/background`, { data: PNG })).status, 200);
    assert.equal((await c.get(`/api/courses/${made.id}/background`)).body.data, PNG);
    assert.equal((await c.get(`/api/courses/${made.id}`)).body.hasBackground, true);
  } finally { await w.close(); }
});

test("the owner's saves: one from an older version is refused, saying who saved", async () => {
  const w = await world();
  try {
    const { c: admin, secret } = await adminSignedIn(w);
    const other = new Client(w.app);
    await other.post("/api/login", { username: "admin", password: "correct horse battery" });
    await other.post("/api/mfa/verify", { code: codeFor(secret, 1) });
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    assert.equal((await other.req("PUT", `/api/courses/${made.id}`, { doc: doc("Second tab", 3), version: 1 })).body.version, 2);
    const late = await admin.req("PUT", `/api/courses/${made.id}`, { doc: doc("First tab"), version: 1 });
    assert.equal(late.status, 409);
    assert.equal(late.body.version, 2);
    assert.match(late.body.error, /^Admin saved this course/);
    const { body: got } = await admin.get(`/api/courses/${made.id}`);
    assert.equal(got.doc.name, "Second tab");
  } finally { await w.close(); }
});

test("roles: viewers look, editors change, owners share and delete; others see nothing", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { c: sam } = await memberSignedIn(w, admin, "sam");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}`;

    // Not shared: not there at all
    assert.equal((await pat.get(url)).status, 404);
    assert.equal((await pat.get("/api/courses")).body.length, 0);
    assert.equal((await pat.req("PUT", url, { doc: doc(), version: 1 })).status, 404);

    // A viewer
    await admin.post(`${url}/members`, { username: "PAT", role: "viewer" });
    assert.equal((await pat.get(url)).body.role, "viewer");
    assert.equal((await pat.req("PUT", url, { doc: doc(), version: 1 })).status, 403);
    assert.equal((await pat.req("PUT", `${url}/background`, { data: PNG })).status, 403);
    assert.equal((await pat.post(`${url}/members`, { username: "sam", role: "viewer" })).status, 403);
    assert.equal((await pat.del(url)).status, 403);

    // An editor changes it, but can't share or delete it
    await admin.post(`${url}/members`, { username: "pat", role: "editor" });
    assert.equal((await pat.req("PUT", url, { doc: doc("Edited"), version: 1 })).status, 200);
    assert.equal((await pat.post(`${url}/members`, { username: "sam", role: "editor" })).status, 403);
    assert.equal((await pat.del(url)).status, 403);

    // Members listed, owners first
    const members = (await pat.get(`${url}/members`)).body;
    assert.deepEqual(members.map((m: { username: string; role: string }) => [m.username, m.role]), [["admin", "owner"], ["pat", "editor"]]);
    assert.equal((await sam.get(`${url}/members`)).status, 404);

    // The only owner stays one; a second owner can leave
    const adminId = members[0].userId;
    assert.equal((await admin.post(`${url}/members`, { username: "admin", role: "editor" })).status, 400);
    assert.equal((await admin.del(`${url}/members/${adminId}`)).status, 400);
    await admin.post(`${url}/members`, { username: "sam", role: "owner" });
    assert.equal((await admin.del(`${url}/members/${adminId}`)).status, 200);
    assert.equal((await admin.get(url)).status, 404);
    // Anyone can leave
    const patId = members[1].userId;
    assert.equal((await pat.del(`${url}/members/${patId}`)).status, 200);
    assert.equal((await pat.get(url)).status, 404);
    // An owner deletes it
    assert.equal((await sam.del(url)).status, 200);
    assert.equal((await sam.get(url)).status, 404);
    assert.equal((await admin.post(`${url}/members`, { username: "nobody", role: "viewer" })).status, 404);
  } finally { await w.close(); }
});

test("removing someone: courses only they owned pass to the admin", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { body: made } = await pat.post("/api/courses", { doc: doc("Pat's course") });
    const patId = (await admin.get("/api/admin/users")).body.find((u: { username: string }) => u.username === "pat").id;
    assert.equal((await admin.get(`/api/courses/${made.id}`)).status, 404);
    await admin.del(`/api/admin/users/${patId}`);
    assert.equal((await admin.get(`/api/courses/${made.id}`)).body.role, "owner");
  } finally { await w.close(); }
});

test("signed out: no courses", async () => {
  const w = await world();
  try {
    const { c } = await adminSignedIn(w);
    const { body: made } = await c.post("/api/courses", { doc: doc() });
    await c.post("/api/logout");
    assert.equal((await c.get("/api/courses")).status, 401);
    assert.equal((await c.get(`/api/courses/${made.id}`)).status, 401);
    assert.equal((await c.get("/api/people")).status, 401);
  } finally { await w.close(); }
});

test("the course list's picture: editors send it, members see it, as an image", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { c: sam } = await memberSignedIn(w, admin, "sam");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}/thumbnail`;
    assert.equal((await admin.get(url)).status, 404);
    assert.equal((await admin.req("PUT", url, { data: "data:text/html;base64,PHNjcmlwdD4=" })).status, 400);
    assert.equal((await admin.req("PUT", url, { data: PNG })).status, 200);
    assert.ok((await admin.get("/api/courses")).body[0].thumbAt > 0);
    await admin.post(`/api/courses/${made.id}/members`, { username: "pat", role: "viewer" });
    const res = await w.app.inject({ method: "GET", url, headers: { cookie: [...pat.cookies].map(([k, v]) => `${k}=${v}`).join("; ") } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "image/png");
    assert.match(String(res.headers["cache-control"]), /^private/);
    assert.equal((await pat.req("PUT", url, { data: PNG })).status, 403);
    assert.equal((await sam.req("GET", url)).status, 404);
  } finally { await w.close(); }
});

test("history: restoring a version makes a new one (with its photo), nothing is lost", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { body: made } = await admin.post("/api/courses", { doc: doc("First", 1) });
    const url = `/api/courses/${made.id}`;
    await admin.req("PUT", `${url}/background`, { data: PNG });
    await admin.post(`${url}/members`, { username: "pat", role: "editor" });
    await pat.req("PUT", url, { doc: doc("Second", 2), version: 1 });
    await pat.req("PUT", `${url}/background`, { data: null });
    assert.equal((await admin.get(`${url}/background`)).body.data, null);
    const hist = (await admin.get(`${url}/versions`)).body;
    const first = hist.find((v: { version: number }) => v.version === 1);
    assert.equal((await admin.get(`${url}/versions/${first.id}`)).body.doc.name, "First");
    // (a version keeps the photo the course had then: none when it was created)
    assert.equal((await admin.get(`${url}/versions/${first.id}`)).body.photo, null);
    const r = await admin.post(`${url}/versions/${first.id}/restore`, {});
    assert.equal(r.body.version, 3);
    assert.equal((await admin.get(url)).body.doc.name, "First");
    const after = (await admin.get(`${url}/versions`)).body;
    assert.deepEqual(after.slice(0, 2).map((v: { kind: string; note: string }) => [v.kind, v.note]), [["restore", "Restored version 1"], ["autosave", ""]]);
    assert.equal((await admin.get(`${url}/versions/999999`)).status, 404);
    // (an editor can restore one too)
    assert.equal((await pat.post(`${url}/versions/${first.id}/restore`, {})).status, 200);
  } finally { await w.close(); }
});

test("other courses on the same ground: those you're on whose site overlaps, with their holes' lines", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const site = (west: number) => ({ location: null, bounds: { north: 40, south: 39.99, west, east: west + 0.01 }, baseElevationFt: 0 });
    const sum = { par: 3, length: 300, units: "ft", canvas: { width: 1000, height: 1000 }, lines: [[[10, 10], [300, 10]]] };
    const a = (await admin.post("/api/courses", { doc: { ...doc("Red course"), site: site(-89) }, summary: sum })).body.id;
    const b = (await admin.post("/api/courses", { doc: { ...doc("Blue course"), site: site(-88.995) }, summary: sum })).body.id;
    await admin.post("/api/courses", { doc: { ...doc("Far away"), site: site(-80) }, summary: sum });
    const near = (await admin.get(`/api/courses/${a}/nearby`)).body;
    assert.deepEqual(near.map((n: { name: string }) => n.name), ["Blue course"]);
    assert.equal(near[0].id, b);
    assert.deepEqual(near[0].lines, sum.lines);
    // A course with no holes yet on the same ground shows too (its ground can be shared into), with
    // no lines to draw
    const c = (await admin.post("/api/courses", { doc: { ...doc("Green course"), site: site(-88.998) }, summary: { ...sum, lines: [] } })).body.id;
    const now = (await admin.get(`/api/courses/${a}/nearby`)).body;
    assert.deepEqual(now.map((n: { name: string }) => n.name).sort(), ["Blue course", "Green course"]);
    assert.deepEqual(now.find((n: { id: string }) => n.id === c).lines, []);
  } finally { await w.close(); }
});

test("a park: courses in it show each other, wherever their sites are framed", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const site = (west: number) => ({ location: null, bounds: { north: 40, south: 39.99, west, east: west + 0.01 }, baseElevationFt: 0 });
    const sum = { par: 3, length: 300, units: "ft", canvas: { width: 1000, height: 1000 }, lines: [[[10, 10], [300, 10]]] };
    const a = (await admin.post("/api/courses", { doc: { ...doc("Red course"), site: site(-89) }, summary: sum })).body.id;
    const b = (await admin.post("/api/courses", { doc: { ...doc("Blue course"), site: site(-88.9) }, summary: sum })).body.id;
    assert.equal((await admin.get(`/api/courses/${a}/nearby`)).body.length, 0);
    await admin.post(`/api/courses/${a}/park`, { park: "Springfield Park" });
    await admin.post(`/api/courses/${b}/park`, { park: "springfield park" });
    const near = (await admin.get(`/api/courses/${a}/nearby`)).body;
    assert.deepEqual(near.map((n: { name: string; samePark: boolean }) => [n.name, n.samePark]), [["Blue course", true]]);
    assert.equal((await admin.get("/api/courses")).body.find((c: { id: string }) => c.id === a).park, "Springfield Park");
  } finally { await w.close(); }
});
