const express = require("express");
const admin = require("../controllers/adminController");

const router = express.Router();
router.post("/reset", admin.reset);
module.exports = router;
