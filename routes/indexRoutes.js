const express = require("express");
const { showHome } = require("../controllers/homeController");

const router = express.Router();

router.get("/", showHome);

module.exports = router;
