const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const mongoose = require("mongoose");
const { verifyPassword } = require("../services/passwordService");
const { openDatabase, closeDatabase } = require("./helpers");

// Do not import User or initialize its indexes: the CLI must bootstrap a fresh DB.
const password = "create-user-test-password-123";
let database;
before(async () => { database = await openDatabase("createuser"); });
after(async () => { await closeDatabase(database); });

function createAccount(username, role, suppliedPassword = password) {
  return spawnSync(process.execPath, ["--env-file-if-exists=.env", "scripts/create-user.js"], {
    cwd: path.resolve(__dirname, ".."),
    // Explicit environment wins over .env, so the development DB is never used.
    env: { ...process.env, NODE_ENV: "test", MONGODB_URI: database.uri,
      ACCOUNT_USERNAME: username, ACCOUNT_ROLE: role, ACCOUNT_PASSWORD: suppliedPassword },
    windowsHide: true, timeout: 15000, encoding: "utf8",
  });
}

test("create-user bootstraps fresh collections/indexes, hashes passwords and refuses duplicates", async () => {
  assert.deepEqual(await mongoose.connection.db.listCollections().toArray(), []);
  const users = mongoose.connection.db.collection("users");

  for (const role of ["reporter", "editor"]) {
    const username = `bootstrap_${role}`;
    const result = createAccount(username, role);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`Created ${role} account`));
    const user = await users.findOne({ username });
    assert.ok(user);
    assert.equal(user.role, role);
    assert.equal(user.password, undefined);
    assert.notEqual(user.passwordHash, password);
    assert.equal(await verifyPassword(password, user.passwordHash), true);
    assert.equal(await verifyPassword("wrong-password", user.passwordHash), false);
    assert.ok(user.createdAt instanceof Date);
    assert.ok(user.updatedAt instanceof Date);
    assert.ok(!(result.stdout + result.stderr).includes(password));
    assert.ok(!(result.stdout + result.stderr).includes(user.passwordHash));
  }

  const indexes = await users.indexes();
  assert.ok(indexes.some((index) => index.key.username === 1 && index.unique));
  const original = await users.findOne({ username: "bootstrap_reporter" });
  const duplicate = createAccount(original.username, "editor", password + "-changed");
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /Account creation failed/);
  assert.equal(await users.countDocuments(), 2);
  assert.deepEqual(await users.findOne({ _id: original._id }), original);
  // Prove uniqueness is also enforced by MongoDB, not just the CLI pre-check.
  await assert.rejects(() => users.insertOne({ username: original.username }), { code: 11000 });
});
