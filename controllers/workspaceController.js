const { allowedFields } = require("../utils/validation");
const { listPrivate, findAccessibleArticle, privateArticleDto } = require("../services/articleQueryService");

async function listArticles(req, res) {
  res.json(await listPrivate(req.user, req.query));
}

async function getArticle(req, res) {
  allowedFields(req.query, [], "query");
  res.json({ data: privateArticleDto(await findAccessibleArticle(req.user, req.params.id)) });
}

module.exports = { listArticles, getArticle };
