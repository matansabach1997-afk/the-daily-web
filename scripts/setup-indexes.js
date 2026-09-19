const mongoose = require("mongoose");
const connectDatabase = require("../config/database");
const models = [require("../models/User"), require("../models/Article"), require("../models/Session"), require("../models/ViewStat")];

async function run() {
  await connectDatabase();
  for (const model of models) {
    // createIndexes never drops indexes. Do not replace with syncIndexes.
    await model.createIndexes();
    console.log(`Indexes ready: ${model.modelName}`);
  }
}
run().catch(() => {
  console.error("Index setup failed. Check database availability and duplicate data; no indexes were dropped.");
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
