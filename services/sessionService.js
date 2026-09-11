const { randomBytes, createHash } = require("node:crypto");
const Session = require("../models/Session");
const User = require("../models/User");
const { SESSION_MS } = require("../utils/cookies");

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  await Session.create({ tokenHash: hashToken(token), user: userId, expiresAt: new Date(Date.now() + SESSION_MS) });
  return token;
}

async function resolveSession(token) {
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  const user = await User.findById(session.user).select("_id username role").lean();
  if (!user) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }
  return { session, user };
}

async function revokeSession(sessionId) {
  if (sessionId) await Session.deleteOne({ _id: sessionId });
}

async function revokeUserSessions(userId) {
  await Session.deleteMany({ user: userId });
}

module.exports = { createSession, resolveSession, revokeSession, revokeUserSessions };
