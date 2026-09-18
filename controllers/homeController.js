function showHome(req, res) {
  res.render("index", {
    title: "The Daily Web",
    message: "MVC skeleton is ready.",
  });
}

function showLogin(req, res) {
  if (req.user) return res.redirect("/");
  res.render("login", { title: "Login | The Daily Web" });
}

module.exports = { showHome, showLogin };
