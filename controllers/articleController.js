const query = require("../services/articleQueryService");
const workflow = require("../services/articleWorkflowService");
const { allowedFields } = require("../utils/validation");
const log = require("../utils/logger");

function record(req, event, articleId) {
  log("info", event, { requestId: req.requestId, userId: req.user._id, articleId });
}
async function listArticles(req, res) { res.json(await query.listPublic(req.query)); }
async function getArticle(req, res) {
  allowedFields(req.query, [], "query");
  res.json({ data: await query.getPublic(req.params.id) });
}
async function create(req, res) {
  const article = await workflow.createDraft(req.user, req.body);
  record(req, "article.created", article._id);
  res.status(201).json({ data: article });
}
async function save(req, res) {
  res.json({ data: await workflow.saveWorkingContent(req.user, req.params.id, req.body) });
}
async function submit(req, res) {
  allowedFields(req.body === undefined ? {} : req.body, []);
  const article = await workflow.submit(req.user, req.params.id);
  record(req, "article.submitted", article._id);
  res.json({ data: article });
}
async function returnForCorrections(req, res) {
  const article = await workflow.returnForCorrections(req.user, req.params.id, req.body);
  record(req, "article.returned", article._id);
  res.json({ data: article });
}
async function approve(req, res) {
  allowedFields(req.body === undefined ? {} : req.body, []);
  const article = await workflow.approve(req.user, req.params.id);
  record(req, "article.approved", article._id);
  res.json({ data: article });
}
async function startRevision(req, res) {
  allowedFields(req.body === undefined ? {} : req.body, []);
  const article = await workflow.startRevision(req.user, req.params.id);
  record(req, "article.revision_started", article._id);
  res.json({ data: article });
}
async function remove(req, res) {
  allowedFields(req.body === undefined ? {} : req.body, []);
  await workflow.deleteArticle(req.user, req.params.id);
  record(req, "article.deleted", req.params.id);
  res.status(204).end();
}
module.exports = { listArticles, getArticle, create, save, submit, returnForCorrections, approve, startRevision, remove };
