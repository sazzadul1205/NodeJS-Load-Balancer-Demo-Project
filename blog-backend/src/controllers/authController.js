const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { sign } = require("../utils/jwt");
const { conflict, unauthorized } = require("../utils/errors");
const asyncHandler = require("../utils/asyncHandler");
const { user: userSerializer } = require("../serializers/user");

exports.register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (await User.findByEmail(email)) throw conflict("Email already registered");
  if (await User.findByUsername(username)) throw conflict("Username taken");

  const passwordHash = await bcrypt.hash(password, 10);
  const id = await User.create({ username, email, passwordHash });
  const created = await User.findById(id);

  const token = sign({ sub: id, username });
  res.status(201).json({ token, user: userSerializer(created) });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findByEmail(email);
  if (!user) throw unauthorized("Invalid credentials");

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw unauthorized("Invalid credentials");

  const token = sign({ sub: user.id, username: user.username });
  res.json({ token, user: userSerializer(user) });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ user: userSerializer(req.user) });
});
