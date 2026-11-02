const express = require("express");
const { z } = require("zod");
const auth = require("../controllers/authController");
const validate = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");

const router = express.Router();

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "letters, digits, underscore only"),
  email: z.string().email().max(200),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/register", authLimiter, validate(registerSchema), auth.register);
router.post("/login", authLimiter, validate(loginSchema), auth.login);
router.get("/me", requireAuth, auth.me);

module.exports = router;
