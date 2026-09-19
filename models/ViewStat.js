const mongoose = require("mongoose");

// Loaded before connection with bufferCommands=false; db:indexes initializes it.
const viewStatSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: "Article", required: true },
  // Anonymous, client-controlled UUID; not a User reference or authentication.
  browserId: {
    type: String, required: true, lowercase: true,
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  },
  bucketStart: {
    type: Date, required: true,
    validate: (value) => value.getTime() % 3600000 === 0,
  },
  views: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  lastViewedAt: { type: Date, required: true },
}, { timestamps: true, autoCreate: false, autoIndex: false });

// One counter, not one document per visit. Unique index is required for upserts.
viewStatSchema.index({ article: 1, browserId: 1, bucketStart: 1 }, { unique: true });
viewStatSchema.index({ article: 1, bucketStart: 1 });
viewStatSchema.index({ browserId: 1, article: 1 });

module.exports = mongoose.model("ViewStat", viewStatSchema);
