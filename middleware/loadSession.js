const mongoose = require("mongoose");
const { readSessionCookie, clearSessionCookie } = require("../utils/cookies");
const { resolveSession } = require("../services/sessionService");
const httpError = require("../utils/httpError");

async function loadSession(req, res, next) {
  req.user = null;
  req.session = null;
  const token = readSessionCookie(req.headers.cookie);
  if (token) {
    if (mongoose.connection.readyState !== 1) {
      throw httpError(503, "DATABASE_UNAVAILABLE", "The database is temporarily unavailable.");
    }
    const identity = await resolveSession(token);
    if (identity) {
      req.user = identity.user;
      req.session = identity.session;
    } else {
      clearSessionCookie(res);
    }
  }
  next();
}

module.exports = loadSession;
