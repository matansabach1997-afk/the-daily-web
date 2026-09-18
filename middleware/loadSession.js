const mongoose = require("mongoose");
const { readSessionCookie, clearSessionCookie } = require("../utils/cookies");
const { resolveSession } = require("../services/sessionService");
const httpError = require("../utils/httpError");
const userDto = require("../utils/userDto");

async function loadSession(req, res, next) {
  req.user = null;
  req.session = null;
  res.locals.currentUser = null;
  // Pages containing account details must not be stored in a shared cache.
  res.set("Cache-Control", "no-store");
  const token = readSessionCookie(req.headers.cookie);
  if (token) {
    if (mongoose.connection.readyState !== 1) {
      throw httpError(503, "DATABASE_UNAVAILABLE", "The database is temporarily unavailable.");
    }
    const identity = await resolveSession(token);
    if (identity) {
      req.user = identity.user;
      req.session = identity.session;
      res.locals.currentUser = userDto(identity.user);
    } else {
      clearSessionCookie(res);
    }
  }
  next();
}

module.exports = loadSession;
