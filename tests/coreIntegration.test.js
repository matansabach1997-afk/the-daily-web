const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");
const User = require("../models/User");
const Session = require("../models/Session");
const Article = require("../models/Article");
const app = require("../app");
const { openDatabase, closeDatabase, startHttp, stopHttp, request } = require("./helpers");
const { accounts, login, password } = require("./fixtures");
let database, http, users;
before(async () => { database = await openDatabase("core"); users = await accounts(); http = await startHttp(app); });
after(async () => { await stopHttp(http?.server); await closeDatabase(database); });

test("index setup can be rerun against the isolated database without dropping indexes", async () => {
  await Article.collection.createIndex({ editorNote: 1 }, { name: "test_existing_index" });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(process.execPath, ["scripts/setup-indexes.js"], {
      cwd: path.resolve(__dirname, ".."), env: { ...process.env, NODE_ENV: "test", MONGODB_URI: database.uri },
      windowsHide: true, timeout: 15000, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.ok((await Article.collection.indexes()).some((index) => index.name === "test_existing_index"));
});

test("login stores only token hash, applies cookie flags, and revokes/ignores invalid sessions", async () => {
  assert.equal((await request(http.baseUrl, "/api/auth/session")).data.data.user, null);
  for (const body of [{ username: users.reporter.username, password: "wrong-password" }, { username: "not_a_user", password }]) {
    const result = await request(http.baseUrl, "/api/auth/login", { method: "POST", body });
    assert.equal(result.status, 401);
    assert.equal(result.data.error.code, "INVALID_CREDENTIALS");
  }
  const result = await request(http.baseUrl, "/api/auth/login", { method: "POST", body: { username: users.reporter.username, password } });
  const header = result.headers.get("set-cookie");
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Lax/i);
  const cookie = header.split(";")[0];
  const token = cookie.split("=")[1];
  const stored = await Session.findOne({ user: users.reporter._id }).select("+tokenHash").lean();
  assert.equal(stored.tokenHash.length, 64);
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.ok(!JSON.stringify(result.data).includes("password"));
  assert.equal((await request(http.baseUrl, "/api/auth/session", { cookie })).data.data.user._id, String(users.reporter._id));
  assert.equal((await request(http.baseUrl, "/api/auth/session", { cookie: "daily_web_session=invalid" })).data.data.user, null);
  assert.equal((await request(http.baseUrl, "/api/auth/session", { cookie: "daily_web_session=" + "x".repeat(43) })).data.data.user, null);
  assert.equal((await request(http.baseUrl, "/api/auth/session", { method: "DELETE", cookie })).status, 204);
  assert.equal((await request(http.baseUrl, "/api/auth/session", { cookie })).data.data.user, null);
  const expiredCookie = await login(http.baseUrl, users.other);
  await Session.updateMany({ user: users.other._id }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await request(http.baseUrl, "/api/auth/session", { cookie: expiredCookie })).data.data.user, null);
});

test("existing User CRUD enforces role, uniqueness, self-password check and session revocation", async () => {
  const editorCookie = await login(http.baseUrl, users.editor);
  const reporterCookie = await login(http.baseUrl, users.reporter);
  const body = { username: "new_reporter", password };
  const call = (route, method = "GET", data, cookie = editorCookie) => request(http.baseUrl, route, { method, body: data, cookie });
  assert.equal((await call("/api/users", "POST", body, reporterCookie)).status, 403);
  assert.equal((await request(http.baseUrl, "/api/users", { method: "POST", body })).status, 401);
  assert.equal((await call("/api/users", "POST", { ...body, role: "editor" })).status, 400);
  const created = await call("/api/users", "POST", body);
  assert.equal(created.status, 201);
  const user = created.data.data;
  assert.equal(user.role, "reporter");
  const userPath = `/api/users/${user._id}`;
  assert.equal((await call("/api/users", "POST", body)).status, 409);
  assert.deepEqual((await call("/api/users?q=new_")).data.data.map((item) => item._id), [user._id]);
  assert.equal((await call(userPath)).status, 200);
  assert.equal((await call(userPath, "GET", undefined, reporterCookie)).status, 404);
  const selfCookie = await login(http.baseUrl, user);
  assert.equal((await call(userPath, "PATCH", { username: "renamed_reporter" }, selfCookie)).status, 401);
  assert.equal((await call(userPath, "PATCH", { username: "renamed_reporter", currentPassword: password }, selfCookie)).status, 200);
  assert.equal((await call(userPath, "PATCH", { password: "new-test-password-123" })).status, 200);
  assert.equal((await request(http.baseUrl, "/api/auth/session", { cookie: selfCookie })).data.data.user, null);
  const owned = await Article.create({ reporter: user._id, workingContent: {} });
  assert.equal((await call(userPath, "DELETE")).status, 409);
  await Article.deleteOne({ _id: owned._id });
  assert.equal((await call(userPath, "DELETE")).status, 204);
  assert.equal(await User.findById(user._id), null);
  assert.equal((await call(`/api/users/${users.editor._id}`, "DELETE")).status, 404);
});

test("a session whose User no longer exists cannot authenticate", async () => {
  const source = await User.findById(users.reporter._id).select("+passwordHash");
  const user = await User.create({ username: "removed_user", role: "reporter", passwordHash: source.passwordHash });
  const cookie = await login(http.baseUrl, user);
  await User.deleteOne({ _id: user._id });
  assert.equal((await request(http.baseUrl, "/api/auth/session", { cookie })).data.data.user, null);
  assert.equal(await Session.countDocuments({ user: user._id }), 0);
});

// A real child process proves persistence is not an in-memory test artifact.
function startProcess() {
  const child = spawn(process.execPath, ["app.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", PORT: "0", HOST: "127.0.0.1", MONGODB_URI: database.uri },
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Child server startup timed out.")); }, 15000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Child server exited before readiness: ${code}`)); });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      const lines = output.split("\n");
      output = lines.pop();
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          if (record.event === "server.started") {
            clearTimeout(timer);
            resolve({ child, baseUrl: `http://127.0.0.1:${record.port}` });
          }
        } catch { /* Ignore non-JSON startup output. */ }
      }
    });
    child.stderr.resume();
  });
}

async function stopProcess(child) {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
}

test("same authentication cookie works after the actual Node process restarts", async () => {
  let first, second;
  try {
    first = await startProcess();
    const cookie = await login(first.baseUrl, users.reporter);
    await stopProcess(first.child);
    second = await startProcess();
    const result = await request(second.baseUrl, "/api/auth/session", { cookie });
    assert.equal(result.status, 200);
    assert.equal(result.data.data.user._id, String(users.reporter._id));
    assert.equal((await request(second.baseUrl, "/api/workspace/articles", { cookie })).status, 200);
  } finally {
    await stopProcess(first?.child);
    await stopProcess(second?.child);
  }
});
