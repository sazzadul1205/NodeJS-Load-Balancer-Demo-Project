const { verify } = require("../utils/jwt");
const { unauthorized } = require("../utils/errors");
const User = require("../models/User");

function extractToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

async function loadUser(req) {
  const token = extractToken(req);
  if (!token) return null;
  try {
    const payload = verify(token);
    return (await User.findById(payload.sub)) || null;
  } catch {
    return null;
  }
}

exports.optionalAuth = async (req, res, next) => {
  req.user = await loadUser(req);
  next();
};

exports.requireAuth = async (req, res, next) => {
  const user = await loadUser(req);
  if (!user) return next(unauthorized("Authentication required"));
  req.user = user;
  next();
};
