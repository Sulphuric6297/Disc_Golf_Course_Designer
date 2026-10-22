import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSignedIn, Client, memberSignedIn, ORIGIN, world } from "./helpers.js";

const doc = () => ({ version: 1, name: "Springfield Park", holes: [{ id: "h1" }], items: [] });
const PNG = "data:image/png;base64,iVBORw0KGgo=";

test("public links show the published site's parts they allow: password, expiry, turned off, a new address", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}`;
    await admin.post(`${url}/members`, { username: "pat", role: "editor" });
    assert.equal((await pat.post(`${url}/links`, { perms: {} })).status, 403);

    const { body: link } = await admin.post(`${url}/links`, { label: "Club website", perms: { printedMap: true, stats: true, view3d: true } });
    const anon = new Client(w.app);
    const pub = (path = "") => anon.req("GET", `/api/public/${link.token}${path}`, undefined, {});
    // No site yet: nothing
    assert.equal((await pub()).status, 404);
    await admin.post(`${url}/site`, {
      parts: { printedMap: true, teeSigns: true, stats: true, view3d: true },
      info: { name: "Springfield Park", holes: [{ label: "1", par: 3 }], totals: { par: 3 } },
      doc: { ...doc(), background: "data:image/png;base64,AA" },
      files: [{ name: "map.png", data: PNG }, { name: "sign-1.png", data: PNG }, { name: "course.gpx", data: "data:application/gpx+xml;base64,PGdweD4=" }]
    });
    const { body: p } = await pub();
    // (the link allows the map picture, stats and 3D; the site has tee signs too, the link doesn't)
    assert.deepEqual(p.files, ["map.png"]);
    assert.equal(p.shown.teeSigns, false);
    assert.equal(p.shown.view3d, true);
    assert.equal(p.info.holes.length, 1);
    assert.equal((await pub("/files/map.png")).status, 200);
    assert.equal((await pub("/files/sign-1.png")).status, 404);
    assert.equal((await pub("/files/course.gpx")).status, 404);
    const { body: c } = await pub("/course");
    assert.equal(c.doc.background, null);

    // A password
    const lid = link.id;
    await admin.req("PATCH", `${url}/links/${lid}`, { password: "fore!fore" });
    assert.equal((await pub()).status, 401);
    assert.equal((await anon.req("GET", `/api/public/${link.token}`, undefined, { "x-link-password": "nope" })).status, 401);
    assert.equal((await anon.req("GET", `/api/public/${link.token}`, undefined, { "x-link-password": "fore!fore" })).status, 200);
    await admin.req("PATCH", `${url}/links/${lid}`, { password: null });
    // Turned off, on again; expired; a new address
    await admin.req("PATCH", `${url}/links/${lid}`, { revoked: true });
    assert.equal((await pub()).status, 404);
    await admin.req("PATCH", `${url}/links/${lid}`, { revoked: false });
    assert.equal((await pub()).status, 200);
    await admin.req("PATCH", `${url}/links/${lid}`, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    assert.equal((await pub()).status, 404);
    await admin.req("PATCH", `${url}/links/${lid}`, { expiresAt: null });
    const { body: renewed } = await admin.req("PATCH", `${url}/links/${lid}`, { newToken: true });
    assert.equal((await pub()).status, 404);
    assert.equal((await anon.req("GET", `/api/public/${renewed.token}`, undefined, {})).status, 200);
    // Stats off: no numbers per hole
    await admin.req("PATCH", `${url}/links/${lid}`, { perms: { printedMap: true } });
    assert.equal((await anon.req("GET", `/api/public/${renewed.token}`, undefined, {})).body.info.holes.length, 0);
    assert.equal((await anon.req("GET", `/api/public/${renewed.token}/course`, undefined, {})).status, 404);
    assert.equal((await admin.get(`${url}/links`)).body.length, 1);
    assert.ok(ORIGIN);
  } finally { await w.close(); }
});

test("a viewer's permissions: kept per person, sent with the course", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}`;
    await admin.post(`${url}/members`, { username: "pat", role: "viewer", perms: { view3d: true, map: false, copy: false } });
    assert.deepEqual((await pat.get(url)).body.perms, { view3d: true, map: false, copy: false });
    // (a role change alone keeps them)
    await admin.post(`${url}/members`, { username: "pat", role: "viewer" });
    assert.equal((await pat.get(url)).body.perms.view3d, true);
    assert.equal((await admin.get(url)).body.perms, null);
  } finally { await w.close(); }
});

test("a link's own name: opens it like its address; unique; cleared", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}`;
    await admin.post(`${url}/site`, { parts: { printedMap: true }, info: { name: "Springfield Park", holes: [] }, doc: null, files: [] });
    const { body: l } = await admin.post(`${url}/links`, { slug: "Springfield-Park", perms: { printedMap: true } });
    const anon = new Client(w.app);
    assert.equal((await anon.req("GET", "/api/public/springfield-park", undefined, {})).body.info.name, "Springfield Park");
    assert.equal((await admin.post(`${url}/links`, { slug: "springfield-park", perms: {} })).status, 409);
    assert.equal((await admin.post(`${url}/links`, { slug: "no", perms: {} })).status, 400);
    await admin.req("PATCH", `${url}/links/${l.id}`, { slug: null });
    assert.equal((await anon.req("GET", "/api/public/springfield-park", undefined, {})).status, 404);
    assert.equal((await anon.req("GET", `/api/public/${l.token}`, undefined, {})).status, 200);
  } finally { await w.close(); }
});
