exports.postList = (row) => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  excerpt: row.excerpt,
  published: !!row.published,
  viewCount: Number(row.view_count),
  author: {
    id: row.author_id,
    username: row.author_username,
  },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

exports.postDetail = (row) => ({
  ...exports.postList(row),
  body: row.body,
});
