const Article = require("../models/Article");
const Comment = require("../models/Comment");
const ViewStat = require("../models/ViewStat");
const { categories, contentLimits } = require("../config/articleRules");
const { allowedFields, text, id } = require("../utils/validation");
const requireActor = require("../utils/authorization");
const httpError = require("../utils/httpError");
const { ownershipFilter, findAccessibleArticle, privateArticleDto } = require("./articleQueryService");

function validateContent(input, { complete = false, allowMissing = false } = {}) {
  allowedFields(input, Object.keys(contentLimits), "workingContent");
  const content = {};
  for (const [field, max] of Object.entries(contentLimits)) {
    const value = input[field] === undefined && allowMissing ? "" : input[field];
    content[field] = text(value, field, { max, trim: field !== "body" });
  }
  const fields = {};
  if (content.category && !categories.includes(content.category)) fields.category = "Choose an allowed category.";
  if (content.imageUrl) {
    let valid = /^\/images\/[A-Za-z0-9/_-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(content.imageUrl);
    try {
      const url = new URL(content.imageUrl);
      valid = url.protocol === "https:" && !url.username && !url.password;
    } catch { /* A local /images/ path does not need a hostname. */ }
    if (!valid) fields.imageUrl = "Use an HTTPS image URL or a local /images/ file path.";
  }
  if (complete) {
    for (const field of Object.keys(contentLimits)) {
      if (!content[field].trim()) fields[field] = "Required before submission or approval.";
    }
  }
  if (Object.keys(fields).length) throw httpError(422, "INVALID_CONTENT", "Please check the article content.", fields);
  return content;
}

function requireState(article, states) {
  if (!states.includes(article.status)) throw httpError(409, "INVALID_ARTICLE_STATE", "This action is not allowed in the article's current state.");
}

// State conditions enforce the workflow; there are no revision counters.
async function updateArticle(actor, article, changes, approvalTime) {
  const update = { $set: changes };
  if (approvalTime) update.$push = { publicationHistory: approvalTime };
  const saved = await Article.findOneAndUpdate(
    { _id: article._id, ...ownershipFilter(actor), status: article.status },
    update, { returnDocument: "after", runValidators: true }
  ).populate("reporter", "_id username").lean();
  if (!saved) {
    await findAccessibleArticle(actor, String(article._id));
    throw httpError(409, "INVALID_ARTICLE_STATE", "The article state changed. Reload before continuing.");
  }
  return privateArticleDto(saved);
}

async function createDraft(actor, input) {
  requireActor(actor, ["reporter"]);
  allowedFields(input, ["workingContent"]);
  const workingContent = validateContent(input.workingContent, { allowMissing: true });
  const article = await Article.create({ reporter: actor._id, workingContent });
  return privateArticleDto(await findAccessibleArticle(actor, String(article._id)));
}

async function saveWorkingContent(actor, articleId, input) {
  requireActor(actor);
  allowedFields(input, ["workingContent"]);
  const article = await findAccessibleArticle(actor, articleId);
  requireState(article, actor.role === "editor" ? ["draft", "pending", "returned"] : ["draft", "returned"]);
  return updateArticle(actor, article, { workingContent: validateContent(input.workingContent) });
}

async function submit(actor, articleId) {
  requireActor(actor, ["reporter"]);
  const article = await findAccessibleArticle(actor, articleId);
  requireState(article, ["draft", "returned"]);
  validateContent(article.workingContent, { complete: true });
  return updateArticle(actor, article, { status: "pending" });
}

async function returnForCorrections(actor, articleId, input) {
  requireActor(actor, ["editor"]);
  allowedFields(input, ["editorNote"]);
  const article = await findAccessibleArticle(actor, articleId);
  requireState(article, ["pending"]);
  const editorNote = text(input.editorNote, "editorNote", { min: 1, max: 2000 });
  return updateArticle(actor, article, { status: "returned", editorNote });
}

async function approve(actor, articleId) {
  requireActor(actor, ["editor"]);
  const article = await findAccessibleArticle(actor, articleId);
  requireState(article, ["pending"]);
  const publishedContent = validateContent(article.workingContent, { complete: true });
  const approvedAt = new Date();
  const publishedAt = article.publishedAt || approvedAt;
  return updateArticle(actor, article, { publishedContent, publishedAt, status: "published", editorNote: "" }, approvedAt);
}

async function startRevision(actor, articleId) {
  requireActor(actor);
  const article = await findAccessibleArticle(actor, articleId);
  requireState(article, ["published"]);
  if (!article.publishedContent || !article.publishedAt) throw httpError(409, "INVALID_ARTICLE_STATE", "This article has no approved public version.");
  return updateArticle(actor, article, { workingContent: { ...article.publishedContent }, status: "draft" });
}

async function deleteArticle(actor, articleId) {
  requireActor(actor, ["editor"]);
  const key = id(articleId);
  // Remove public access first. Retrying DELETE also cleans up after partial failure.
  await Article.deleteOne({ _id: key }).maxTimeMS(5000);
  await Comment.deleteMany({ article: key }).maxTimeMS(5000);
  await ViewStat.deleteMany({ article: key }).maxTimeMS(5000);
}

module.exports = { validateContent, createDraft, saveWorkingContent, submit, returnForCorrections, approve, startRevision, deleteArticle };
