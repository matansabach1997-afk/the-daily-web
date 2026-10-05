const { id } = require("../utils/validation");
const { findAccessibleArticle } = require("../services/articleQueryService");

function showWorkspace(req, res) {
  res.render("editor/index", {
    title: "Editor Workspace",
    pageStylesheet: "/css/editor.css",
  });
}

async function showReview(req, res) {
  const articleId = id(req.params.id);
  await findAccessibleArticle(req.user, articleId);
  res.render("editor/review", {
    title: "Editor Article Review",
    pageStylesheet: "/css/editor.css",
    articleId,
  });
}

module.exports = { showWorkspace, showReview };
