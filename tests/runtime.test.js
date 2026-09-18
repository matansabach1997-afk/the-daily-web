const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const express = require("express");
const app = require("../app");
const getEnvironment = require("../config/environment");
const { testDatabaseUri, startHttp, stopHttp } = require("./helpers");
let http;
before(async () => { http = await startHttp(app); });
after(async () => { await stopHttp(http?.server); });

test("import exits without connecting to MongoDB or listening", () => {
  const result = spawnSync(process.execPath, ["-e", "require('./app')"], { cwd: require("node:path").resolve(__dirname, ".."), timeout: 5000 });
  assert.equal(result.status, 0);
});

test("existing homepage, assets, health and safe API/page 404", async () => {
  for (const [path, status, contentType] of [["/", 200, "text/html"], ["/health", 200, "application/json"], ["/css/style.css", 200, "text/css"], ["/missing", 404, "text/html"], ["/api/missing?secret=do-not-reflect", 404, "application/json"]]) {
    const res = await fetch(http.baseUrl + path);
    assert.equal(res.status, status);
    assert.ok(res.headers.get("content-type").includes(contentType));
    assert.ok(res.headers.get("x-request-id"));
    const body = await res.text();
    assert.ok(!body.includes("do-not-reflect"));
  }
});

test("invalid JSON and oversized bodies return controlled errors", async () => {
  for (const [body, expected] of [["{broken", 400], [JSON.stringify({ text: "a".repeat(270000) }), 413]]) {
    const res = await fetch(http.baseUrl + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(res.status, expected);
    const error = await res.json();
    assert.equal(typeof error.error.code, "string");
    assert.ok(error.requestId);
  }
});

test("shared login shell and assets work for guests without MongoDB", async () => {
  const page = await fetch(http.baseUrl + "/login");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  const html = await page.text();
  assert.match(html, /id="login-form"/);
  assert.match(html, /id="login-fields" disabled/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /class="site-footer"/);
  for (const path of ["/css/base.css", "/js/main.js", "/js/login.js"]) {
    assert.equal((await fetch(http.baseUrl + path)).status, 200);
  }
  const unavailable = await fetch(http.baseUrl + "/login", {
    headers: { Cookie: "daily_web_session=" + "x".repeat(43) },
  });
  assert.equal(unavailable.status, 503);
  assert.match(await unavailable.text(), /class="site-footer"/);
});

test("unexpected errors are sanitized", async () => {
  const failing = express();
  failing.use(require("../middleware/requestContext"));
  failing.get("/api/test", () => { throw new Error("secret-password-in-error"); });
  failing.use(require("../middleware/errorHandler"));
  const fixture = await startHttp(failing);
  try {
    const res = await fetch(fixture.baseUrl + "/api/test");
    assert.equal(res.status, 500);
    assert.ok(!(await res.text()).includes("secret-password"));
  } finally { await stopHttp(fixture.server); }
});

test("missing database configuration fails clearly", () => {
  const saved = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  try { assert.throws(getEnvironment, /MONGODB_URI/); }
  finally { if (saved === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = saved; }
});

test("database-backed APIs return 503 when no database is connected", async () => {
  for (const path of ["/api/articles", "/api/articles/000000000000000000000001"]) {
    const response = await fetch(http.baseUrl + path);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "DATABASE_UNAVAILABLE");
  }
  const response = await fetch(http.baseUrl + "/api/auth/session", { headers: { Cookie: "daily_web_session=" + "x".repeat(43) } });
  assert.equal(response.status, 503);
  assert.equal((await fetch(http.baseUrl + "/health")).status, 200);
});

test("test database safeguard refuses development and remote databases", () => {
  const saved = process.env.TEST_MONGODB_URI;
  try {
    for (const uri of ["mongodb://127.0.0.1:27017/the-daily-web", "mongodb://example.com/the_daily_web_test"]) {
      process.env.TEST_MONGODB_URI = uri;
      assert.throws(() => testDatabaseUri("runtime"), /Refusing unsafe cleanup/);
    }
  } finally { if (saved === undefined) delete process.env.TEST_MONGODB_URI; else process.env.TEST_MONGODB_URI = saved; }
});
