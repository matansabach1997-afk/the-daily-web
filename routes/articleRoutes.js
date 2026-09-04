const express = require("express");
const { listArticles } = require("../controllers/articleController");

const router = express.Router();

router.get("/", listArticles);

module.exports = router;
