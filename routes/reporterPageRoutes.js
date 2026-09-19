const express = require("express");
const loadSession = require("../middleware/loadSession");
const requireRole = require("../middleware/requireRole");
const controller = require("../controllers/reporterPageController");

const router = express.Router();
router.use(loadSession, requireRole("reporter"));
router.get("/", controller.showWorkspace);
router.get("/edit/:id", controller.showEdit);

module.exports = router;
