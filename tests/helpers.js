const mongoose = require("mongoose");
const { randomBytes } = require("node:crypto");
const assert = require("node:assert/strict");

function testDatabaseUri(label) {
  const base = new URL(process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017/the_daily_web_test");
  if (base.protocol !== "mongodb:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || base.pathname !== "/the_daily_web_test") {
    throw new Error("TEST_MONGODB_URI must target local MongoDB and database the_daily_web_test. Refusing unsafe cleanup.");
  }
  if (!/^[a-z]+$/.test(label)) throw new Error("Invalid test label.");
  const name = `the_daily_web_test_${label}_${process.pid}_${randomBytes(4).toString("hex")}`;
  base.pathname = `/${name}`;
  return { uri: base.toString(), name };
}

async function openDatabase(label) {
  const target = testDatabaseUri(label);
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = target.uri;
  try {
    await mongoose.connect(target.uri, { serverSelectionTimeoutMS: 2000 });
    // Finish automatic collection/index creation before a fast test can drop its DB.
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  } catch {
    await mongoose.disconnect();
    throw new Error("Integration tests could not initialize local MongoDB or its indexes. Start mongod and rerun; no test was skipped.");
  }
  return target;
}

async function closeDatabase(target) {
  if (target) {
    assert.match(target.name, /^the_daily_web_test_[a-z]+_\d+_[a-f\d]{8}$/);
    assert.equal(mongoose.connection.name, target.name, "Refusing cleanup of an unexpected database");
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
}

async function startHttp(app) {
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function stopHttp(server) {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function request(baseUrl, path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data, headers: response.headers };
}

module.exports = { testDatabaseUri, openDatabase, closeDatabase, startHttp, stopHttp, request };
