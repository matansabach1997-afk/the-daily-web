const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const Article = require("../models/Article");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, login, content } = require("./fixtures");
let database, http, users, cookies;
before(async () => {
  database = await openDatabase("editor");
  users = await accounts();
  http = await startHttp(app);
  cookies = { editor: await login(http.baseUrl, users.editor), reporter: await login(http.baseUrl, users.reporter) };
});
after(async () => { await stopHttp(http?.server); await closeDatabase(database); });
function call(path, method = "GET", body, role = "editor") {
  return request(http.baseUrl, path, { method, body, cookie: cookies[role] });
}
async function page(path, role = "editor") {
  return fetch(http.baseUrl + path, { headers: cookies[role] ? { Cookie: cookies[role] } : {} });
}

test("Editor pages enforce roles, validate IDs and reject nonexistent reviews", async () => {
  const article = await Article.create({ reporter: users.reporter._id, workingContent: content, status: "pending" });
  for (const path of ["/editor", `/editor/review/${article._id}`]) {
    assert.equal((await page(path, "guest")).status, 401);
    assert.equal((await page(path, "reporter")).status, 403);
    const response = await page(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    assert.match(html, /\/css\/editor.css/);
    assert.match(html, path === "/editor" ? /id="status-filter"/ : /Currently published content/);
  }
  assert.equal((await page("/editor/review/not-an-id")).status, 400);
  assert.equal((await page("/editor/review/0123456789abcdef01234567")).status, 404);
});

test("Editor queue filters pending articles and review approval publishes the edited working copy", async () => {
  const article = await Article.create({ reporter: users.reporter._id, workingContent: { ...content, title: "Submitted update" }, status: "pending", publishedContent: content, publishedAt: new Date(), publicationHistory: [new Date()] });
  const result = await call("/api/workspace/articles?status=pending");
  assert.ok(result.data.data.some((row) => row._id === String(article._id)));
  assert.ok(result.data.data.every((row) => row.status === "pending"));
  const privateRead = await call(`/api/workspace/articles/${article._id}`);
  assert.equal(privateRead.data.data.workingContent.title, "Submitted update");
  assert.equal(privateRead.data.data.publishedContent.title, content.title);
  const edited = { ...content, title: "Editor's final version" };
  assert.equal((await call(`/api/articles/${article._id}/working-content`, "PATCH", { workingContent: edited })).status, 200);
  assert.equal((await call(`/api/articles/${article._id}`)).data.data.title, content.title);
  const approved = await call(`/api/articles/${article._id}/approvals`, "POST", {});
  assert.equal(approved.data.data.status, "published");
  assert.deepEqual(approved.data.data.publishedContent, edited);
  assert.equal((await call(`/api/articles/${article._id}`)).data.data.title, edited.title);
});

test("Return requires a note; deletion and editorial actions remain server protected", async () => {
  const article = await Article.create({ reporter: users.reporter._id, workingContent: content, status: "pending" });
  const path = `/api/articles/${article._id}`;
  assert.equal((await call(path + "/returns", "POST", { editorNote: " " })).status, 422);
  for (const role of ["guest", "reporter"]) {
    for (const [suffix, method, body] of [["/approvals", "POST", {}], ["/returns", "POST", { editorNote: "Fix title" }], ["", "DELETE", undefined]]) {
      assert.equal((await call(path + suffix, method, body, role)).status, role === "guest" ? 401 : 403);
    }
  }
  const returned = await call(path + "/returns", "POST", { editorNote: "Explain the evidence." });
  assert.equal(returned.data.data.status, "returned");
  assert.equal(returned.data.data.editorNote, "Explain the evidence.");
  assert.equal((await call(path + "/approvals", "POST", {})).status, 409);
  assert.equal((await call(path, "DELETE")).status, 204);
  assert.equal((await page(`/editor/review/${article._id}`)).status, 404);
  assert.equal((await call(path, "DELETE")).status, 204);
});
