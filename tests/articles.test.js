const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const Article = require("../models/Article");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, login, content } = require("./fixtures");
let database, http, users, cookies;
before(async () => {
  database = await openDatabase("articles");
  users = await accounts();
  http = await startHttp(app);
  cookies = {};
  for (const role of ["reporter", "other", "editor"]) cookies[role] = await login(http.baseUrl, users[role]);
});
after(async () => { await stopHttp(http?.server); await closeDatabase(database); });

async function call(path, method = "GET", body, role = "reporter") {
  return request(http.baseUrl, path, { method, body, cookie: cookies[role] });
}

test("complete HTTP workflow preserves first publication and public copy during revisions", async () => {
  const created = await call("/api/articles", "POST", { workingContent: {} });
  assert.equal(created.status, 201);
  const articleId = created.data.data._id;
  const path = `/api/articles/${articleId}`;
  assert.equal(created.data.data.status, "draft");
  assert.equal(created.data.data.publishedContent, null);
  assert.equal((await call(path)).status, 404);
  assert.equal((await call(path + "/submissions", "POST")).status, 422);
  const incomplete = { title: "Autosaved draft", summary: "", body: "", category: "", imageUrl: "" };
  assert.equal((await call(path + "/working-content", "PATCH", { workingContent: incomplete })).status, 200);
  assert.deepEqual((await call(`/api/workspace/articles/${articleId}`)).data.data.workingContent, incomplete);
  assert.equal((await call(path + "/submissions", "POST")).status, 422);
  assert.equal((await call(path + "/working-content", "PATCH", { workingContent: content })).status, 200);
  assert.equal((await call(path + "/submissions", "POST")).data.data.status, "pending");
  assert.equal((await call(path + "/working-content", "PATCH", { workingContent: content })).status, 409);
  assert.equal((await call(path + "/returns", "POST", { editorNote: " " }, "editor")).status, 422);
  assert.equal((await call(path + "/returns", "POST", { editorNote: "Please revise" }, "editor")).data.data.status, "returned");
  assert.equal((await call(path + "/submissions", "POST")).data.data.status, "pending");
  const first = await call(path + "/approvals", "POST", undefined, "editor");
  assert.equal(first.status, 200);
  const originalDate = first.data.data.publishedAt;
  assert.deepEqual(first.data.data.publicationHistory, [originalDate]);
  assert.equal((await call(path)).data.data.title, content.title);
  assert.equal((await call(path + "/approvals", "POST", undefined, "editor")).status, 409);

  // Proves Start Revision copies the approved version, not a stale working value.
  await Article.updateOne({ _id: articleId }, { $set: { "workingContent.title": "stale" } });
  const revision = await call(path + "/revisions", "POST");
  assert.equal(revision.data.data.status, "draft");
  assert.deepEqual(revision.data.data.workingContent, content);
  const next = { ...content, title: "Unapproved private title" };
  assert.equal((await call(path + "/working-content", "PATCH", { workingContent: next })).status, 200);
  assert.equal((await call(path)).data.data.title, content.title);
  await call(path + "/submissions", "POST");
  assert.equal((await call(path)).data.data.title, content.title);
  await call(path + "/returns", "POST", { editorNote: "Correct again" }, "editor");
  assert.equal((await call(path)).data.data.title, content.title);
  await call(path + "/submissions", "POST");
  const edited = { ...next, title: "Editor approved title" };
  assert.equal((await call(path + "/working-content", "PATCH", { workingContent: edited }, "editor")).status, 200);
  const approval = await call(path + "/approvals", "POST", undefined, "editor");
  assert.equal(approval.data.data.publishedAt, originalDate);
  assert.equal(approval.data.data.publicationHistory.length, 2);
  assert.equal(approval.data.data.publicationHistory[0], originalDate);
  assert.ok(new Date(approval.data.data.publicationHistory[1]) >= new Date(originalDate));
  assert.equal(approval.data.data.editorNote, "");
  assert.equal((await call(path)).data.data.title, edited.title);
  assert.equal((await call(path, "DELETE", undefined, "editor")).status, 204);
  assert.equal((await call(path)).status, 404);
  assert.equal((await call(path, "DELETE", undefined, "editor")).status, 204);
  assert.equal(await Article.findById(articleId), null);
});

