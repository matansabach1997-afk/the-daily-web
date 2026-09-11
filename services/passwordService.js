const { randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const { text } = require("../utils/validation");

const derive = promisify(scrypt);
// One fixed configuration, not a tuning system. Version 1 hashes use these settings.
const settings = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function validatePassword(password) {
  return text(password, "password", { min: 12, max: 128, trim: false });
}

async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64, settings);
  return `scrypt$1$${salt}$${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > 128 || typeof stored !== "string") return false;
  if (!/^scrypt\$1\$[a-f\d]{32}\$[a-f\d]{128}$/.test(stored)) return false;
  const [, , salt, encoded] = stored.split("$");
  const expected = Buffer.from(encoded, "hex");
  const actual = await derive(password, salt, expected.length, settings);
  return timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword, validatePassword };
