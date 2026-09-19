const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const Article = require("../models/Article");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, login, content } = require("./fixtures");
let database, http, cookies, pages;

before(async () => {
  database = await openDatabase("scaffolding");
  const users = await accounts();
  const draft = await Article.create({ reporter: users.reporter._id, workingContent: content });
  const pending = await Article.create({ reporter: users.reporter._id, workingContent: content, status: "pending" });
  http = await startHttp(app);
  cookies = {
    reporter: await login(http.baseUrl, users.reporter),
    editor: await login(http.baseUrl, users.editor),
  };
  pages = {
    reporter: ["/reporter", `/reporter/edit/${draft._id}`],
    editor: ["/editor", `/editor/review/${pending._id}`],
  };
});
after(async () => {
  await stopHttp(http?.server);
  await closeDatabase(database);
});

test("guests cannot access either workspace, including through client-supplied roles", async () => {
  for (const path of [...pages.reporter, ...pages.editor]) {
    const response = await fetch(http.baseUrl + path + "?role=editor", { headers: { "X-Role": "editor" } });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(await response.text(), /Please log in/);
  }
});

for (const role of ["reporter", "editor"]) {
  test(`${role} can access only their own page area and its assets`, async () => {
    for (const path of pages[role]) {
      const response = await fetch(http.baseUrl + path, { headers: { Cookie: cookies[role] } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const html = await response.text();
      assert.ok(html.includes(`class="container ${role}-workspace"`));
      assert.ok(html.includes(`href="/css/${role}.css"`));
      assert.match(html, /class="site-header"/);
      assert.match(html, /class="site-footer"/);
      if (path !== `/${role}`) assert.ok(html.includes(`data-article-id="${path.split("/").pop()}"`));
    }
    const otherRole = role === "reporter" ? "editor" : "reporter";
    for (const path of pages[otherRole]) {
      const response = await fetch(http.baseUrl + path, { headers: { Cookie: cookies[role] } });
      assert.equal(response.status, 403);
    }
    for (const path of [`/css/${role}.css`, `/js/${role}/index.js`, `/js/${role}/${role === "reporter" ? "edit" : "review"}.js`]) {
      assert.equal((await fetch(http.baseUrl + path)).status, 200);
    }
  });
}

test("workspace detail pages reject malformed article IDs using existing validation", async () => {
  for (const [role, action] of [["reporter", "edit"], ["editor", "review"]]) {
    const response = await fetch(`${http.baseUrl}/${role}/${action}/not-an-id`, { headers: { Cookie: cookies[role] } });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /A valid resource ID is required/);
  }
});

test("shared navigation renders workspace links only for their server-authorized role", async () => {
  for (const role of [null, "reporter", "editor"]) {
    const response = await fetch(http.baseUrl + "/", { headers: role ? { Cookie: cookies[role] } : {} });
    const html = await response.text();
    for (const target of ["reporter", "editor"]) {
      const hidden = target === role ? "" : " hidden";
      assert.ok(html.includes(`id="${target}-workspace-link" href="/${target}"${hidden}>`));
    }
  }
});

test("new namespaces retain shared JSON 404s and existing public endpoints still work", async () => {
  for (const namespace of ["comments", "weather"]) {
    const result = await request(http.baseUrl, `/api/${namespace}/__scaffold_missing__/extra`);
    assert.equal(result.status, 404);
    assert.equal(result.data.error.code, "NOT_FOUND");
    assert.ok(result.data.requestId);
  }
  assert.equal((await request(http.baseUrl, "/health")).status, 200);
  const articles = await request(http.baseUrl, "/api/articles");
  assert.equal(articles.status, 200);
  assert.deepEqual(articles.data.data, []);
  assert.equal(await Article.countDocuments(), 2);
});
