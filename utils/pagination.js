const mongoose = require("mongoose");
const httpError = require("./httpError");
const { allowedFields, id } = require("./validation");
const PAGE_SIZE = 20;

function cursorFilter(encoded, field, direction = -1, type = "date") {
  if (encoded === undefined) return {};
  try {
    if (typeof encoded !== "string" || encoded.length > 512 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
    const cursor = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    allowedFields(cursor, ["value", "id"]);
    id(cursor.id);
    if (type === "number") {
      if (!Number.isSafeInteger(cursor.value) || cursor.value < 0) throw new Error();
    } else if (typeof cursor.value !== "string" || cursor.value.length > 100) throw new Error();
    const value = type === "date" ? new Date(cursor.value) : cursor.value;
    if (type === "date" && (!Number.isFinite(value.getTime()) || value.toISOString() !== cursor.value)) throw new Error();
    const comparison = direction === -1 ? "$lt" : "$gt";
    return { $or: [
      { [field]: { [comparison]: value } },
      { [field]: value, _id: { [comparison]: new mongoose.Types.ObjectId(cursor.id) } },
    ] };
  } catch {
    throw httpError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
  }
}

function page(rows, field) {
  const hasMore = rows.length > PAGE_SIZE;
  const data = rows.slice(0, PAGE_SIZE);
  const last = data.at(-1);
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ value: last[field], id: String(last._id) })).toString("base64url") : null;
  return { data, meta: { nextCursor, hasMore } };
}

module.exports = { PAGE_SIZE, cursorFilter, page };
