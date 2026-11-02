class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

exports.AppError = AppError;
exports.badRequest = (msg = "Bad Request", extra) =>
  new AppError(400, msg, extra);
exports.unauthorized = (msg = "Unauthorized") => new AppError(401, msg);
exports.forbidden = (msg = "Forbidden") => new AppError(403, msg);
exports.notFound = (msg = "Not Found") => new AppError(404, msg);
exports.conflict = (msg = "Conflict") => new AppError(409, msg);
