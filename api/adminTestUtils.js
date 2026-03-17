/**
 * Admin-only testing utilities (no database required).
 * All data lives in the same FTP/R2/file store as everything else.
 *
 * POST /.netlify/functions/adminTestUtils
 *
 * { action: 'listUser',   email: '...' }  → show stored subscription records
 * { action: 'removeUser', email: '...' }  → delete subscription records for that email
 *
 * Requires X-Admin-Token header.
 */
const { json } = require('./lib/http');
const { isAdmin } = require('./lib/auth');
const { loadSubscriptions, removeByEmail } = require('./lib/subscriptionsStore');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });
  if (!isAdmin(event)) return json(401, { message: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return json(400, { message: 'Invalid JSON' });
  }

  const { action, email } = body;
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!action) return json(400, { message: 'action is required' });
  if (!normalizedEmail) return json(400, { message: 'email is required' });

  if (action === 'listUser') {
    const all = await loadSubscriptions();
    const records = all.filter(r => r.email === normalizedEmail);
    return json(200, { email: normalizedEmail, subscriptions: records });
  }

  if (action === 'removeUser') {
    const deleted = await removeByEmail(normalizedEmail);
    return json(200, {
      message: `Removed ${deleted} subscription record(s) for ${normalizedEmail}`,
      deleted,
    });
  }

  return json(400, { message: `Unknown action "${action}". Supported: removeUser, listUser` });
};
