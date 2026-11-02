const express = require("express");
const { z } = require("zod");
const posts = require("../controllers/postController");
const comments = require("../controllers/commentController");
const validate = require("../middleware/validate");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(100000),
  excerpt: z.string().max(500).optional(),
  published: z.boolean().optional(),
});
const updateSchema = createSchema.partial();
const commentSchema = z.object({ body: z.string().min(1).max(5000) });

// Post collection
router.get("/", posts.list);
router.post("/", requireAuth, validate(createSchema), posts.create);

// Comments on a post — registered before /:idOrSlug for clarity, though they
// don't actually collide (different segment count).
router.get("/:id/comments", comments.list);
router.post(
  "/:id/comments",
  requireAuth,
  validate(commentSchema),
  comments.create,
);

// Single post (ID or slug)
router.get("/:idOrSlug", optionalAuth, posts.get);
router.patch("/:id", requireAuth, validate(updateSchema), posts.update);
router.delete("/:id", requireAuth, posts.remove);

module.exports = router;
