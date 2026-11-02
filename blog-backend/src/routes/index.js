const express = require("express");
const authRoutes = require("./authRoutes");
const postRoutes = require("./postRoutes");
const commentRoutes = require("./commentRoutes");
const adminRoutes = require("./adminRoutes");

const router = express.Router();
router.use("/auth", authRoutes);
router.use("/posts", postRoutes);
router.use("/comments", commentRoutes);
router.use("/admin", adminRoutes);
module.exports = router;
