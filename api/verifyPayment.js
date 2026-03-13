const { json } = require('./lib/http');
const { verifyOrder, verifySubscription } = require('./lib/paypal');
const { signToken } = require('./lib/tokenAuth');

// Subscription tokens expire after 1 hour; client silently refreshes.
// Order tokens never expire — a completed purchase is permanent.
const SUBSCRIPTION_TTL_SECONDS = 60 * 60;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return json(400, { message: 'Invalid JSON' });
  }

  const { type, id } = body;
  if (!type || !id) return json(400, { message: 'type and id are required' });

  if (type === 'order') {
    const result = await verifyOrder(id).catch(() => null);
    if (!result) return json(402, { message: 'Order not found or not completed' });

    const token = signToken({
      v: 1,
      type: 'order',
      refId: result.orderId,
      scope: 'all',
      email: result.email,
      iat: Math.floor(Date.now() / 1000),
      exp: null,
    });

    return json(200, { token });
  }

  if (type === 'subscription') {
    const result = await verifySubscription(id).catch(() => null);
    if (!result) return json(402, { message: 'Subscription not found or not active' });

    const iat = Math.floor(Date.now() / 1000);
    const token = signToken({
      v: 1,
      type: 'subscription',
      refId: result.subscriptionId,
      scope: 'all',
      email: result.email,
      iat,
      exp: iat + SUBSCRIPTION_TTL_SECONDS,
    });

    return json(200, { token, expiresAt: iat + SUBSCRIPTION_TTL_SECONDS });
  }

  return json(400, { message: 'type must be "order" or "subscription"' });
};
