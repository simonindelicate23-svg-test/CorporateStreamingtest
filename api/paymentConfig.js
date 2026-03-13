const { json } = require('./lib/http');
const { loadSiteSettings } = require('./lib/siteSettingsStore');

// Returns the non-secret payment configuration needed by the player.
// PAYPAL_CLIENT_ID is a public key — safe to expose to the browser.
exports.handler = async () => {
  const settings = await loadSiteSettings().catch(() => ({}));
  return json(200, {
    paymentsEnabled: settings.paymentsEnabled === true,
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    planId: settings.paypalPlanId || '',
    subscriptionLabel: settings.paypalSubscriptionLabel || 'Subscribe',
    subscriptionPrice: settings.paypalSubscriptionPrice || '',
  });
};
