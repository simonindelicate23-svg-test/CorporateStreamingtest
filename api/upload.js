const fs = require('fs');
const path = require('path');
const { getCollections } = require('./lib/db');
const config = require('./dbConfig');
const { newAssetId, newTrackId } = require('./lib/ids');
const { parseId3v2 } = require('./lib/id3');
const { isAdmin } = require('./lib/auth');
const { readJsonBody, json } = require('./lib/http');

const safeExt = (filename) => path.extname(filename || '').replace(/[^a-zA-Z0-9.]/g, '').toLowerCase() || '.bin';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { message: 'Method not allowed' });
  if (!isAdmin(event)) return json(401, { message: 'Unauthorized' });

  const payload = readJsonBody(event);
  const { releaseId, artistId, filename, contentBase64, title, trackNumber } = payload;

  if (!releaseId || !artistId || !filename || !contentBase64) {
    return json(400, { message: 'releaseId, artistId, filename, and contentBase64 are required' });
  }

  const sourceBuffer = Buffer.from(contentBase64, 'base64');
  const tagData = parseId3v2(sourceBuffer);

  const { tracks, assets } = await getCollections();
  const trackId = newTrackId();
  const assetId = newAssetId();
  const extension = safeExt(filename);

  const relativeDiskPath = path.join('artists', artistId, 'releases', releaseId, 'tracks', trackId, `source${extension}`);
  const absoluteDiskPath = path.join(config.storageRoot, relativeDiskPath);

  await fs.promises.mkdir(path.dirname(absoluteDiskPath), { recursive: true });
  await fs.promises.writeFile(absoluteDiskPath, sourceBuffer);

  const normalizedTrackNumber = Number(trackNumber || tagData.trackNumber || '0') || 0;
  const computedTitle = title || tagData.title || filename.replace(path.extname(filename), '');

  await assets.insertOne({
    assetId,
    ownerType: 'track',
    ownerId: trackId,
    kind: 'audio',
    storage: {
      diskPath: relativeDiskPath,
      publicPath: null,
      mime: 'audio/mpeg',
      bytes: sourceBuffer.length,
    },
    rawTagPayload: tagData,
    createdAt: new Date(),
  });

  await tracks.insertOne({
    trackId,
    releaseId,
    artistId,
    title: computedTitle,
    slug: computedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    trackNumber: normalizedTrackNumber,
    metadata: {
      genre: tagData.genre || '',
      year: Number(tagData.year) || null,
    },
    audioAssetId: assetId,
    access: { mode: 'public', productIds: [] },
    published: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return json(200, {
    message: 'Upload complete',
    track: {
      trackId,
      title: computedTitle,
      trackNumber: normalizedTrackNumber,
      prefill: tagData,
    },
    asset: { assetId, diskPath: relativeDiskPath },
  });
};
