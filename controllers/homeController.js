function showHome(req, res) {
  res.render("index", {
    title: "The Daily Web",
    message: "MVC skeleton is ready.",
  });
}

module.exports = { showHome };
