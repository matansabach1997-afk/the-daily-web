const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const Article = require("../models/Article");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, login, content } = require("./fixtures");

let database, http, users, cookies;

before(async () => {
  database = await openDatabase("reporter");
  users = await accounts();
  http = await startHttp(app);
  cookies = {
    reporter: await login(http.baseUrl, users.reporter),
    other: await login(http.baseUrl, users.other),
    editor: await login(http.baseUrl, users.editor),
  };
});

after(async () => {
  await stopHttp(http?.server);
  await closeDatabase(database);
});

function call(path, method = "GET", body, role = "reporter") {
  return request(http.baseUrl, path, { method, body, cookie: cookies[role] });
}

test("Reporter workspace renders the feature controls and remains role-protected", async () => {
  const response = await fetch(http.baseUrl + "/reporter", { headers: { Cookie: cookies.reporter } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="create-draft-button"/);
  assert.match(html, /id="article-list"/);
  assert.match(html, /src="\/js\/reporter\/index.js"/);
  assert.equal((await fetch(http.baseUrl + "/reporter", { headers: { Cookie: cookies.editor } })).status, 403);
});

test("Reporter edit page enforces ownership before rendering private article UI", async () => {
  const own = await Article.create({ reporter: users.reporter._id, workingContent: content });
  const other = await Article.create({ reporter: users.other._id, workingContent: content });

  const response = await fetch(`${http.baseUrl}/reporter/edit/${own._id}`, { headers: { Cookie: cookies.reporter } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="article-form"/);
  assert.match(html, /id="save-button"/);
  assert.match(html, /id="submit-button"/);
  assert.match(html, /id="revision-button"/);
  assert.match(html, /id="editor-note-panel"/);
  assert.match(html, /id="reporter-back-link" href="\/reporter"/);
  assert.match(html, /Before closing or refreshing, wait for Saved/);

  assert.equal((await fetch(`${http.baseUrl}/reporter/edit/${other._id}`, { headers: { Cookie: cookies.reporter } })).status, 404);
});

test("Reporter API flow used by the UI persists saves, returns notes and supports resubmission", async () => {
  const created = await call("/api/articles", "POST", { workingContent: {} });
  assert.equal(created.status, 201);
  const articleId = created.data.data._id;
  const articlePath = `/api/articles/${articleId}`;

  const saved = await call(articlePath + "/working-content", "PATCH", { workingContent: content });
  assert.equal(saved.status, 200);
  const refreshed = await call(`/api/workspace/articles/${articleId}`);
  assert.deepEqual(refreshed.data.data.workingContent, content);

  const submitted = await call(articlePath + "/submissions", "POST", {});
  assert.equal(submitted.data.data.status, "pending");

  const returned = await call(articlePath + "/returns", "POST", { editorNote: "Please clarify the final paragraph." }, "editor");
  assert.equal(returned.data.data.status, "returned");
  assert.equal(returned.data.data.editorNote, "Please clarify the final paragraph.");

  const revisedContent = { ...content, body: content.body + " Updated." };
  const corrected = await call(articlePath + "/working-content", "PATCH", { workingContent: revisedContent });
  assert.equal(corrected.status, 200);
  const resubmitted = await call(articlePath + "/submissions", "POST", {});
  assert.equal(resubmitted.data.data.status, "pending");

  const ownList = await call("/api/workspace/articles");
  assert.ok(ownList.data.data.some((article) => article._id === articleId));
  assert.ok(ownList.data.data.every((article) => article.reporter._id === String(users.reporter._id)));
});

test("Published Reporter article can start a revision through the existing workflow", async () => {
  const article = await Article.create({
    reporter: users.reporter._id,
    workingContent: { ...content, title: "Stale working title" },
    publishedContent: content,
    publishedAt: new Date(),
    publicationHistory: [new Date()],
    status: "published",
  });

  const result = await call(`/api/articles/${article._id}/revisions`, "POST", {});
  assert.equal(result.status, 200);
  assert.equal(result.data.data.status, "draft");
  assert.deepEqual(result.data.data.workingContent, content);
});
