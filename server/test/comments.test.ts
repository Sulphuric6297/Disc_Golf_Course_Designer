import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSignedIn, Client, memberSignedIn, world } from "./helpers.js";

const doc = () => ({ version: 1, name: "Springfield Park", holes: [{ id: "h1" }], items: [] });

test("comments: pinned threads, replies, resolve, @mentions and assignments with notices; viewers comment too", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { c: sam } = await memberSignedIn(w, admin, "sam");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}/comments`;
    await admin.post(`/api/courses/${made.id}/members`, { username: "pat", role: "viewer" });

    // Not on the course: nothing
    assert.equal((await sam.get(url)).status, 404);
    assert.equal((await sam.post(url, { body: "hi", anchor: { x: 1, y: 2 } })).status, 404);
    // A thread needs a pin
    assert.equal((await pat.post(url, { body: "No pin" })).status, 400);
    const { body: t } = await pat.post(url, { body: "Move this tee back @admin", anchor: { x: 100, y: 200, on: { kind: "hole", id: "h1" } } });
    assert.ok(t.id);
    // The admin was mentioned
    let n = (await admin.get("/api/notifications")).body;
    assert.equal(n.unread, 1);
    assert.deepEqual([n.items[0].kind, n.items[0].by, n.items[0].course, n.items[0].threadId], ["mention", "Pat", "Springfield Park", t.id]);

    // A reply tells Pat; it re-opens a resolved thread
    await admin.req("PATCH", `${url}/${t.id}`, { resolved: true });
    assert.ok((await pat.get(url)).body[0].resolvedAt);
    await admin.post(url, { body: "Done, take a look", parentId: t.id });
    const threads = (await pat.get(url)).body;
    assert.equal(threads.length, 1);
    assert.equal(threads[0].replies.length, 1);
    assert.equal(threads[0].resolvedAt, null);
    assert.equal(threads[0].anchor.on.id, "h1");
    assert.equal((await pat.get("/api/notifications")).body.items[0].kind, "reply");

    // Assigned to Pat (on the course); not to someone who isn't
    const samId = (await admin.get("/api/admin/users")).body.find((u: { username: string }) => u.username === "sam").id;
    const patId = (await admin.get("/api/admin/users")).body.find((u: { username: string }) => u.username === "pat").id;
    assert.equal((await admin.req("PATCH", `${url}/${t.id}`, { assigneeId: samId })).status, 400);
    await admin.req("PATCH", `${url}/${t.id}`, { assigneeId: patId });
    assert.equal((await pat.get(url)).body[0].assignee, "Pat");
    assert.equal((await pat.get("/api/notifications")).body.items[0].kind, "assigned");

    // Only its author changes it; an owner deletes any
    assert.equal((await admin.req("PATCH", `${url}/${t.id}`, { body: "Edited by someone else" })).status, 403);
    assert.equal((await pat.req("PATCH", `${url}/${t.id}`, { body: "Move this tee back 10 ft" })).status, 200);
    assert.ok((await pat.get(url)).body[0].editedAt);
    const reply = (await pat.get(url)).body[0].replies[0].id;
    assert.equal((await pat.del(`${url}/${reply}`)).status, 403);
    assert.equal((await admin.del(`${url}/${t.id}`)).status, 200);
    assert.equal((await pat.get(url)).body.length, 0);

    // Read
    await pat.post("/api/notifications/read", {});
    assert.equal((await pat.get("/api/notifications")).body.unread, 0);
    assert.equal((await new Client(w.app).get("/api/notifications")).status, 401);
  } finally { await w.close(); }
});

test("comments: new for you until you read them (your own never); all read at once; reactions on and off, one of each per person", async () => {
  const w = await world();
  try {
    const { c: admin } = await adminSignedIn(w);
    const { c: pat } = await memberSignedIn(w, admin, "pat");
    const { body: made } = await admin.post("/api/courses", { doc: doc() });
    const url = `/api/courses/${made.id}/comments`;
    await admin.post(`/api/courses/${made.id}/members`, { username: "pat", role: "editor" });
    const { body: t } = await pat.post(url, { body: "Turn this tee", anchor: { x: 1, y: 2 } });
    const { body: t2 } = await pat.post(url, { body: "And this one", anchor: { x: 3, y: 4 } });
    // New for the admin, not for Pat who wrote them
    assert.deepEqual((await admin.get(url)).body.map((x: any) => x.unread), [true, true]);
    assert.deepEqual((await pat.get(url)).body.map((x: any) => x.unread), [false, false]);
    await admin.post(`${url}/${t.id}/read`, {});
    assert.deepEqual((await admin.get(url)).body.map((x: any) => x.unread), [false, true]);
    // The admin's reply: new for Pat, still read for the admin
    await admin.post(url, { body: "Done", parentId: t.id });
    assert.equal((await pat.get(url)).body[0].unread, true);
    assert.equal((await admin.get(url)).body[0].unread, false);
    await admin.post(`${url}/read`, {});
    assert.deepEqual((await admin.get(url)).body.map((x: any) => x.unread), [false, false]);
    // Reactions: on, counted, yours marked; off again; only the few there are
    assert.equal((await pat.post(`${url}/${t2.id}/react`, { emoji: "👍" })).body.on, true);
    await admin.post(`${url}/${t2.id}/react`, { emoji: "👍" });
    let r = (await admin.get(url)).body[1].reactions;
    assert.deepEqual(r, [{ emoji: "👍", count: 2, mine: true }]);
    assert.equal((await admin.post(`${url}/${t2.id}/react`, { emoji: "👍" })).body.on, false);
    r = (await pat.get(url)).body[1].reactions;
    assert.deepEqual(r, [{ emoji: "👍", count: 1, mine: true }]);
    assert.equal((await pat.post(`${url}/${t2.id}/react`, { emoji: "🔥" })).status, 400);
  } finally { await w.close(); }
});
