/**
 * shareIndexStore — persists a lightweight share-metadata index alongside
 * tracks.json so that share.js can look up OG data in O(1) without loading
 * the full track catalogue at crawl time.
 *
 * File stored at:  <same dir as tracks.json>/share-index.json
 *
 * Format:
 *   {
 *     "<trackId>": {
 *       title:       "Track Name — Artist",
 *       description: "Track Name from Album.",
 *       image:       "/relative/or/https://absolute/url",
 *       imageAlt:    "Album — album art",
 *       paid:        false,
 *       hasAudio:    true
 *     },
 *     ...
 *   }
 *
 * image is stored as-is from the track record (may be relative).
 * share.js calls absoluteUrl() at serve time so the index stays valid
 * across deployments / domain changes.
 */

const fs = require('fs');
const path = require('path');
const { Readable, Writable } = require('stream');
const config = require('../dbConfig');

// ─── path helpers (mirrors legacyTracksStore.js) ──────────────────────────────

const normalizePath = (value) =>
  String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const getS3Endpoint = () =>
  process.env.S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : null);

const hasR2Config = () =>
  Boolean(
    getS3Endpoint() &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_BASE_URL,
  );

const hasFtpConfig = () =>
  Boolean(
    process.env.FTP_HOST && process.env.FTP_USER && process.env.FTP_PASSWORD,
  );

/** Same base dir as tracks.json on FTP/R2, file 'share-index.json'. */
const getRemoteIndexPath = () => {
  const base = normalizePath(process.env.FTP_BASE_PATH || 'uploads');
  const tracksPath = normalizePath(
    process.env.TRACKS_JSON_REMOTE_PATH || 'metadata/tracks.json',
  );
  const dir = path.posix.dirname(tracksPath);
  return [base, dir, 'share-index.json'].filter(Boolean).join('/');
};

const getFileIndexPath = () => {
  let tracksPath;
  if (process.env.TRACKS_JSON_PATH) {
    tracksPath = process.env.TRACKS_JSON_PATH;
  } else {
    tracksPath = path.join(config.storageRoot, 'metadata', 'tracks.json');
  }
  return path.join(path.dirname(tracksPath), 'share-index.json');
};

// ─── R2 ───────────────────────────────────────────────────────────────────────

const readFromR2 = async () => {
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: getS3Endpoint(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: getRemoteIndexPath(),
      }),
    );
    const chunks = [];
    for await (const chunk of response.Body) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (error) {
    if (
      error.name === 'NoSuchKey' ||
      error.$metadata?.httpStatusCode === 404
    )
      return {};
    throw error;
  }
};

const writeToR2 = async (index) => {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: getS3Endpoint(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const remotePath = getRemoteIndexPath();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: remotePath,
      Body: Buffer.from(JSON.stringify(index), 'utf8'),
      ContentType: 'application/json',
    }),
  );
  return { store: 'r2-json', path: remotePath };
};

// ─── FTP ──────────────────────────────────────────────────────────────────────

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
    const remotePath = getRemoteIndexPath();
    const chunks = [];
    const sink = new Writable({
      write(chunk, _enc, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    await client.downloadTo(sink, remotePath);
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (error) {
    if (error.code === 550 || /not found/i.test(error.message || ''))
      return {};
    throw error;
  } finally {
    client.close();
  }
};

const writeToFtp = async (index) => {
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
    const remotePath = getRemoteIndexPath();
    const remoteDir = path.posix.dirname(remotePath);
    await client.ensureDir(remoteDir);
    const payload = Buffer.from(JSON.stringify(index), 'utf8');
    await client.uploadFrom(
      Readable.from(payload),
      path.posix.basename(remotePath),
    );
    return { store: 'ftp-json', path: remotePath };
  } finally {
    client.close();
  }
};

// ─── File ─────────────────────────────────────────────────────────────────────

const readFromFile = async () => {
  try {
    const raw = await fs.promises.readFile(getFileIndexPath(), 'utf8');
    return JSON.parse(raw || '{}');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
};

const writeToFile = async (index) => {
  const filePath = getFileIndexPath();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(index));
  return { store: 'file-json', path: filePath };
};

// ─── Index builder ────────────────────────────────────────────────────────────

const DEFAULT_IMAGE = '/img/og_image.jpg';

function slugify(text) {
  return String(text || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

function buildEntry(track) {
  const audioSrc = track.mp3Url || track.audioUrl || null;
  const title = `${track.trackName}${track.artistName ? ` \u2014 ${track.artistName}` : ''}`;
  const description = track.albumName
    ? `${track.trackName} from ${track.albumName}.`
    : track.trackName;
  const image = track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE;
  const imageAlt = track.albumName
    ? `${track.albumName} \u2014 album art`
    : `${track.trackName} \u2014 album art`;
  return {
    title,
    description,
    image,
    imageAlt,
    paid: Boolean(track.paid),
    hasAudio: Boolean(audioSrc),
  };
}

function buildIndex(tracks) {
  const index = {};
  // Album groups — first published track wins for artwork/artist
  const albumGroups = {};

  for (const track of tracks) {
    if (track.published === false) continue;
    if (!track._id) continue;
    index[String(track._id)] = buildEntry(track);

    if (track.albumName) {
      const key = track.albumName;
      if (!albumGroups[key]) {
        albumGroups[key] = {
          albumName: track.albumName,
          albumId: track.albumId || slugify(track.albumName),
          artistName: track.artistName || null,
          image: track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE,
          imageAlt: track.artistName
            ? `${track.albumName} by ${track.artistName} \u2014 album art`
            : `${track.albumName} \u2014 album art`,
        };
      }
    }
  }

  // Album entries — keyed by "album:<albumId>" and "album:<albumNameSlug>"
  // so makeSharePage can do O(1) lookups without loading the full track list.
  for (const group of Object.values(albumGroups)) {
    const entry = { type: 'album', ...group };
    const idKey = `album:${group.albumId}`;
    const slugKey = `album:${slugify(group.albumName)}`;
    index[idKey] = entry;
    if (slugKey !== idKey) index[slugKey] = entry;
  }

  return index;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const preferredStore = () =>
  String(process.env.LEGACY_TRACK_STORE || 'auto').toLowerCase();

/**
 * Rebuild and persist the share index from the current track list.
 * Called by catalog.js after every saveTracks().
 * Errors are non-fatal — catalog operations must succeed regardless.
 */
const saveShareIndex = async (tracks) => {
  const index = buildIndex(tracks);
  const store = preferredStore();

  if (store === 'r2-json' || (store === 'auto' && hasR2Config()))
    return writeToR2(index);
  if (store === 'ftp-json' || (store === 'auto' && hasFtpConfig()))
    return writeToFtp(index);
  if (store === 'file-json' || store === 'auto') return writeToFile(index);
  throw new Error(`Unsupported store: ${store}`);
};

/**
 * Load the share index.  Returns {} if file does not exist yet.
 * In-memory caching is intentionally omitted here: share.js already
 * benefits from Netlify's function-instance warm cache via the 5-min
 * Cache-Control header it sets on responses.
 */
const loadShareIndex = async () => {
  const store = preferredStore();
  if (store === 'r2-json' || (store === 'auto' && hasR2Config()))
    return readFromR2();
  if (store === 'ftp-json' || (store === 'auto' && hasFtpConfig()))
    return readFromFtp();
  if (store === 'file-json' || store === 'auto') return readFromFile();
  return {};
};

module.exports = { loadShareIndex, saveShareIndex };
