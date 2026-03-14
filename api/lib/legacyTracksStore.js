const fs = require('fs');
const path = require('path');
const { Readable, Writable } = require('stream');
const config = require('../dbConfig');

const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const hasR2Config = () => Boolean(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME &&
  process.env.R2_PUBLIC_BASE_URL
);

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

const readFromR2 = async () => {
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  try {
    const response = await client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: getRemoteJsonPath(),
    }));
    const chunks = [];
    for await (const chunk of response.Body) chunks.push(chunk);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return [];
    throw error;
  }
};

const writeToR2 = async (tracks) => {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const remotePath = getRemoteJsonPath();
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: remotePath,
    Body: Buffer.from(JSON.stringify(tracks, null, 2), 'utf8'),
    ContentType: 'application/json',
  }));
  return { store: 'r2-json', path: remotePath };
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

const preferredStore = () => String(process.env.LEGACY_TRACK_STORE || 'auto').toLowerCase();

// Default 30 s in-memory TTL. Writes always clear the local cache immediately,
// but other warm instances won't see the change until their own TTL expires.
// Keep this at or below the CDN max-age so a stale instance can't cause the
// CDN to perpetually refresh its cache from stale data.
const cacheTtlMs = Number(process.env.LEGACY_TRACK_CACHE_TTL_MS || 30000);
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

  if (store === 'file-json') result = { tracks: await readFromFile(), store: 'file-json' };
  else if (store === 'ftp-json') result = { tracks: await readFromFtp(), store: 'ftp-json' };
  else if (store === 'r2-json') result = { tracks: await readFromR2(), store: 'r2-json' };
  else if (hasR2Config()) result = { tracks: await readFromR2(), store: 'r2-json' };
  else if (hasFtpConfig()) result = { tracks: await readFromFtp(), store: 'ftp-json' };
  else {
    try {
      result = { tracks: await readFromFile(), store: 'file-json' };
    } catch (error) {
      console.warn('File JSON store read failed:', error.message);
      throw error;
    }
  }

  setCachedTracks(result.tracks, result.store);
  return result;
};

const saveTracks = async (tracks) => {
  const store = preferredStore();
  clearCachedTracks();

  if (store === 'r2-json' || (store === 'auto' && hasR2Config())) {
    const result = await writeToR2(tracks);
    setCachedTracks(tracks, 'r2-json');
    return result;
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

  throw new Error(`Unsupported LEGACY_TRACK_STORE value: ${store}. Use r2-json, ftp-json, file-json, or auto.`);
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
  saveTracks,
  withTrackIds,
};
