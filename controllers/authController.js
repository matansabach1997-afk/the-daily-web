const User = require("../models/User");
const { allowedFields, text } = require("../utils/validation");
const httpError = require("../utils/httpError");
const userDto = require("../utils/userDto");
const log = require("../utils/logger");
const { verifyPassword } = require("../services/passwordService");
const { createSession, revokeSession } = require("../services/sessionService");
const { setSessionCookie, clearSessionCookie } = require("../utils/cookies");

async function login(req, res) {
  allowedFields(req.body, ["username", "password"]);
  const username = text(req.body.username, "username", { min: 1, max: 40 });
  const password = text(req.body.password, "password", { min: 1, max: 128, trim: false });
  const user = await User.findOne({ username }).select("+passwordHash");
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    log("warn", "auth.login_failed", { requestId: req.requestId });
    throw httpError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
  }
  // Replace this browser's previous login instead of keeping its old session alive.
  await revokeSession(req.session?._id);
  const token = await createSession(user._id);
  setSessionCookie(res, token);
  log("info", "auth.login", { requestId: req.requestId, userId: user._id });
  res.json({ data: userDto(user) });
}

function currentSession(req, res) {
  res.json({ data: { user: req.user ? userDto(req.user) : null } });
}

async function logout(req, res) {
  await revokeSession(req.session?._id);
  clearSessionCookie(res);
  log("info", "auth.logout", { requestId: req.requestId, userId: req.user?._id });
  res.status(204).end();
}

module.exports = { login, currentSession, logout };
