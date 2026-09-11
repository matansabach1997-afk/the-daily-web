const service = require("../services/userService");
const { allowedFields } = require("../utils/validation");
const log = require("../utils/logger");
const { clearSessionCookie } = require("../utils/cookies");

async function create(req, res) {
  const user = await service.createReporter(req.user, req.body);
  log("info", "user.created", { requestId: req.requestId, userId: user._id });
  res.status(201).json({ data: user });
}
async function list(req, res) { res.json(await service.listReporters(req.user, req.query)); }
async function get(req, res) {
  allowedFields(req.query, [], "query");
  res.json({ data: await service.getUser(req.user, req.params.id) });
}
async function update(req, res) {
  const user = await service.updateUser(req.user, req.params.id, req.body);
  if (req.body.password !== undefined && String(req.user._id) === req.params.id) clearSessionCookie(res);
  log("info", "user.updated", { requestId: req.requestId, userId: user._id });
  res.json({ data: user });
}
async function remove(req, res) {
  await service.deleteReporter(req.user, req.params.id);
  log("info", "user.deleted", { requestId: req.requestId, userId: req.params.id });
  res.status(204).end();
}
module.exports = { create, list, get, update, remove };
