const rateLimit = require("express-rate-limit");
const config = require("../config/env");

const base = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
};

// NOTE: this is an in-memory limiter — each API instance keeps its own counter.
// Behind the LB, effective limits are N × this. Swap `rate-limit-redis` in
// once you add Redis. For local testing it's fine.
exports.globalLimiter = rateLimit({
  ...base,
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
});

exports.authLimiter = rateLimit({
  ...base,
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
});
