/**
 * Stores subscriber records (email → subscriptionId) in the same
 * FTP / R2 / local-file backend used by all other persistent data.
 *
 * Format: JSON array of { email, subscriptionId, payerId, status, lastVerified, cancelledAt }
 * Stored at: metadata/subscriptions.json (relative to FTP_BASE_PATH / R2 bucket / STORAGE_ROOT)
 */
const fs = require('fs');
const path = require('path');
const { Readable, Writable } = require('stream');
const config = require('../dbConfig');

const normalizePath = (v) => String(v || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const getS3Endpoint = () =>
  process.env.S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);

const hasR2Config = () => Boolean(
  getS3Endpoint() &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME &&
  process.env.R2_PUBLIC_BASE_URL
);
const hasFtpConfig = () => Boolean(process.env.FTP_HOST && process.env.FTP_USER && process.env.FTP_PASSWORD);

const getRemotePath = () => {
  const base = normalizePath(process.env.FTP_BASE_PATH || 'uploads');
  return [base, 'metadata/subscriptions.json'].filter(Boolean).join('/');
};
const getFilePath = () => path.join(config.storageRoot, 'metadata', 'subscriptions.json');

// ── FTP ──────────────────────────────────────────────────────────
async function readFtp() {
  const { Client } = require('basic-ftp');
  const client = new Client();
  try {
    await client.access({
      host: process.env.FTP_HOST, user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD, secure: process.env.FTP_SECURE === 'true',
    });
    const chunks = [];
    const sink = new Writable({ write(c, _, cb) { chunks.push(Buffer.from(c)); cb(); } });
    await client.downloadTo(sink, getRemotePath());
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (e.code === 550 || /not found/i.test(e.message || '')) return [];
    throw e;
  } finally { client.close(); }
}

async function writeFtp(records) {
  const { Client } = require('basic-ftp');
  const client = new Client();
  try {
    await client.access({
      host: process.env.FTP_HOST, user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD, secure: process.env.FTP_SECURE === 'true',
    });
    const remote = getRemotePath();
    await client.ensureDir(path.posix.dirname(remote));
    const payload = Buffer.from(JSON.stringify(records, null, 2), 'utf8');
    await client.uploadFrom(Readable.from(payload), path.posix.basename(remote));
  } finally { client.close(); }
}

// ── R2 / S3 ───────────────────────────────────────────────────────
function makeS3Client() {
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: getS3Endpoint(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

async function readR2() {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  try {
    const res = await makeS3Client().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME, Key: getRemotePath(),
    }));
    const chunks = [];
    for await (const c of res.Body) chunks.push(c);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return [];
    throw e;
  }
}

async function writeR2(records) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await makeS3Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: getRemotePath(),
    Body: Buffer.from(JSON.stringify(records, null, 2), 'utf8'),
    ContentType: 'application/json',
  }));
}

// ── Local file ────────────────────────────────────────────────────
async function readFile() {
  try {
    const raw = await fs.promises.readFile(getFilePath(), 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeFile(records) {
  const p = getFilePath();
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, JSON.stringify(records, null, 2));
}

// ── Public API ────────────────────────────────────────────────────
async function loadSubscriptions() {
  if (hasR2Config()) return readR2();
  if (hasFtpConfig()) return readFtp();
  return readFile();
}

async function saveSubscriptions(records) {
  if (hasR2Config()) return writeR2(records);
  if (hasFtpConfig()) return writeFtp(records);
  return writeFile(records);
}

/** Upsert by subscriptionId. */
async function upsertSubscription(record) {
  const all = await loadSubscriptions();
  const idx = all.findIndex(r => r.subscriptionId === record.subscriptionId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...record };
  } else {
    all.push(record);
  }
  await saveSubscriptions(all);
}

/** Find by email (case-insensitive). Returns first active match or null. */
async function findByEmail(email) {
  const all = await loadSubscriptions();
  const norm = email.toLowerCase();
  return all.find(r => r.email === norm && r.status !== 'CANCELLED') || null;
}

/** Find by subscriptionId. Returns record or null. */
async function findBySubscriptionId(subscriptionId) {
  const all = await loadSubscriptions();
  return all.find(r => r.subscriptionId === subscriptionId) || null;
}

/** Remove all records for an email (for testing). */
async function removeByEmail(email) {
  const norm = email.toLowerCase();
  const all = await loadSubscriptions();
  const filtered = all.filter(r => r.email !== norm);
  await saveSubscriptions(filtered);
  return all.length - filtered.length;
}

module.exports = { loadSubscriptions, upsertSubscription, findByEmail, findBySubscriptionId, removeByEmail };
