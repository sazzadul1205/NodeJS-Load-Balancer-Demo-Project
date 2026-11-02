const express = require("express");
const comments = require("../controllers/commentController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.delete("/:id", requireAuth, comments.remove);
module.exports = router;
