function showAnalytics(req, res) {
  res.render("analytics/index", {
    title: "Analytics | The Daily Web",
    pageStylesheet: "/css/analytics.css",
  });
}

module.exports = { showAnalytics };
