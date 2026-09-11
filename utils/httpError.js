function httpError(status, code, message, fields) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (fields) error.fields = fields;
  return error;
}

module.exports = httpError;
