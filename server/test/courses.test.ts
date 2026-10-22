import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSignedIn, memberSignedIn, world } from "./helpers.js";

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

test("saving from an older version is refused, saying who saved", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    await admin.post(`/api/courses/${made.id}/members`, { username: "pat", role: "editor" });
    assert.equal((await pat.req("PUT", `/api/courses/${made.id}`, { doc: doc("Pat's edit", 3), version: 1 })).body.version, 2);
    const late = await admin.req("PUT", `/api/courses/${made.id}`, { doc: doc("Admin's edit"), version: 1 });
    assert.equal(late.status, 409);
    assert.equal(late.body.version, 2);
    assert.match(late.body.error, /^Pat saved this course/);
    const { body: got } = await admin.get(`/api/courses/${made.id}`);
    assert.equal(got.doc.name, "Pat's edit");
    assert.equal(got.version, 2);
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
