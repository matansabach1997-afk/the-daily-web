const mongoose = require("mongoose");
const getEnvironment = require("./environment");
const log = require("../utils/logger");

mongoose.set("bufferCommands", false);

async function connectDatabase() {
  const { mongoUri } = getEnvironment();
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 20 });
  } catch {
    // Driver errors may contain the connection string; do not expose it.
    throw new Error("MongoDB connection failed. Check configuration and that MongoDB is running.");
  }
  log("info", "database.connected");
  return mongoose.connection;
}

module.exports = connectDatabase;
