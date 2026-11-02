const Post = require("../models/Post");
const asyncHandler = require("../utils/asyncHandler");
const { notFound, forbidden, conflict } = require("../utils/errors");
const { postList, postDetail } = require("../serializers/post");
const viewCounter = require("../services/viewCounter");

function slugify(input) {
  let slug = String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
  if (!slug) slug = `post-${Date.now()}`;
  // Avoid colliding with numeric IDs in the /:idOrSlug route.
  if (/^\d+$/.test(slug)) slug = `p-${slug}`;
  return slug;
}

function pageParams(q) {
  const page = Math.max(1, parseInt(q.page || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(q.limit || "20", 10) || 20));
  return { page, limit };
}

async function resolvePost(idOrSlug) {
  if (/^\d+$/.test(idOrSlug)) return Post.findById(Number(idOrSlug));
  return Post.findBySlug(idOrSlug);
}

exports.list = asyncHandler(async (req, res) => {
  const { page, limit } = pageParams(req.query);
  const authorId = req.query.authorId ? Number(req.query.authorId) : undefined;
  const search = (req.query.search || "").trim() || undefined;

  const { rows, total } = await Post.list({ page, limit, authorId, search });
  res.json({
    data: rows.map(postList),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

exports.get = asyncHandler(async (req, res) => {
  const post = await resolvePost(req.params.idOrSlug);
  if (!post) throw notFound("Post not found");
  if (!post.published && (!req.user || req.user.id !== post.author_id)) {
    throw notFound("Post not found");
  }
  viewCounter.record(post.id);
  res.json({ data: postDetail(post) });
});

exports.create = asyncHandler(async (req, res) => {
  const { title, body, excerpt, published } = req.body;
  const slugBase = slugify(title);
  let slug = slugBase;
  let attempts = 0;

  while (attempts < 3) {
    try {
      const id = await Post.create({
        authorId: req.user.id,
        title,
        slug,
        excerpt,
        body,
        published: published !== false,
      });
      const created = await Post.findById(id);
      return res.status(201).json({ data: postDetail(created) });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY" && attempts < 2) {
        attempts += 1;
        slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
        continue;
      }
      if (err.code === "ER_DUP_ENTRY") throw conflict("Slug already in use");
      throw err;
    }
  }
});

exports.update = asyncHandler(async (req, res) => {
  const post = await Post.findById(Number(req.params.id));
  if (!post) throw notFound("Post not found");
  if (post.author_id !== req.user.id) throw forbidden("Not your post");

  await Post.update(post.id, req.body);
  const updated = await Post.findById(post.id);
  res.json({ data: postDetail(updated) });
});

exports.remove = asyncHandler(async (req, res) => {
  const post = await Post.findById(Number(req.params.id));
  if (!post) throw notFound("Post not found");
  if (post.author_id !== req.user.id) throw forbidden("Not your post");

  await Post.remove(post.id);
  res.status(204).end();
});
