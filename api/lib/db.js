const { MongoClient } = require('mongodb');
const config = require('../dbConfig');

let clientPromise;

const getClient = async () => {
  if (!clientPromise) {
    const client = new MongoClient(config.mongodbUri);
    clientPromise = client.connect();
  }
  return clientPromise;
};

const getDb = async () => {
  const client = await getClient();
  return client.db(config.databaseName);
};

const getCollections = async () => {
  const db = await getDb();
  return {
    db,
    legacyTracks: db.collection(config.collectionName),
    artists: db.collection('artists'),
    releases: db.collection('releases'),
    tracks: db.collection('tracks'),
    assets: db.collection('assets'),
    products: db.collection('products'),
    entitlements: db.collection('entitlements'),
    settings: db.collection('settings'),
  };
};

module.exports = {
  getClient,
  getDb,
  getCollections,
};
