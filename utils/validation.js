const httpError = require("./httpError");

function object(value, name = "body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "INVALID_INPUT", `${name} must be an object.`);
  }
  return value;
}

function allowedFields(value, allowed, name = "body") {
  object(value, name);
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw httpError(400, "UNKNOWN_FIELD", `${name} contains an unsupported field.`);
  }
}

function id(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw httpError(400, "INVALID_ID", "A valid resource ID is required.");
  }
  return value;
}

function text(value, field, { min = 0, max = 200, trim = true } = {}) {
  if (typeof value !== "string") {
    throw httpError(400, "INVALID_INPUT", `${field} must be a string.`);
  }
  const result = trim ? value.trim() : value;
  if (result.length < min || result.length > max) {
    throw httpError(422, "VALIDATION_FAILED", "Please check the submitted fields.", {
      [field]: `Must contain ${min}–${max} characters.`,
    });
  }
  return result;
}

function browserId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw httpError(400, "INVALID_BROWSER_ID", "A valid anonymous browser UUID is required.");
  }
  return value.toLowerCase();
}

module.exports = { object, allowedFields, id, text, browserId };
