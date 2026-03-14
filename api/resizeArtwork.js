/**
 * resizeArtwork — download an image from a public URL, resize it with Sharp,
 * and re-upload it to the FTP server.
 *
 * POST body:
 *   { artworkUrl: string, maxDimension?: number }
 *
 * Response:
 *   { url, originalBytes, newBytes, width, height }
 */

const path = require('path');
const { Readable } = require('stream');
const https = require('https');
const http = require('http');
const ftp = require('basic-ftp');
const { isAdmin } = require('./lib/auth');

const MAX_DIMENSION_DEFAULT = 1000;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const normalizeSegment = (value) =>
  String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

// Download a URL into a Buffer (follows up to 3 redirects)
function fetchBuffer(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        req.destroy();
        return resolve(fetchBuffer(res.headers.location, redirectsLeft - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} fetching artwork`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout fetching artwork')); });
  });
}

async function resizeBuffer(buffer, filename, maxDimension) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (loadErr) {
    throw new Error(
      'Image processing module (sharp) is not available in this deployment. ' +
      'Ensure the Netlify function is deployed with node_bundler = "zisi" in netlify.toml, ' +
      'or run: npm install --os=linux --cpu=x64 sharp'
    );
  }
  const ext = path.extname(String(filename || '')).toLowerCase();

  const meta = await sharp(buffer).metadata();
  const originalWidth = meta.width || 0;
  const originalHeight = meta.height || 0;

  // Don't enlarge — only resize if above maxDimension
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { buffer, width: originalWidth, height: originalHeight, skipped: true };
  }

  let pipeline = sharp(buffer).resize(maxDimension, maxDimension, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (ext === '.png') {
    pipeline = pipeline.png({ compressionLevel: 8 });
  } else if (ext === '.webp') {
    pipeline = pipeline.webp({ quality: 85 });
  } else {
    pipeline = pipeline.jpeg({ quality: 85, progressive: true });
  }

  const resized = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: resized.data,
    width: resized.info.width,
    height: resized.info.height,
    skipped: false,
  };
}

const hasR2Config = () => Boolean(
  process.env.R2_ACCOUNT_ID &&
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
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
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
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: process.env.FTP_SECURE === 'true',
    });
    const remoteDir = path.posix.dirname(remotePath);
    const remoteFile = path.posix.basename(remotePath);
    await client.ensureDir(remoteDir);
    await client.uploadFrom(Readable.from(buffer), remoteFile);
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'Method not allowed' });
  }

  if (!isAdmin(event)) {
    return json(401, { message: 'Unauthorized' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { message: 'Invalid JSON body' });
  }

  const { artworkUrl, maxDimension = MAX_DIMENSION_DEFAULT } = body;

  if (!artworkUrl || typeof artworkUrl !== 'string') {
    return json(400, { message: 'artworkUrl is required' });
  }

  // Validate the URL is plausibly an image
  let parsedUrl;
  try {
    parsedUrl = new URL(artworkUrl);
  } catch {
    return json(400, { message: 'artworkUrl is not a valid URL' });
  }

  const ext = path.extname(parsedUrl.pathname).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext) && ext !== '') {
    return json(400, { message: `Unsupported image extension: ${ext}` });
  }

  // Download
  let originalBuffer;
  try {
    originalBuffer = await fetchBuffer(artworkUrl);
  } catch (err) {
    return json(502, { message: `Could not download artwork: ${err.message}` });
  }

  const originalBytes = originalBuffer.length;

  // Resize
  let resizeResult;
  try {
    resizeResult = await resizeBuffer(originalBuffer, parsedUrl.pathname, Number(maxDimension) || MAX_DIMENSION_DEFAULT);
  } catch (err) {
    return json(500, { message: `Resize failed: ${err.message}` });
  }

  if (resizeResult.skipped) {
    return json(200, {
      skipped: true,
      message: `Image is already within ${maxDimension}px — no resize needed.`,
      url: artworkUrl,
      originalBytes,
      newBytes: originalBytes,
      width: resizeResult.width,
      height: resizeResult.height,
    });
  }

  // Upload to storage backend (R2 → FTP priority)
  const basePath = normalizeSegment(process.env.FTP_BASE_PATH || 'uploads');
  const safeName = path.basename(parsedUrl.pathname).replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = Date.now();
  const remotePath = [basePath, 'artwork', `${stamp}-resized-${safeName}`].filter(Boolean).join('/');

  let newUrl;
  try {
    newUrl = await uploadBuffer(resizeResult.buffer, remotePath);
  } catch (err) {
    return json(500, { message: `Storage upload failed: ${err.message}` });
  }

  return json(200, {
    skipped: false,
    message: 'Artwork resized and uploaded.',
    url: newUrl,
    originalBytes,
    newBytes: resizeResult.buffer.length,
    width: resizeResult.width,
    height: resizeResult.height,
  });
};
