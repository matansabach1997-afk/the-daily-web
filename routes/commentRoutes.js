const express = require("express");
const controller = require("../controllers/commentController");
const requireAuth = require("../middleware/requireAuth");
const requireDatabase = require("../middleware/requireDatabase");

const router = express.Router();

router.get("/", requireDatabase, controller.listComments);
router.get("/:id", requireDatabase, controller.getComment);

router.post("/", requireAuth, requireDatabase, controller.createComment);
router.patch("/:id", requireAuth, requireDatabase, controller.updateComment);
router.delete("/:id", requireAuth, requireDatabase, controller.deleteComment);

module.exports = router;