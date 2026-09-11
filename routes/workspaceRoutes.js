const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireDatabase = require("../middleware/requireDatabase");
const controller = require("../controllers/workspaceController");

const router = express.Router();
router.use(requireAuth, requireDatabase);
router.get("/", controller.listArticles);
router.get("/:id", controller.getArticle);
module.exports = router;
