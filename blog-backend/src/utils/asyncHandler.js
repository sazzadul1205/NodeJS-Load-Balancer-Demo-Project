// Express 4 doesn't forward async errors. This tiny wrapper does.
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
