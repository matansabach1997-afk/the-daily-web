const { id } = require("../utils/validation");
const { findAccessibleArticle } = require("../services/articleQueryService");

function showWorkspace(req, res) {
  res.render("reporter/index", {
    title: "Reporter Workspace",
    pageStylesheet: "/css/reporter.css",
  });
}

async function showEdit(req, res) {
  const articleId = String(id(req.params.id));
  // Enforce Reporter ownership at the page boundary as well as in the API.
  await findAccessibleArticle(req.user, articleId);
  res.render("reporter/edit", {
    title: "Reporter Article Editor",
    pageStylesheet: "/css/reporter.css",
    articleId,
  });
}

module.exports = { showWorkspace, showEdit };
