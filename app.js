const path = require("path");
const express = require("express");

const connectDatabase = require("./config/database");
const indexRoutes = require("./routes/indexRoutes");
const articleRoutes = require("./routes/articleRoutes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/", indexRoutes);
app.use("/api/articles", articleRoutes);

app.use(notFound);
app.use(errorHandler);

async function startServer() {
  await connectDatabase();

  const port = process.env.PORT || 3000;
  return app.listen(port, () => {
    console.log(`The Daily Web is running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start the application:", error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
