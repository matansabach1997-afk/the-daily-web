const query = require("../services/articleQueryService");
const { categories } = require("../config/articleRules");
const { allowedFields } = require("../utils/validation");

function showHome(req, res) {
  res.render("index", {
    title: "The Daily Web",
    categories,
    pageStylesheet: "/css/feed.css",
  });
}

function showLogin(req, res) {
  if (req.user) return res.redirect("/");
  res.render("login", { title: "Login | The Daily Web" });
}

async function showArticle(req, res) {
  allowedFields(req.query, [], "query");
  const article = await query.getPublic(req.params.id);
  res.render("article", {
    title: `${article.title} | The Daily Web`,
    article,
    pageStylesheet: "/css/article.css",
  });
}

module.exports = { showHome, showLogin, showArticle };
