const path = require('path');
const { Readable } = require('stream');
const ftp = require('basic-ftp');

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

// ---------- FTP upload ----------

async function uploadBufferToFtp(buffer, remotePath) {
  const ftpHost = process.env.FTP_HOST;
  const ftpUser = process.env.FTP_USER;
  const ftpPassword = process.env.FTP_PASSWORD;
  const ftpPublicBaseUrl = String(process.env.FTP_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

  if (!ftpHost || !ftpUser || !ftpPassword || !ftpPublicBaseUrl) {
    throw new Error(
      'Upload not configured. Set FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_PUBLIC_BASE_URL.'
    );
  }

  const remoteDirectory = path.posix.dirname(remotePath);
  const remoteFileName = path.posix.basename(remotePath);
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: ftpHost,
      user: ftpUser,
      password: ftpPassword,
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

  // PIN check
  const requiredPin = process.env.ADMIN_PIN || '1310';
  if ((body.pinCode || '') !== requiredPin) {
    return json(401, { message: 'Invalid PIN code', requestId });
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
  const ftpBasePath = normalizeSegment(process.env.FTP_BASE_PATH || 'uploads');

  // ---- non-chunked path (file was small enough to send whole) ----
  if (contentBase64 !== undefined) {
    if (!safeName || !contentBase64) {
      return json(400, { message: 'fileName and contentBase64 are required', requestId });
    }
    const buffer = Buffer.from(contentBase64, 'base64');
    if (!buffer.length) return json(400, { message: 'Decoded file is empty', requestId });

    const stamp = Date.now();
    const remotePath = [ftpBasePath, safeFolder, `${stamp}-${safeName}`]
      .filter(Boolean).join('/');

    try {
      const publicUrl = await uploadBufferToFtp(buffer, remotePath);
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
  const assembled = Buffer.concat(session.chunks);

  const stamp = Date.now();
  const remotePath = [ftpBasePath, safeFolder, `${stamp}-${safeName}`]
    .filter(Boolean).join('/');

  try {
    const publicUrl = await uploadBufferToFtp(assembled, remotePath);
    return json(200, {
      message: 'Upload complete',
      url: publicUrl,
      bytes: assembled.length,
      requestId,
    });
  } catch (err) {
    console.error('Chunked upload failed at FTP stage', { requestId, error: err.message });
    return json(500, { message: 'Upload failed', detail: err.message, requestId });
  }
};