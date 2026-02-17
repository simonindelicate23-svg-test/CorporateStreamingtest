const { getCollections } = require('../api/lib/db');

const ensureIndexes = async () => {
  const { artists, releases, tracks, assets, products, entitlements } = await getCollections();

  await artists.createIndex({ artistId: 1 }, { unique: true, sparse: true });
  await artists.createIndex({ slug: 1 }, { unique: true, sparse: true });

  await releases.createIndex({ releaseId: 1 }, { unique: true, sparse: true });
  await releases.createIndex({ artistId: 1, slug: 1 }, { unique: true, sparse: true });
  await releases.createIndex({ published: 1, artistId: 1 });

  await tracks.createIndex({ trackId: 1 }, { unique: true, sparse: true });
  await tracks.createIndex({ releaseId: 1, trackNumber: 1 });
  await tracks.createIndex({ published: 1, releaseId: 1 });

  await assets.createIndex({ assetId: 1 }, { unique: true, sparse: true });
  await assets.createIndex({ ownerType: 1, ownerId: 1, kind: 1 });

  await products.createIndex({ productId: 1 }, { unique: true, sparse: true });
  await products.createIndex({ scope: 1, scopeRef: 1, active: 1 });

  await entitlements.createIndex({ 'source.captureId': 1 }, { unique: true, sparse: true });
  await entitlements.createIndex({ 'listener.email': 1, scopeRef: 1, revokedAt: 1 });
};

ensureIndexes()
  .then(() => {
    console.log('Setup complete: indexes ensured.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
