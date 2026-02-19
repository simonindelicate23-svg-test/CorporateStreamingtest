const fs = require('fs');
const path = require('path');
const { Readable, Writable } = require('stream');
const config = require('../dbConfig');

const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const hasFtpConfig = () => Boolean(process.env.FTP_HOST && process.env.FTP_USER && process.env.FTP_PASSWORD);

const getRemoteJsonPath = () => {
  const base = normalizePath(process.env.FTP_BASE_PATH || 'uploads');
  const configured = normalizePath(process.env.TRACKS_JSON_REMOTE_PATH || 'metadata/tracks.json');
  return [base, configured].filter(Boolean).join('/');
};

const getFileJsonPath = () => {
  if (process.env.TRACKS_JSON_PATH) return process.env.TRACKS_JSON_PATH;
  return path.join(config.storageRoot, 'metadata', 'tracks.json');
};

const readFromFtp = async () => {
  const { Client } = require('basic-ftp');
  const client = new Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: process.env.FTP_SECURE === 'true',
    });

    const remotePath = getRemoteJsonPath();
    const chunks = [];
    const sink = new Writable({
      write(chunk, _enc, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });

    await client.downloadTo(sink, remotePath);
    const raw = Buffer.concat(chunks).toString('utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 550 || /not found/i.test(error.message || '')) return [];
    throw error;
  } finally {
    client.close();
  }
};

const writeToFtp = async (tracks) => {
  const { Client } = require('basic-ftp');
  const client = new Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: process.env.FTP_SECURE === 'true',
    });

    const remotePath = getRemoteJsonPath();
    const remoteDir = path.posix.dirname(remotePath);
    await client.ensureDir(remoteDir);

    const payload = Buffer.from(JSON.stringify(tracks, null, 2), 'utf8');
    await client.uploadFrom(Readable.from(payload), path.posix.basename(remotePath));

    return { store: 'ftp-json', path: remotePath };
  } finally {
    client.close();
  }
};

const readFromFile = async () => {
  const filePath = getFileJsonPath();
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const writeToFile = async (tracks) => {
  const filePath = getFileJsonPath();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(tracks, null, 2));
  return { store: 'file-json', path: filePath };
};

const getMongoCollection = async () => {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  return {
    client,
    collection: client.db(config.databaseName).collection(config.collectionName),
  };
};

const readFromMongo = async () => {
  const { client, collection } = await getMongoCollection();
  try {
    return await collection.find().toArray();
  } finally {
    await client.close();
  }
};

const writeToMongo = async (tracks) => {
  const { client, collection } = await getMongoCollection();
  try {
    if (tracks.length) {
      await collection.insertMany(tracks);
    }
    return { store: 'mongodb', path: config.collectionName };
  } finally {
    await client.close();
  }
};

const preferredStore = () => String(process.env.LEGACY_TRACK_STORE || 'auto').toLowerCase();

const cacheTtlMs = Number(process.env.LEGACY_TRACK_CACHE_TTL_MS || 120000);
let trackCache = { tracks: null, store: null, loadedAt: 0 };

const getCachedTracks = () => {
  if (!Array.isArray(trackCache.tracks)) return null;
  if (Date.now() - trackCache.loadedAt > cacheTtlMs) return null;
  return { tracks: trackCache.tracks.map((track) => ({ ...track })), store: trackCache.store };
};

const setCachedTracks = (tracks, store) => {
  trackCache = {
    tracks: Array.isArray(tracks) ? tracks.map((track) => ({ ...track })) : null,
    store,
    loadedAt: Date.now(),
  };
};

const clearCachedTracks = () => {
  trackCache = { tracks: null, store: null, loadedAt: 0 };
};

const loadTracks = async () => {
  const cached = getCachedTracks();
  if (cached) return cached;

  const store = preferredStore();
  let result;

  if (store === 'mongodb') result = { tracks: await readFromMongo(), store: 'mongodb' };
  else if (store === 'file-json') result = { tracks: await readFromFile(), store: 'file-json' };
  else if (store === 'ftp-json') result = { tracks: await readFromFtp(), store: 'ftp-json' };
  else if (hasFtpConfig()) result = { tracks: await readFromFtp(), store: 'ftp-json' };
  else {
    try {
      result = { tracks: await readFromFile(), store: 'file-json' };
    } catch (error) {
      console.warn('File JSON store read failed, falling back to MongoDB:', error.message);
      result = { tracks: await readFromMongo(), store: 'mongodb' };
    }
  }

  setCachedTracks(result.tracks, result.store);
  return result;
};

const appendTracks = async (newTracks) => {
  const store = preferredStore();
  clearCachedTracks();

  if (store === 'mongodb') {
    const result = await writeToMongo(newTracks);
    return result;
  }

  if (store === 'ftp-json' || (store === 'auto' && hasFtpConfig())) {
    const existing = await readFromFtp();
    const merged = existing.concat(newTracks);
    const result = await writeToFtp(merged);
    setCachedTracks(merged, 'ftp-json');
    return result;
  }

  if (store === 'file-json' || store === 'auto') {
    const existing = await readFromFile();
    const merged = existing.concat(newTracks);
    const result = await writeToFile(merged);
    setCachedTracks(merged, 'file-json');
    return result;
  }

  throw new Error(`Unsupported LEGACY_TRACK_STORE value: ${store}`);
};

const saveTracks = async (tracks) => {
  const store = preferredStore();
  clearCachedTracks();

  if (store === 'mongodb') {
    const { client, collection } = await getMongoCollection();
    try {
      await collection.deleteMany({});
      if (tracks.length) await collection.insertMany(tracks);
      setCachedTracks(tracks, 'mongodb');
      return { store: 'mongodb', path: config.collectionName };
    } finally {
      await client.close();
    }
  }

  if (store === 'ftp-json' || (store === 'auto' && hasFtpConfig())) {
    const result = await writeToFtp(tracks);
    setCachedTracks(tracks, 'ftp-json');
    return result;
  }

  if (store === 'file-json' || store === 'auto') {
    const result = await writeToFile(tracks);
    setCachedTracks(tracks, 'file-json');
    return result;
  }

  throw new Error(`Unsupported LEGACY_TRACK_STORE value: ${store}`);
};

const generateTrackId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const withTrackIds = (tracks = []) => {
  let changed = false;
  const normalized = tracks.map((track) => {
    if (track?._id) return track;
    changed = true;
    return { ...track, _id: generateTrackId() };
  });
  return { tracks: normalized, changed };
};

module.exports = {
  loadTracks,
  appendTracks,
  saveTracks,
  withTrackIds,
};
