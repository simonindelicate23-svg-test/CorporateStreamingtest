const { json } = require('./lib/http');
const { getAccessToken } = require('./lib/paypal');
const { loadSiteSettings } = require('./lib/siteSettingsStore');

const apiBase = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  const settings = await loadSiteSettings().catch(() => ({}));
  if (!settings.paymentsEnabled) return json(403, { error: 'Payments not enabled' });

  const planId = settings.paypalPlanId;
  if (!planId) return json(400, { error: 'No subscription plan configured' });

  const token = await getAccessToken();
  const response = await fetch(`${apiBase}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plan_id: planId }),
  });

  if (!response.ok) {
    const text = await response.text();
    return json(response.status, { error: `PayPal error: ${text}` });
  }

  const data = await response.json();
  return json(200, { subscriptionId: data.id });
};
