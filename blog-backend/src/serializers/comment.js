exports.comment = (row) => ({
  id: row.id,
  postId: row.post_id,
  body: row.body,
  author: {
    id: row.author_id,
    username: row.author_username,
  },
  createdAt: row.created_at,
});
