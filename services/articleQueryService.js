const Article = require("../models/Article");
const { statuses, categories } = require("../config/articleRules");
const { id, allowedFields, text } = require("../utils/validation");
const requireActor = require("../utils/authorization");
const httpError = require("../utils/httpError");
const { PAGE_SIZE, cursorFilter, page } = require("../utils/pagination");

function ownershipFilter(actor) {
  requireActor(actor);
  return actor.role === "reporter" ? { reporter: actor._id } : {};
}

function privateArticleDto(article) {
  return {
    _id: article._id, reporter: article.reporter,
    workingContent: article.workingContent, publishedContent: article.publishedContent,
    status: article.status, editorNote: article.editorNote, publishedAt: article.publishedAt,
    publicationHistory: article.publicationHistory, createdAt: article.createdAt, updatedAt: article.updatedAt,
  };
}

async function findAccessibleArticle(actor, articleId) {
  const article = await Article.findOne({ _id: id(articleId), ...ownershipFilter(actor) })
    .populate("reporter", "_id username").lean();
  if (!article) throw httpError(404, "ARTICLE_NOT_FOUND", "Article not found.");
  return article;
}

async function listPrivate(actor, query) {
  allowedFields(query, ["status", "reporterId", "cursor"], "query");
  const filter = ownershipFilter(actor);
  if (query.status !== undefined) {
    if (!statuses.includes(query.status)) throw httpError(400, "INVALID_STATUS", "Invalid article status.");
    filter.status = query.status;
  }
  if (query.reporterId !== undefined) {
    requireActor(actor, ["editor"]);
    filter.reporter = id(query.reporterId);
  }
  const rows = await Article.find({ $and: [filter, cursorFilter(query.cursor, "updatedAt")] })
    .sort({ updatedAt: -1, _id: -1 }).limit(PAGE_SIZE + 1).maxTimeMS(5000)
    .populate("reporter", "_id username").lean();
  const result = page(rows, "updatedAt");
  result.data = result.data.map(privateArticleDto);
  return result;
}

function publicFilter() {
  // Status describes working content, not public visibility.
  return { publishedAt: { $type: "date" }, publishedContent: { $ne: null, $exists: true } };
}

function publicArticleDto(article, includeBody = false) {
  const content = article.publishedContent;
  const result = {
    _id: article._id, title: content.title, summary: content.summary,
    imageUrl: content.imageUrl, category: content.category,
    reporter: article.reporter ? { _id: article.reporter._id, username: article.reporter.username } : null,
    publishedAt: article.publishedAt,
  };
  if (includeBody) result.body = content.body;
  return result;
}

async function listPublic(query) {
  allowedFields(query, ["cursor", "q", "category", "sort"], "query");
  const filter = publicFilter();
  const search = query.q === undefined ? "" : text(query.q, "q", { max: 100 });
  if (search) filter.$text = { $search: search };
  if (query.category !== undefined) {
    if (!categories.includes(query.category)) throw httpError(400, "INVALID_CATEGORY", "Invalid article category.");
    filter["publishedContent.category"] = query.category;
  }
  const sort = query.sort === undefined ? "newest" : query.sort;
  if (!["newest", "oldest"].includes(sort)) throw httpError(400, "INVALID_SORT", "Use newest or oldest sorting.");
  const direction = sort === "oldest" ? 1 : -1;
  const rows = await Article.find({ $and: [filter, cursorFilter(query.cursor, "publishedAt", direction)] })
    .select("_id publishedContent.title publishedContent.summary publishedContent.imageUrl publishedContent.category reporter publishedAt")
    .sort({ publishedAt: direction, _id: direction }).limit(PAGE_SIZE + 1).maxTimeMS(5000)
    .populate("reporter", "_id username").lean();
  const result = page(rows, "publishedAt");
  result.data = result.data.map((article) => publicArticleDto(article));
  return result;
}

async function getPublic(articleId) {
  const article = await Article.findOne({ _id: id(articleId), ...publicFilter() })
    .select("_id publishedContent reporter publishedAt").populate("reporter", "_id username").lean();
  if (!article) throw httpError(404, "ARTICLE_NOT_FOUND", "Article not found.");
  return publicArticleDto(article, true);
}

async function requirePublicArticle(articleId) {
  // Tracking only needs existence, not the article body or reporter population.
  const article = await Article.exists({ _id: id(articleId), ...publicFilter() }).maxTimeMS(5000);
  if (!article) throw httpError(404, "ARTICLE_NOT_FOUND", "Article not found.");
}

module.exports = { ownershipFilter, privateArticleDto, findAccessibleArticle, listPrivate, listPublic, getPublic, requirePublicArticle };
