const express = require("express");
const controller = require("../controllers/articleController");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const requireDatabase = require("../middleware/requireDatabase");

const router = express.Router();

router.get("/", requireDatabase, controller.listArticles);
router.get("/:id", requireDatabase, controller.getArticle);
router.post("/", requireRole("reporter"), requireDatabase, controller.create);
router.patch("/:id/working-content", requireAuth, requireDatabase, controller.save);
router.post("/:id/submissions", requireRole("reporter"), requireDatabase, controller.submit);
router.post("/:id/returns", requireRole("editor"), requireDatabase, controller.returnForCorrections);
router.post("/:id/approvals", requireRole("editor"), requireDatabase, controller.approve);
router.post("/:id/revisions", requireAuth, requireDatabase, controller.startRevision);
router.delete("/:id", requireRole("editor"), requireDatabase, controller.remove);

module.exports = router;
