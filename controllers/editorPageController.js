const { id } = require("../utils/validation");

function showWorkspace(req, res) {
  res.render("editor/index", {
    title: "Editor Workspace",
    pageStylesheet: "/css/editor.css",
  });
}

function showReview(req, res) {
  // Scaffold only: validate the URL ID, but do not read or change an article.
  res.render("editor/review", {
    title: "Editor Article Review",
    pageStylesheet: "/css/editor.css",
    articleId: id(req.params.id),
  });
}

module.exports = { showWorkspace, showReview };
