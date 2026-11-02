const Comment = require("../models/Comment");
const Post = require("../models/Post");
const asyncHandler = require("../utils/asyncHandler");
const { notFound, forbidden } = require("../utils/errors");
const { comment: commentSerializer } = require("../serializers/comment");

function pageParams(q) {
  const page = Math.max(1, parseInt(q.page || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit || "20", 10) || 20));
  return { page, limit };
}

exports.list = asyncHandler(async (req, res) => {
  const postId = Number(req.params.id);
  const post = await Post.findById(postId);
  if (!post) throw notFound("Post not found");

  const { page, limit } = pageParams(req.query);
  const { rows, total } = await Comment.listForPost(postId, { page, limit });
  res.json({
    data: rows.map(commentSerializer),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

exports.create = asyncHandler(async (req, res) => {
  const postId = Number(req.params.id);
  const post = await Post.findById(postId);
  if (!post) throw notFound("Post not found");

  const id = await Comment.create({
    postId,
    authorId: req.user.id,
    body: req.body.body,
  });
  const created = await Comment.findById(id);
  res.status(201).json({ data: commentSerializer(created) });
});

exports.remove = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(Number(req.params.id));
  if (!comment) throw notFound("Comment not found");

  const post = await Post.findById(comment.post_id);
  const isCommentAuthor = comment.author_id === req.user.id;
  const isPostAuthor = post && post.author_id === req.user.id;
  if (!isCommentAuthor && !isPostAuthor) throw forbidden("Not allowed");

  await Comment.remove(comment.id);
  res.status(204).end();
});
