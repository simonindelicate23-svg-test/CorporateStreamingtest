const path = require('path');
const { Readable } = require('stream');
const ftp = require('basic-ftp');
const { isAdmin } = require('./lib/auth');

// ---------- image helpers ----------

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const MAX_IMAGE_DIMENSION = 1000;

function isImageFile(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

async function optimizeImage(buffer, filename) {
  try {
    const sharp = require('sharp');
    const ext = path.extname(String(filename || '')).toLowerCase();
    let pipeline = sharp(buffer).resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    if (ext === '.png') {
      pipeline = pipeline.png({ compressionLevel: 8 });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality: 85 });
    } else {
      // Default to JPEG for everything else (incl. .jpg, .jpeg, unknown)
      pipeline = pipeline.jpeg({ quality: 85, progressive: true });
    }
    return await pipeline.toBuffer();
  } catch (_err) {
    // If sharp fails for any reason (e.g. not an image despite extension), return original
    return buffer;
  }
}

// ---------- helpers ----------

const normalizeSegment = (value) =>
  String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const safeFilename = (name) => {
  const base = path.basename(String(name || 'upload.bin'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const redactHost = (host) => {
  if (!host) return '';
  const [first = '', ...rest] = String(host).split('.');
  if (!rest.length) return `${first.slice(0, 2)}***`;
  return `${first.slice(0, 2)}***.${rest.join('.')}`;
};

// ---------- in-process chunk store ----------
// Netlify Functions can reuse warm instances, so this works for sequential
// uploads from the same client. Each upload session gets a unique uploadId.
// Chunks are evicted after CHUNK_TTL_MS to avoid leaking memory on failures.

const CHUNK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const chunkStore = new Map(); // uploadId -> { chunks: Buffer[], lastSeen: number, meta }

function pruneExpired() {
  const now = Date.now();
  for (const [id, session] of chunkStore) {
    if (now - session.lastSeen > CHUNK_TTL_MS) chunkStore.delete(id);
  }
}

// ---------- storage helpers ----------

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

const hasFtpConfig = () => Boolean(
  process.env.FTP_HOST &&
  process.env.FTP_USER &&
  process.env.FTP_PASSWORD &&
  process.env.FTP_PUBLIC_BASE_URL
);

async function uploadBufferToR2(buffer, remotePath) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
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
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: remotePath,
    Body: buffer,
  }));
  return `${publicBaseUrl}/${remotePath}`;
}

async function uploadBufferToFtp(buffer, remotePath) {
  const ftpPublicBaseUrl = String(process.env.FTP_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const remoteDirectory = path.posix.dirname(remotePath);
  const remoteFileName = path.posix.basename(remotePath);
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: process.env.FTP_SECURE === 'true',
    });
    await client.ensureDir(remoteDirectory);
    await client.uploadFrom(Readable.from(buffer), remoteFileName);

    const uploadedSize = await client.size(remoteFileName);
    if (uploadedSize !== buffer.length) {
      throw new Error(
        `Size mismatch after upload (expected ${buffer.length}, got ${uploadedSize})`
      );
    }

    return `${ftpPublicBaseUrl}/${remotePath}`;
  } finally {
    client.close();
  }
}

async function uploadBuffer(buffer, remotePath) {
  if (hasR2Config()) return uploadBufferToR2(buffer, remotePath);
  if (hasFtpConfig()) return uploadBufferToFtp(buffer, remotePath);
  throw new Error(
    'No storage backend configured. Set R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME/R2_PUBLIC_BASE_URL for R2, or FTP_HOST/FTP_USER/FTP_PASSWORD/FTP_PUBLIC_BASE_URL for FTP.'
  );
}

// ---------- handler ----------

