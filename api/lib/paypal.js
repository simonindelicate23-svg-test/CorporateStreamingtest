const { getCollections } = require('./db');
const { newEntitlementId } = require('./ids');

const apiBase = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

const getAccessToken = async () => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are not configured');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get PayPal access token: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.access_token;
};

const verifyWebhookSignature = async (event, rawBody) => {
  const token = await getAccessToken();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID missing');

  const verificationBody = {
    auth_algo: event.headers?.['paypal-auth-algo'] || event.headers?.['PAYPAL-AUTH-ALGO'],
    cert_url: event.headers?.['paypal-cert-url'] || event.headers?.['PAYPAL-CERT-URL'],
    transmission_id: event.headers?.['paypal-transmission-id'] || event.headers?.['PAYPAL-TRANSMISSION-ID'],
    transmission_sig: event.headers?.['paypal-transmission-sig'] || event.headers?.['PAYPAL-TRANSMISSION-SIG'],
    transmission_time: event.headers?.['paypal-transmission-time'] || event.headers?.['PAYPAL-TRANSMISSION-TIME'],
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  };

  const response = await fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verificationBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook verification failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.verification_status === 'SUCCESS';
};

const grantEntitlementFromCapture = async (resource) => {
  const { products, entitlements } = await getCollections();

  const customProductId = resource?.custom_id;
  const paypalProductId = resource?.supplementary_data?.related_ids?.order_id;

  const product = customProductId
    ? await products.findOne({ productId: customProductId, active: true })
    : await products.findOne({ 'paypal.productId': paypalProductId, active: true });

  if (!product) return false;

  const payer = resource?.payer || {};
  const payerEmail = payer.email_address || '';
  const payerId = payer.payer_id || '';
  const captureId = resource?.id;

  if (!captureId) return false;

  const existing = await entitlements.findOne({ 'source.captureId': captureId });
  if (existing) return true;

  await entitlements.insertOne({
    entitlementId: newEntitlementId(),
    listener: {
      email: payerEmail.toLowerCase(),
      paypalPayerId: payerId,
    },
    productId: product.productId,
    scope: product.scope,
    scopeRef: product.scopeRef,
    source: {
      provider: 'paypal',
      orderId: resource?.supplementary_data?.related_ids?.order_id || null,
      captureId,
      status: resource?.status || 'COMPLETED',
    },
    grantedAt: new Date(),
    expiresAt: null,
    revokedAt: null,
  });

  return true;
};

const verifyOrder = async (orderId) => {
  const token = await getAccessToken();
  const response = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (data.status !== 'COMPLETED') return null;
  const payer = data.payer || {};
  return {
    orderId,
    email: (payer.email_address || '').toLowerCase(),
    payerId: payer.payer_id || '',
  };
};

const verifySubscription = async (subscriptionId) => {
  const token = await getAccessToken();
  const response = await fetch(`${apiBase}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (data.status !== 'ACTIVE') return null;
  const subscriber = data.subscriber || {};
  return {
    subscriptionId,
    email: (subscriber.email_address || '').toLowerCase(),
    payerId: subscriber.payer_id || '',
  };
};

module.exports = {
  getAccessToken,
  verifyWebhookSignature,
  grantEntitlementFromCapture,
  verifyOrder,
  verifySubscription,
};
