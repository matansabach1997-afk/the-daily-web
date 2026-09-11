const express = require("express");
const controller = require("../controllers/authController");
const requireDatabase = require("../middleware/requireDatabase");

const router = express.Router();
router.post("/login", requireDatabase, controller.login);
router.get("/session", controller.currentSession);
router.delete("/session", requireDatabase, controller.logout);
module.exports = router;
