const mongoose = require("mongoose");

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.log("MONGODB_URI is not set; starting without a database connection.");
    return null;
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");
  return mongoose.connection;
}

module.exports = connectDatabase;
