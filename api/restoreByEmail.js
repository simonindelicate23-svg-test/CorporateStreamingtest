const { json } = require('./lib/http');
const { verifySubscription } = require('./lib/paypal');
const { signToken } = require('./lib/tokenAuth');
const { findByEmail, upsertSubscription } = require('./lib/subscriptionsStore');

const SUBSCRIPTION_TTL_SECONDS = 60 * 60;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return json(400, { message: 'Invalid JSON' });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return json(400, { message: 'A valid email address is required' });
  }

  try {
    const record = await findByEmail(email);

    if (!record) {
      return json(404, {
        message: 'No active subscription found for that email. Check the address or subscribe below.',
      });
    }

    // Re-verify with PayPal that the subscription is still active
    const result = await verifySubscription(record.subscriptionId).catch(() => null);
    if (!result) {
      await upsertSubscription({ ...record, status: 'INACTIVE', lastChecked: new Date().toISOString() }).catch(() => {});
      return json(402, {
        message: 'Subscription is no longer active. If you believe this is an error, contact support.',
      });
    }

    // Refresh our record
    await upsertSubscription({ ...record, status: 'ACTIVE', lastVerified: new Date().toISOString() }).catch(() => {});

    const iat = Math.floor(Date.now() / 1000);
    const token = signToken({
      v: 1,
      type: 'subscription',
      refId: result.subscriptionId,
      scope: 'all',
      email: result.email || email,
      iat,
      exp: iat + SUBSCRIPTION_TTL_SECONDS,
    });

    return json(200, { token, expiresAt: iat + SUBSCRIPTION_TTL_SECONDS });
  } catch (err) {
    console.error('restoreByEmail error', err);
    return json(500, { message: 'Server error — please try again.' });
  }
};
