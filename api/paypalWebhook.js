const { json } = require('./lib/http');
const { verifyWebhookSignature } = require('./lib/paypal');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}');

  try {
    const verified = await verifyWebhookSignature(event, rawBody);
    if (!verified) return json(400, { message: 'Invalid webhook signature' });

    // Webhook received and verified. The payment gating system uses real-time
    // PayPal verification via /verifyPayment rather than webhook-driven entitlements,
    // so no further action is required here.
    const payload = JSON.parse(rawBody);
    console.log('PayPal webhook received:', payload.event_type);

    return json(200, { ok: true });
  } catch (error) {
    console.error('PayPal webhook error:', error);
    return json(500, { message: error.message });
  }
};
