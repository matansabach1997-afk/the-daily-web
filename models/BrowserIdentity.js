const mongoose = require("mongoose");

// Reuses the existing browser UUID; this does not generate a second identity.
const browserIdentitySchema = new mongoose.Schema({
  _id: { type: String, required: true },
  guestCommentTimes: { type: [Date], default: [] },
  expiresAt: { type: Date, required: true },
}, { autoCreate: false, autoIndex: false });

// Expired throttle records can be removed; correctness does not depend on TTL timing.
browserIdentitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("BrowserIdentity", browserIdentitySchema);
