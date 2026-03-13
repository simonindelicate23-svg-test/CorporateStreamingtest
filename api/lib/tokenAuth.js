const crypto = require('crypto');

const secret = () => {
  const s = process.env.PAYMENT_SECRET;
  if (!s) throw new Error('PAYMENT_SECRET env var not set');
  return s;
};

// Token format: base64url(JSON payload) + "." + base64url(HMAC-SHA256)
const signToken = (payload) => {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
};

// Returns decoded payload or null if invalid/expired
const verifyToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  } catch (_) {
    return null;
  }
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
};

module.exports = { signToken, verifyToken };
