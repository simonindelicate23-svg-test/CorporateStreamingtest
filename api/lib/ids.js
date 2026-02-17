const crypto = require('crypto');

const randomId = (prefix) => `${prefix}_${crypto.randomBytes(10).toString('hex')}`;

module.exports = {
  newArtistId: () => randomId('art'),
  newReleaseId: () => randomId('rel'),
  newTrackId: () => randomId('trk'),
  newAssetId: () => randomId('ast'),
  newProductId: () => randomId('prd'),
  newEntitlementId: () => randomId('ent'),
};