exports.handler = async (event) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'Method not allowed', requestId });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { message: 'Invalid JSON body', requestId });
  }

  if (!isAdmin(event)) {
    return json(401, { message: 'Unauthorized — provide a valid admin token', requestId });
  }

  const {
    fileName,
    folder = 'misc',
    contentBase64,      // non-chunked (small files / legacy)
    // chunked fields:
    uploadId,           // unique ID for this upload session
    chunkIndex,         // 0-based
    totalChunks,        // total number of chunks
    chunkBase64,        // base64 payload for this chunk
  } = body;

  const safeName = safeFilename(fileName);
  const safeFolder = normalizeSegment(folder) || 'misc';
  const basePath = normalizeSegment(process.env.FTP_BASE_PATH || 'uploads');

  // ---- presign path (client uploads directly to R2, bypassing Netlify) ----
  if (body.action === 'presign') {
    if (!hasR2Config()) {
      return json(400, { message: 'Presigned uploads require R2 storage to be configured', requestId });
    }
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
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
    const stamp = Date.now();
    const remotePath = [basePath, safeFolder, `${stamp}-${safeName}`].filter(Boolean).join('/');
    const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: remotePath });
    const presignedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
    return json(200, { presignedUrl, publicUrl: `${publicBaseUrl}/${remotePath}`, requestId });
  }

  // ---- non-chunked path (file was small enough to send whole) ----
  if (contentBase64 !== undefined) {
    if (!safeName || !contentBase64) {
      return json(400, { message: 'fileName and contentBase64 are required', requestId });
    }
    let buffer = Buffer.from(contentBase64, 'base64');
    if (!buffer.length) return json(400, { message: 'Decoded file is empty', requestId });

    if (isImageFile(safeName)) {
      buffer = await optimizeImage(buffer, safeName);
    }

    const stamp = Date.now();
    const remotePath = [basePath, safeFolder, `${stamp}-${safeName}`]
      .filter(Boolean).join('/');

    try {
      const publicUrl = await uploadBuffer(buffer, remotePath);
      return json(200, { message: 'Upload complete', url: publicUrl, bytes: buffer.length, requestId });
    } catch (err) {
      console.error('Upload failed', { requestId, error: err.message });
      return json(500, { message: 'Upload failed', detail: err.message, requestId });
    }
  }

  // ---- chunked path ----
  if (!uploadId || chunkIndex === undefined || totalChunks === undefined || !chunkBase64) {
    return json(400, {
      message: 'For chunked uploads supply: uploadId, chunkIndex, totalChunks, chunkBase64',
      requestId,
    });
  }

  pruneExpired();

  const chunkBuffer = Buffer.from(chunkBase64, 'base64');

  if (!chunkStore.has(uploadId)) {
    // First chunk — initialise session
    chunkStore.set(uploadId, {
      chunks: new Array(totalChunks).fill(null),
      lastSeen: Date.now(),
      meta: { safeName, safeFolder, totalChunks },
    });
  }

  const session = chunkStore.get(uploadId);
  session.chunks[chunkIndex] = chunkBuffer;
  session.lastSeen = Date.now();

  const received = session.chunks.filter(Boolean).length;
  const isComplete = received === totalChunks;

  if (!isComplete) {
    // Acknowledge receipt and ask for more
    return json(200, {
      message: 'Chunk received',
      chunkIndex,
      received,
      totalChunks,
      requestId,
    });
  }

  // All chunks in — assemble and upload
  chunkStore.delete(uploadId);
  let assembled = Buffer.concat(session.chunks);

  if (isImageFile(safeName)) {
    assembled = await optimizeImage(assembled, safeName);
  }

  const stamp = Date.now();
  const remotePath = [basePath, safeFolder, `${stamp}-${safeName}`]
    .filter(Boolean).join('/');

  try {
    const publicUrl = await uploadBuffer(assembled, remotePath);
    return json(200, {
      message: 'Upload complete',
      url: publicUrl,
      bytes: assembled.length,
      requestId,
    });
  } catch (err) {
    console.error('Chunked upload failed at storage stage', { requestId, error: err.message });
    return json(500, { message: 'Upload failed', detail: err.message, requestId });
  }
};