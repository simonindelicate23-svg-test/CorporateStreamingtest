const { getCollections } = require('./db');

const hasEntitlementForTrack = async (identity, track) => {
  if (!track || !track.access || track.access.mode === 'public') return true;

  const { entitlements } = await getCollections();
  const now = new Date();
  const productIds = track.access.productIds || [];

  const byEmail = identity.email
    ? await entitlements.findOne({
        productId: { $in: productIds },
        'listener.email': identity.email,
        revokedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      })
    : null;

  if (byEmail) return true;

  if (identity.paypalPayerId) {
    const byPayer = await entitlements.findOne({
      productId: { $in: productIds },
      'listener.paypalPayerId': identity.paypalPayerId,
      revokedAt: null,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    });
    if (byPayer) return true;
  }

  return false;
};

module.exports = {
  hasEntitlementForTrack,
};
