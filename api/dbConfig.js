const path = require('path');

const resolveStorageRoot = () => {
  const configured = process.env.STORAGE_ROOT;
  if (configured) {
    return configured;
  }
  return path.resolve(process.cwd(), 'storage');
};

module.exports = {
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  databaseName: process.env.MONGODB_DB_NAME || 'music_streaming',
  collectionName: process.env.MONGODB_TRACKS_COLLECTION || 'tracks_legacy',
  storageRoot: resolveStorageRoot(),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:8888',
  discoveryOptIn: process.env.DISCOVERY_OPT_IN === 'true',
};
