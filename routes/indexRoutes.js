const express = require("express");
const { showHome, showLogin } = require("../controllers/homeController");
const loadSession = require("../middleware/loadSession");

const router = express.Router();

router.get("/", loadSession, showHome);
router.get("/login", loadSession, showLogin);

module.exports = router;
