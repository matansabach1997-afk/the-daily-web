const User = require("../models/User");
const Article = require("../models/Article");
const { hashPassword, verifyPassword } = require("./passwordService");
const { revokeUserSessions } = require("./sessionService");
const { allowedFields, text, id } = require("../utils/validation");
const requireActor = require("../utils/authorization");
const httpError = require("../utils/httpError");
const userDto = require("../utils/userDto");
const { PAGE_SIZE, cursorFilter, page } = require("../utils/pagination");

function username(value) {
  const result = text(value, "username", { min: 3, max: 40 });
  if (!/^[A-Za-z0-9_]+$/.test(result)) {
    throw httpError(422, "VALIDATION_FAILED", "Username may contain letters, digits and underscores only.");
  }
  return result;
}

async function createReporter(actor, input) {
  requireActor(actor, ["editor"]);
  allowedFields(input, ["username", "password"]);
  const user = await User.create({ username: username(input.username), passwordHash: await hashPassword(input.password), role: "reporter" });
  return userDto(user);
}

async function getUser(actor, userId) {
  requireActor(actor);
  id(userId);
  const self = String(actor._id) === userId;
  if (!self && actor.role !== "editor") throw httpError(404, "USER_NOT_FOUND", "User not found.");
  const user = await User.findOne({ _id: userId, ...(!self ? { role: "reporter" } : {}) }).lean();
  if (!user) throw httpError(404, "USER_NOT_FOUND", "User not found.");
  return userDto(user);
}

async function listReporters(actor, query) {
  requireActor(actor, ["editor"]);
  allowedFields(query, ["q", "cursor"], "query");
  const filter = { role: "reporter" };
  if (query.q !== undefined) {
    const prefix = text(query.q, "q", { max: 40 });
    filter.username = { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` };
  }
  const rows = await User.find({ $and: [filter, cursorFilter(query.cursor, "username", 1, "string")] })
    .sort({ username: 1, _id: 1 }).limit(PAGE_SIZE + 1).maxTimeMS(5000).lean();
  const result = page(rows, "username");
  result.data = result.data.map(userDto);
  return result;
}

async function updateUser(actor, userId, input) {
  const target = await getUser(actor, userId);
  allowedFields(input, ["username", "password", "currentPassword"]);
  if (input.username === undefined && input.password === undefined) throw httpError(400, "EMPTY_UPDATE", "Supply username or password.");
  const self = String(actor._id) === userId;
  if (self) {
    const current = await User.findById(userId).select("+passwordHash");
    if (!current || !await verifyPassword(input.currentPassword, current.passwordHash)) {
      throw httpError(401, "INVALID_CREDENTIALS", "Current password is required and must be correct.");
    }
  }
  const update = {};
  if (input.username !== undefined) update.username = username(input.username);
  if (input.password !== undefined) update.passwordHash = await hashPassword(input.password);
  // No client-supplied roles or hash fields are copied to the database.
  const user = await User.findOneAndUpdate({ _id: target._id, role: target.role }, { $set: update }, { returnDocument: "after", runValidators: true }).lean();
  if (!user) throw httpError(404, "USER_NOT_FOUND", "User not found.");
  if (input.password !== undefined) await revokeUserSessions(userId);
  return userDto(user);
}

async function deleteReporter(actor, userId) {
  requireActor(actor, ["editor"]);
  id(userId);
  const user = await User.findOne({ _id: userId, role: "reporter" });
  if (!user) throw httpError(404, "USER_NOT_FOUND", "Reporter not found.");
  if (await Article.exists({ reporter: userId })) {
    throw httpError(409, "USER_IN_USE", "This Reporter still owns articles and cannot be deleted.");
  }
  await revokeUserSessions(userId);
  await User.deleteOne({ _id: userId, role: "reporter" });
}

module.exports = { username, createReporter, getUser, listReporters, updateUser, deleteReporter };
