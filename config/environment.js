function getEnvironment() {
  const nodeEnv = process.env.NODE_ENV || "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test or production.");
  }
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < (nodeEnv === "test" ? 0 : 1) || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  const mongoUri = process.env.MONGODB_URI;
  if (typeof mongoUri !== "string" || !/^mongodb(?:\+srv)?:\/\/\S+$/.test(mongoUri)) {
    throw new Error("Set MONGODB_URI to a valid MongoDB connection string.");
  }
  return { nodeEnv, port, mongoUri, host: process.env.HOST || "127.0.0.1" };
}

module.exports = getEnvironment;
