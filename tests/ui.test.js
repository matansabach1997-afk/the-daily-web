const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, login } = require("./fixtures");
let database, http, users;

before(async () => {
  database = await openDatabase("ui");
  users = await accounts();
  http = await startHttp(app);
});
after(async () => {
  await stopHttp(http?.server);
  await closeDatabase(database);
});

test("home, login and 404 reuse the guest navigation and footer", async () => {
  for (const [path, status] of [["/", 200], ["/login", 200], ["/missing", 404]]) {
    const response = await fetch(http.baseUrl + path);
    assert.equal(response.status, status);
    const html = await response.text();
    assert.match(html, /href="\/css\/base.css"/);
    assert.match(html, /id="login-link" href="\/login">Login/);
    assert.match(html, /id="account-controls" class="account-controls" hidden/);
    assert.match(html, /id="main-content"/);
    assert.match(html, /class="site-footer"/);
  }
});

for (const role of ["reporter", "editor"]) {
  test(`${role} login appears in server HTML, redirects /login and logout clears the session`, async () => {
    const user = users[role];
    const cookie = await login(http.baseUrl, user);
    const response = await fetch(http.baseUrl + "/", { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    assert.ok(html.includes(`${user.username} (${role})`));
    assert.match(html, /id="account-controls" class="account-controls">/);
    assert.match(html, /id="login-link" href="\/login" hidden/);
    assert.ok(!html.includes(cookie.split("=")[1]));
    assert.ok(!html.includes("passwordHash"));

    const current = await request(http.baseUrl, "/api/auth/session", { cookie });
    assert.equal(current.data.data.user.role, role);
    const redirect = await fetch(http.baseUrl + "/login", { headers: { Cookie: cookie }, redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/");

    assert.equal((await request(http.baseUrl, "/api/auth/session", { method: "DELETE", cookie })).status, 204);
    assert.equal((await request(http.baseUrl, "/api/auth/session", { cookie })).data.data.user, null);
    const loggedOut = await fetch(http.baseUrl + "/login", { headers: { Cookie: cookie } });
    assert.equal(loggedOut.status, 200);
    const clearedCookie = loggedOut.headers.get("set-cookie");
    assert.match(clearedCookie, /^daily_web_session=;/);
    assert.match(clearedCookie, /Expires=Thu, 01 Jan 1970/);
    assert.match(await loggedOut.text(), /id="login-form"/);
  });
}

test("invalid login uses the existing error contract and leaves the page usable", async () => {
  const failed = await request(http.baseUrl, "/api/auth/login", {
    method: "POST", body: { username: users.reporter.username, password: "incorrect-test-password" },
  });
  assert.equal(failed.status, 401);
  assert.equal(failed.data.error.code, "INVALID_CREDENTIALS");
  assert.equal(failed.data.error.message, "Invalid username or password.");
  assert.equal(failed.headers.get("set-cookie"), null);
  assert.equal((await fetch(http.baseUrl + "/login")).status, 200);
  assert.equal((await request(http.baseUrl, "/api/auth/session")).data.data.user, null);
});
