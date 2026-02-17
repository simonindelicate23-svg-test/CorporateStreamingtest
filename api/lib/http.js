const readJsonBody = (event) => {
  if (!event.body) return {};
  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(body || '{}');
};

const json = (statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: { 'content-type': 'application/json', ...extraHeaders },
  body: JSON.stringify(payload),
});

module.exports = {
  readJsonBody,
  json,
};
