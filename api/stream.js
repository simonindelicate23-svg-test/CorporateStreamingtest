const fs = require('fs');
const path = require('path');
const { getCollections } = require('./lib/db');
const config = require('./dbConfig');
const { json } = require('./lib/http');
const { getListenerIdentity } = require('./lib/auth');
const { hasEntitlementForTrack } = require('./lib/entitlements');

const buildRange = (rangeHeader, total) => {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return { start: 0, end: total - 1, partial: false };
  }

  const [startText, endText] = rangeHeader.replace('bytes=', '').split('-');
  const start = Number(startText);
  const end = endText ? Number(endText) : total - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= total || start > end) return null;
  return { start, end, partial: true };
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { message: 'Method not allowed' });

  const trackId = event.queryStringParameters?.trackId;
  if (!trackId) return json(400, { message: 'trackId is required' });

  const { tracks, assets } = await getCollections();
  const track = await tracks.findOne({ trackId });
  if (!track || !track.published) return json(404, { message: 'Track not found' });

  const identity = getListenerIdentity(event);
  const allowed = await hasEntitlementForTrack(identity, track);
  if (!allowed) return json(403, { message: 'Entitlement required' });

  const asset = await assets.findOne({ assetId: track.audioAssetId, kind: 'audio' });
  if (!asset) return json(404, { message: 'Audio asset missing' });

  const fullPath = path.join(config.storageRoot, asset.storage.diskPath);
  const stat = await fs.promises.stat(fullPath);
  const range = buildRange(event.headers?.range || event.headers?.Range, stat.size);
  if (!range) {
    return {
      statusCode: 416,
      headers: { 'Content-Range': `bytes */${stat.size}` },
      body: '',
    };
  }

  const fileBuffer = await fs.promises.readFile(fullPath);
  const chunk = fileBuffer.subarray(range.start, range.end + 1);
  const restricted = track.access?.mode !== 'public';

  return {
    statusCode: range.partial ? 206 : 200,
    isBase64Encoded: true,
    headers: {
      'Content-Type': asset.storage.mime || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunk.length),
      'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
      'Cache-Control': restricted ? 'private, no-store' : 'public, max-age=60',
    },
    body: chunk.toString('base64'),
  };
};
