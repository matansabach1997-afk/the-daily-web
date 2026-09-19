const { id } = require("../utils/validation");

function showWorkspace(req, res) {
  res.render("reporter/index", {
    title: "Reporter Workspace",
    pageStylesheet: "/css/reporter.css",
  });
}

function showEdit(req, res) {
  // Scaffold only: validate the URL ID, but do not read or change an article.
  res.render("reporter/edit", {
    title: "Reporter Article Editor",
    pageStylesheet: "/css/reporter.css",
    articleId: id(req.params.id),
  });
}

module.exports = { showWorkspace, showEdit };
