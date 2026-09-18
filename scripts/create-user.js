const mongoose = require("mongoose");
const connectDatabase = require("../config/database");
const User = require("../models/User");
const { username } = require("../services/userService");
const { hashPassword } = require("../services/passwordService");

async function run() {
  const name = username(process.env.ACCOUNT_USERNAME);
  const role = process.env.ACCOUNT_ROLE;
  if (!["reporter", "editor"].includes(role)) throw new Error("ACCOUNT_ROLE must be reporter or editor.");
  const passwordHash = await hashPassword(process.env.ACCOUNT_PASSWORD);
  await connectDatabase();
  // init() can retain a pre-connection failure when bufferCommands is false.
  // Build the unique username index after connecting, as in setup-indexes.js.
  await User.createIndexes();
  if (await User.exists({ username: name })) throw new Error("Username already exists; no account was changed.");
  const user = await User.create({ username: name, role, passwordHash });
  console.log(`Created ${role} account ${user._id}. No password or hash is printed.`);
}

run().catch(() => {
  console.error("Account creation failed. Check ACCOUNT_USERNAME, ACCOUNT_ROLE, ACCOUNT_PASSWORD, database availability and username uniqueness.");
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
