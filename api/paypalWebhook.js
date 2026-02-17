const { json } = require('./lib/http');
const { verifyWebhookSignature, grantEntitlementFromCapture } = require('./lib/paypal');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}');

  try {
    const verified = await verifyWebhookSignature(event, rawBody);
    if (!verified) return json(400, { message: 'Invalid webhook signature' });

    const payload = JSON.parse(rawBody);
    if (payload.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      await grantEntitlementFromCapture(payload.resource);
    }

    return json(200, { ok: true });
  } catch (error) {
    console.error('PayPal webhook error:', error);
    return json(500, { message: error.message });
  }
};
