const exampleArticles = [
  {
    id: "welcome-to-the-daily-web",
    title: "Welcome to The Daily Web",
    summary: "This example response is served through a router and controller.",
  },
];

function listArticles(req, res) {
  res.status(200).json({
    count: exampleArticles.length,
    articles: exampleArticles,
  });
}

module.exports = { listArticles };
