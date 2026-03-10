const { json } = require('./lib/http');
const { getAccessToken: getPayPalAccessToken } = require('./lib/paypal');
const { loadSiteSettings } = require('./lib/siteSettingsStore');

// Creates a PayPal order for a per-release purchase.
// The product must be configured in site settings under `products[]`.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return json(400, { message: 'Invalid JSON' });
  }

  const { productId } = body;
  if (!productId) return json(400, { message: 'productId is required' });

  const settings = await loadSiteSettings().catch(() => ({}));
  const products = settings.products || [];
  const product = products.find(p => p.id === productId);
  if (!product) return json(404, { message: 'Product not found' });

  const accessToken = await getPayPalAccessToken().catch(() => null);
  if (!accessToken) return json(503, { message: 'PayPal unavailable' });

  const origin = event.headers?.origin || event.headers?.referer?.replace(/\/[^/]*$/, '') || '';

  const res = await fetch(`${process.env.PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: product.currency || 'GBP', value: String(product.price) },
        description: product.label || product.id,
      }],
      application_context: {
        return_url: `${origin}/support.html`,
        cancel_url: `${origin}/support.html`,
      },
    }),
  }).catch(() => null);

  if (!res?.ok) return json(502, { message: 'PayPal order creation failed' });
  const order = await res.json();
  return json(200, { orderId: order.id });
};
