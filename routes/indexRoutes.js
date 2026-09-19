const express = require("express");
const { showHome, showLogin, showArticle } = require("../controllers/homeController");
const loadSession = require("../middleware/loadSession");
const requireDatabase = require("../middleware/requireDatabase");

const router = express.Router();

router.get("/", loadSession, showHome);
router.get("/login", loadSession, showLogin);
router.get("/articles/:id", loadSession, requireDatabase, showArticle);

module.exports = router;
