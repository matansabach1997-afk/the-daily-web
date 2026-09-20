const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const getEnvironment = require("./config/environment");
const requestContext = require("./middleware/requestContext");
const log = require("./utils/logger");
const loadSession = require("./middleware/loadSession");
const authRoutes = require("./routes/authRoutes");
const workspaceRoutes = require("./routes/workspaceRoutes");
const userRoutes = require("./routes/userRoutes");

const connectDatabase = require("./config/database");
const indexRoutes = require("./routes/indexRoutes");
const articleRoutes = require("./routes/articleRoutes");
const reporterPageRoutes = require("./routes/reporterPageRoutes");
const editorPageRoutes = require("./routes/editorPageRoutes");
const commentRoutes = require("./routes/commentRoutes");
const weatherRoutes = require("./routes/weatherRoutes");
const viewStatRoutes = require("./routes/viewStatRoutes");
const analyticsPageRoutes = require("./routes/analyticsPageRoutes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(requestContext);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb", parameterLimit: 20 }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/", indexRoutes);
app.use("/reporter", reporterPageRoutes);
app.use("/editor", editorPageRoutes);
app.use("/analytics", analyticsPageRoutes);
app.use("/api", loadSession);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/workspace/articles", workspaceRoutes);
app.use("/api/articles", articleRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/view-stats", viewStatRoutes);

app.use(notFound);
app.use(errorHandler);

async function startServer() {
  const { port, host } = getEnvironment();
  await connectDatabase();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener));
    listener.once("error", reject);
  });
  log("info", "server.started", { port: server.address().port });
  const stop = () => {
    server.close(async () => {
      await mongoose.disconnect();
      log("info", "server.stopped");
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    log("error", "server.start_failed", { code: "STARTUP_FAILED" });
    console.error("Check PORT, NODE_ENV, MONGODB_URI and that MongoDB is running.");
    mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = app;
