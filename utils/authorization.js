const httpError = require("./httpError");

function requireActor(actor, roles = ["reporter", "editor"]) {
  if (!actor) throw httpError(401, "AUTHENTICATION_REQUIRED", "Please log in.");
  if (!roles.includes(actor.role)) throw httpError(403, "FORBIDDEN", "Your role cannot perform this action.");
}

module.exports = requireActor;
