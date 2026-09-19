const express = require("express");
const loadSession = require("../middleware/loadSession");
const requireRole = require("../middleware/requireRole");
const controller = require("../controllers/editorPageController");

const router = express.Router();
router.use(loadSession, requireRole("editor"));
router.get("/", controller.showWorkspace);
router.get("/review/:id", controller.showReview);

module.exports = router;
