const mongoose = require("mongoose");

const contentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
      trim: true,
    },
    summary: {
      type: String,
      default: "",
      trim: true,
    },
    body: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      default: "",
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const articleSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The editable/reviewable version; changes do not replace public content.
    workingContent: {
      type: contentSchema,
      required: true,
    },
    // The last approved version remains public regardless of the current status.
    publishedContent: {
      type: contentSchema,
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "pending", "returned", "published"],
      default: "draft",
      required: true,
    },
    editorNote: {
      type: String,
      trim: true,
      default: "",
    },
    // First approval time; controllers/services will set this when publishing.
    publishedAt: {
      type: Date,
      default: null,
    },
    // One timestamp per publication or approved update, not per draft edit.
    publicationHistory: {
      type: [Date],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Article", articleSchema);
