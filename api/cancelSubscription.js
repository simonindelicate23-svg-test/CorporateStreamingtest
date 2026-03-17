const { json } = require('./lib/http');
const { cancelSubscription: ppCancel } = require('./lib/paypal');
const { verifyToken } = require('./lib/tokenAuth');
const { findBySubscriptionId, upsertSubscription } = require('./lib/subscriptionsStore');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

  // Authenticate via the signed access token the client holds
  const rawToken =
    event.headers?.['x-access-token'] ||
    event.headers?.['X-Access-Token'] ||
    '';

  const payload = verifyToken(rawToken);
  if (!payload || payload.type !== 'subscription' || !payload.refId) {
    return json(401, { message: 'Valid subscription token required' });
  }

  const subscriptionId = payload.refId;

  try {
    await ppCancel(subscriptionId, 'Cancelled by subscriber via site');

    // Update our record if we have one
    const existing = await findBySubscriptionId(subscriptionId).catch(() => null);
    if (existing) {
      await upsertSubscription({ ...existing, status: 'CANCELLED', cancelledAt: new Date().toISOString() }).catch(() => {});
    }

    return json(200, { message: 'Subscription cancelled' });
  } catch (err) {
    console.error('cancelSubscription error', err);
    return json(500, { message: err.message || 'Could not cancel — please try again or cancel via PayPal.' });
  }
};
