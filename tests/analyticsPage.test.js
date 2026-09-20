const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const { openDatabase, closeDatabase, startHttp, stopHttp } = require("./helpers");
const { accounts, login } = require("./fixtures");
let database, http, cookies;

before(async () => {
  database = await openDatabase("analyticspage");
  const users = await accounts();
  http = await startHttp(app);
  cookies = { reporter: await login(http.baseUrl, users.reporter), editor: await login(http.baseUrl, users.editor) };
});
after(async () => { await stopHttp(http?.server); await closeDatabase(database); });

test("central Analytics page is Editor-only server-side and reuses the shared shell", async () => {
  for (const [role, expected] of [[null, 401], ["reporter", 403], ["editor", 200]]) {
    const response = await fetch(http.baseUrl + "/analytics", { headers: role ? { Cookie: cookies[role] } : {} });
    assert.equal(response.status, expected);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    if (role === "editor") {
      assert.match(html, /analytics-search-form/);
      assert.match(html, /No article selected/);
      assert.match(html, /\/js\/analytics.js/);
      assert.match(html, /\/css\/analytics.css/);
      assert.match(html, /site-header/);
      assert.match(html, /site-footer/);
      assert.ok(!html.includes("workingContent"));
    } else assert.ok(!html.includes("analytics-search-form"));
  }
});

test("Analytics navigation follows Editor role; feed includes controls and identity before feed script", async () => {
  for (const role of [null, "reporter", "editor"]) {
    const response = await fetch(http.baseUrl + "/", { headers: role ? { Cookie: cookies[role] } : {} });
    const html = await response.text();
    assert.ok(html.includes(`id="analytics-link" href="/analytics"${role === "editor" ? "" : " hidden"}>`));
    assert.match(html, /value="popularity"/);
    assert.match(html, /id="feed-viewed"/);
    assert.ok(html.indexOf('src="/js/browser-identity.js"') < html.indexOf('src="/js/feed.js"'));
  }
  for (const asset of ["/js/analytics.js", "/css/analytics.css"]) assert.equal((await fetch(http.baseUrl + asset)).status, 200);
});