test("private workspace filters and Editor editing use the same existing contract", async () => {
  const owned = await Article.create({ reporter: users.reporter._id, workingContent: content });
  const other = await Article.create({ reporter: users.other._id, workingContent: content, status: "pending" });
  const query = await call(`/api/workspace/articles?reporterId=${users.other._id}&status=pending`, "GET", undefined, "editor");
  assert.equal(query.status, 200);
  assert.ok(query.data.data.some((article) => article._id === String(other._id)));
  assert.ok(query.data.data.every((article) => article.status === "pending" && article.reporter._id === String(users.other._id)));
  assert.equal((await call("/api/workspace/articles?status=unknown")).status, 400);
  assert.equal((await call("/api/workspace/articles?cursor=invalid")).status, 400);
  const path = `/api/articles/${owned._id}`;
  assert.equal((await call(path + "/working-content", "PATCH", { workingContent: content }, "editor")).status, 200);
  await call(path + "/submissions", "POST");
  await call(path + "/approvals", "POST", undefined, "editor");
  for (const role of ["reporter", "editor"]) assert.equal((await call(path + "/working-content", "PATCH", { workingContent: content }, role)).status, 409);
  assert.equal((await call(path + "/revisions", "POST", undefined, "editor")).data.data.status, "draft");
});

test("guest, role and ownership restrictions cover all write actions", async () => {
  const draft = await Article.create({ reporter: users.reporter._id, workingContent: content });
  const path = `/api/articles/${draft._id}`;
  assert.equal((await call("/api/articles", "POST", { workingContent: {} }, "editor")).status, 403);
  for (const [suffix, method, body] of [["/working-content", "PATCH", { workingContent: content }], ["/submissions", "POST"], ["/revisions", "POST"]]) {
    assert.equal((await call(path + suffix, method, body, "guest")).status, 401);
    assert.equal((await call(path + suffix, method, body, "other")).status, 404);
  }
  for (const suffix of ["/returns", "/approvals", ""]) {
    const method = suffix ? "POST" : "DELETE";
    assert.equal((await call(path + suffix, method, {}, "guest")).status, 401);
    assert.equal((await call(path + suffix, method, {}, "reporter")).status, 403);
  }
  assert.equal((await call(`/api/workspace/articles/${draft._id}`, "GET", undefined, "other")).status, 404);
  const owned = await call("/api/workspace/articles");
  assert.ok(owned.data.data.every((article) => article.reporter._id === String(users.reporter._id)));
  assert.equal((await call("/api/workspace/articles?reporterId=" + users.other._id)).status, 403);
});

test("state guards reject every unsupported transition and tampered payloads", async () => {
  for (const status of ["draft", "pending", "returned", "published"]) {
    const article = await Article.create({ reporter: users.reporter._id, workingContent: content, status, ...(status === "published" ? { publishedContent: content, publishedAt: new Date() } : {}) });
    const path = `/api/articles/${article._id}`;
    const actions = [
      ["submissions", "reporter", ["draft", "returned"], undefined],
      ["returns", "editor", ["pending"], { editorNote: "Correction" }],
      ["approvals", "editor", ["pending"], undefined],
      ["revisions", "reporter", ["published"], undefined],
    ];
    for (const [action, role, allowed, body] of actions) {
      if (!allowed.includes(status)) assert.equal((await call(`${path}/${action}`, "POST", body, role)).status, 409, `${status} -> ${action}`);
    }
  }
  const draft = await Article.create({ reporter: users.reporter._id, workingContent: content });
  const path = `/api/articles/${draft._id}`;
  for (const forbidden of ["reporter", "status", "publishedContent", "publishedAt", "publicationHistory", "editorNote"]) {
    assert.equal((await call(path + "/working-content", "PATCH", { workingContent: content, [forbidden]: "tampered" })).status, 400);
  }
  assert.equal((await call(path + "/working-content", "PATCH", { workingContent: { title: "incomplete envelope" } })).status, 400);
  assert.equal((await call(path + "/submissions", "POST", { status: "published" })).status, 400);
  assert.equal((await call("/api/articles/not-an-id/working-content", "PATCH", { workingContent: content })).status, 400);
  await Article.updateOne({ _id: draft._id }, { $set: { status: "pending", "workingContent.body": "" } });
  assert.equal((await call(path + "/approvals", "POST", undefined, "editor")).status, 422);
});
