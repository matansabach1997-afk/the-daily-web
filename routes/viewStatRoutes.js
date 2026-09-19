const express = require("express");
const { record, analytics } = require("../controllers/viewStatController");
const requireRole = require("../middleware/requireRole");
const requireDatabase = require("../middleware/requireDatabase");

const router = express.Router();
router.post("/", requireDatabase, record);
router.get("/articles/:id/analytics", requireRole("editor"), requireDatabase, analytics);
module.exports = router;
