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

const loadTracks = async () => {
  const store = preferredStore();

  if (store === 'mongodb') return { tracks: await readFromMongo(), store: 'mongodb' };
  if (store === 'file-json') return { tracks: await readFromFile(), store: 'file-json' };
  if (store === 'ftp-json') return { tracks: await readFromFtp(), store: 'ftp-json' };

  if (hasFtpConfig()) return { tracks: await readFromFtp(), store: 'ftp-json' };
  try {
    return { tracks: await readFromFile(), store: 'file-json' };
  } catch (error) {
    console.warn('File JSON store read failed, falling back to MongoDB:', error.message);
    return { tracks: await readFromMongo(), store: 'mongodb' };
  }
};

const appendTracks = async (newTracks) => {
  const store = preferredStore();

  if (store === 'mongodb') return writeToMongo(newTracks);

  if (store === 'ftp-json' || (store === 'auto' && hasFtpConfig())) {
    const existing = await readFromFtp();
    return writeToFtp(existing.concat(newTracks));
  }

  if (store === 'file-json' || store === 'auto') {
    const existing = await readFromFile();
    return writeToFile(existing.concat(newTracks));
  }

  throw new Error(`Unsupported LEGACY_TRACK_STORE value: ${store}`);
};

const saveTracks = async (tracks) => {
  const store = preferredStore();

  if (store === 'mongodb') {
    const { client, collection } = await getMongoCollection();
    try {
      await collection.deleteMany({});
      if (tracks.length) await collection.insertMany(tracks);
      return { store: 'mongodb', path: config.collectionName };
    } finally {
      await client.close();
    }
  }

  if (store === 'ftp-json' || (store === 'auto' && hasFtpConfig())) {
    return writeToFtp(tracks);
  }

  if (store === 'file-json' || store === 'auto') {
    return writeToFile(tracks);
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
