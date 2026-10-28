const LIMIT = 32768;
// Keep the provider's text structure, never credentials or contact details.
function redact(value, env) {
  let text = String(value || '');
  for (const name of ['SENDER_API_TOKEN', 'SENDER_FROM_EMAIL', 'SENDER_POSTAL_ADDRESS']) {
    if (env[name]) text = text.split(env[name]).join('[redacted]');
  }
  return text.replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [redacted]')
    .replace(/https?:\/\/[^\s"<>]+/gi, '[redacted URL]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted IP]')
    .replace(/\b(?:[a-f\d]{0,4}:){2,}[a-f\d:]*\b/gi, '[redacted IP]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted identifier]');
}
async function captureResponse(response, path, method, env) {
  let raw = '', truncated = false, readError = false;
  try {
    const reader = response.body?.getReader();
    if (reader) {
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const remaining = LIMIT - size;
          chunks.push(Buffer.from(value.subarray(0, remaining))); size += Math.min(remaining, value.length);
          if (value.length > remaining || size === LIMIT) { truncated = true; await reader.cancel(); break; }
        }
      } finally { reader.releaseLock(); raw = Buffer.concat(chunks).toString('utf8'); }
    } else if (typeof response.text === 'function') {
      raw = await response.text(); truncated = Buffer.byteLength(raw) > LIMIT;
      raw = Buffer.from(raw).subarray(0, LIMIT).toString('utf8');
    } else raw = JSON.stringify(await response.json());
  } catch { readError = true; }
  const headers = {};
  for (const name of ['content-type', 'cf-ray', 'x-request-id', 'date', 'server']) {
    const value = response.headers?.get(name);
    if (value) headers[name] = redact(value, env).slice(0, 250);
  }
  return { captured_at: new Date().toISOString(), method,
    endpoint: `https://api.sender.net/v2${path}`, http_status: response.status, headers,
    response_body: redact(raw, env), truncated, read_error: readError,
    note: 'Provider response text with secrets, email addresses, URLs, IP addresses and long identifiers redacted. Not a byte-for-byte original. No request headers or payload captured.' };
}
module.exports = { captureResponse };
