const express = require("express");
const loadSession = require("../middleware/loadSession");
const requireRole = require("../middleware/requireRole");
const { showAnalytics } = require("../controllers/analyticsPageController");

const router = express.Router();
router.use(loadSession, requireRole("editor"));
router.get("/", showAnalytics);
module.exports = router;
