const express = require("express");
const { record } = require("../controllers/viewStatController");
const requireDatabase = require("../middleware/requireDatabase");

const router = express.Router();
router.post("/", requireDatabase, record);
module.exports = router;
