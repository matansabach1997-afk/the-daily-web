const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hashPassword, verifyPassword } = require("../services/passwordService");
const { readSessionCookie, setSessionCookie } = require("../utils/cookies");
const userDto = require("../utils/userDto");

test("salted scrypt hashes verify only the correct password", async () => {
  const password = "A-local-test-password";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("incorrect", first), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
  await assert.rejects(() => hashPassword("short"), { status: 422 });
});

test("DTO and cookie helpers do not expose password hashes", () => {
  assert.deepEqual(userDto({ _id: "1", username: "reporter", role: "reporter", passwordHash: "secret" }), { _id: "1", username: "reporter", role: "reporter" });
  assert.equal(readSessionCookie("daily_web_session=malformed"), null);
  const token = "a".repeat(43);
  assert.equal(readSessionCookie(`daily_web_session=${token}`), token);
  assert.equal(readSessionCookie(`daily_web_session=${token}; daily_web_session=${token}`), null);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    setSessionCookie({ cookie(name, value, options) {
      assert.equal(value, token);
      assert.equal(options.httpOnly, true);
      assert.equal(options.secure, true);
      assert.equal(options.sameSite, "lax");
      assert.equal(options.maxAge, 604800000);
    } }, token);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
