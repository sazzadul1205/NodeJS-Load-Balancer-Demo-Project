const { AppError } = require("../utils/errors");

exports.notFound = (req, res) => {
  res.status(404).json({
    error: "NotFound",
    path: req.originalUrl,
    requestId: req.id,
  });
};

exports.errorHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.message,
      ...err.extra,
      requestId: req.id,
    });
  }
  // Unknown error — log full detail, return a generic message.
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    error: "InternalServerError",
    requestId: req.id,
  });
};
