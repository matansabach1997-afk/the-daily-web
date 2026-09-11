const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const requireDatabase = require("../middleware/requireDatabase");
const controller = require("../controllers/userController");

const router = express.Router();
router.use(requireAuth, requireDatabase);
router.post("/", requireRole("editor"), controller.create);
router.get("/", requireRole("editor"), controller.list);
router.get("/:id", controller.get);
router.patch("/:id", controller.update);
router.delete("/:id", requireRole("editor"), controller.remove);
module.exports = router;
