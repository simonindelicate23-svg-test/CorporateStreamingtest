/**
 * POST /.netlify/functions/importCatalogue
 *
 * Admin-only. Imports a track catalogue from another instance into this one.
 *
 * The source instance must have:
 *   - "Expose catalogue API" (discoveryOptIn) enabled
 *   - "Allow catalogue importing" (catalogueImportEnabled) enabled
 *
 * Files are fetched from the source's public URLs and streamed directly into
 * this instance's R2/Backblaze bucket. No local disk I/O is performed.
 * This instance must have R2 configured.
 *
 * Actions:
 *   preview  – fetch source catalogue, return what would be imported vs skipped
 *   import   – transfer files and write the full catalogue to this instance
 *
 * Duplicate detection: tracks whose _id already exists in the destination are
 * skipped. Re-running an import is always safe.
 */

const { loadTracks, saveTracks, withTrackIds } = require('./lib/legacyTracksStore');
const { isAdmin } = require('./lib/auth');

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

// ── R2 helpers ─────────────────────────────────────────────────────────────

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

// Fetch a remote URL and return its contents as a Buffer.
// The data passes through memory only — no local files are written.
async function fetchToBuffer(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function uploadToR2(buffer, key, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await makeS3Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}

// ── Path helpers ───────────────────────────────────────────────────────────

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function extFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const ext = p.split('.').pop().toLowerCase();
    return ext && ext.length <= 5 ? `.${ext}` : '.mp3';
  } catch {
    return '.mp3';
  }
}

// Stable key for release artwork so multiple tracks in the same release share
// a single upload.
function releaseArtworkKey(release) {
  return `imports/artwork/${slugify(release.artist)}-${slugify(release.title)}-cover.jpg`;
}

// ── Core import logic ──────────────────────────────────────────────────────

// requireImportEnabled: true for file-transfer import, false for metadata-only link
async function fetchSourceFeed(sourceUrl, { requireImportEnabled = true } = {}) {
  let origin;
  try {
    origin = new URL(sourceUrl).origin;
  } catch {
    throw Object.assign(new Error('Invalid sourceUrl — must be a valid http/https URL'), { status: 400 });
  }

  const catalogueUrl = `${origin}/catalogue`;
  let response;
  try {
    // no-cache ensures we bypass any CDN/proxy and get a fresh response,
    // which is critical when the source just enabled catalogueImportEnabled.
    response = await fetch(catalogueUrl, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
  } catch (err) {
    throw Object.assign(
      new Error(`Could not reach ${catalogueUrl}: ${err.message}`),
      { status: 502 }
    );
  }

  if (response.status === 403) {
    throw Object.assign(
      new Error('Source catalogue is private. The source site admin must enable "Expose catalogue API" in Site Settings.'),
      { status: 400 }
    );
  }
  if (!response.ok) {
    throw Object.assign(
      new Error(`Source catalogue returned HTTP ${response.status}`),
      { status: 502 }
    );
  }

  const feed = await response.json();

  if (requireImportEnabled && !feed.importEnabled) {
    throw Object.assign(
      new Error(
        'Source catalogue does not have import mode enabled. ' +
        'The source site admin must enable "Allow catalogue importing" under Site Settings → Catalogue API.'
      ),
      { status: 400 }
    );
  }

  return feed;
}

// Flatten feed releases → individual track objects each carrying their release.
function flattenFeedTracks(feed) {
  const flat = [];
  for (const release of feed.releases || []) {
    for (const track of release.tracks || []) {
      flat.push({ ...track, _release: release });
    }
  }
  return flat;
}

// ── Handler ────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, '');
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!isAdmin(event)) return json(401, { error: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const isFileTransferAction = body.action === 'import' || body.action === 'preview';
  if (isFileTransferAction && !hasR2Config()) {
    return json(400, {
      error: 'R2 (or an S3-compatible bucket) must be configured on this instance to use catalogue import.',
      hint: 'Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL.',
    });
  }

  const { action, sourceUrl, position } = body;
  if (!action || !sourceUrl) return json(400, { error: 'action and sourceUrl are required' });
  if (!['preview', 'import', 'link-preview', 'link'].includes(action)) {
    return json(400, { error: 'action must be "preview", "import", "link-preview", or "link"' });
  }

  // link actions only need discoveryOptIn on the source, not importEnabled
  const isLinkAction = action === 'link' || action === 'link-preview';

  // ── Fetch + validate source ──────────────────────────────────────────────
  let sourceFeed;
  try {
    sourceFeed = await fetchSourceFeed(sourceUrl, { requireImportEnabled: !isLinkAction });
  } catch (err) {
    return json(err.status || 500, { error: err.message });
  }

  const sourceTracks = flattenFeedTracks(sourceFeed);

  // ── Load destination tracks ──────────────────────────────────────────────
  const { tracks: existingTracks } = await loadTracks();
  const existingIds = new Set((existingTracks || []).map((t) => String(t._id || t.id || '')));

  const newTracks = sourceTracks.filter((t) => !existingIds.has(String(t.id)));
  const duplicateTracks = sourceTracks.filter((t) => existingIds.has(String(t.id)));

  // ── Link preview ─────────────────────────────────────────────────────────
  // For link actions, gated tracks have no audioUrl in the public feed, so
  // we surface that count separately so the admin knows what they'll get.
  if (action === 'link-preview') {
    const gatedCount = newTracks.filter((t) => t.gated && !t.audioUrl).length;
    return json(200, {
      sourceInstance: sourceFeed.instance,
      totalTracksInSource: sourceTracks.length,
      tracksToLink: newTracks.length,
      gatedTracksWithoutAudio: gatedCount,
      duplicatesSkipped: duplicateTracks.length,
      releases: (sourceFeed.releases || []).map((r) => ({
        title: r.title,
        artist: r.artist,
        trackCount: r.tracks?.length || 0,
        newTracks: (r.tracks || []).filter((t) => !existingIds.has(String(t.id))).length,
        artworkUrl: r.artworkUrl || null,
      })),
    });
  }

  // ── Link ─────────────────────────────────────────────────────────────────
  // Includes track metadata with original audioUrls (no file transfer).
  // position: 'before' | 'after' | 'mix' controls where linked tracks are
  // inserted relative to existing tracks in the array.
  if (action === 'link') {
    const linkPosition = ['before', 'after', 'mix'].includes(position) ? position : 'after';
    const linked = [];
    const linkSkipped = duplicateTracks.map((t) => ({ id: t.id, title: t.title, reason: 'duplicate' }));

    for (const sourceTrack of newTracks) {
      const release = sourceTrack._release;
      const audioUrl = sourceTrack.audioUrl || null; // public feed — gated tracks have no audioUrl

      const record = {
        _id: String(sourceTrack.id),
        albumName: release.title || '',
        albumId: release.id || '',
        albumArtworkUrl: release.artworkUrl || '',
        artistName: release.artist || '',
        trackName: sourceTrack.title || '',
        mp3Url: audioUrl || '',
        artworkUrl: sourceTrack.artworkUrl || release.artworkUrl || '',
        published: true,
        fav: false,
        paid: sourceTrack.gated === true,
        _linkedFrom: new URL(sourceUrl).origin,
        createdAt: new Date().toISOString(),
      };

      if (sourceTrack.trackNumber != null) record.trackNumber = sourceTrack.trackNumber;
      if (sourceTrack.durationSeconds) { record.durationSeconds = sourceTrack.durationSeconds; record.duration = sourceTrack.durationSeconds; }
      if (sourceTrack.genre) record.genre = sourceTrack.genre;
      if (sourceTrack.year) record.year = sourceTrack.year;
      if (sourceTrack.description) record.trackText = sourceTrack.description;
      if (sourceTrack.medium) record.trackMedium = sourceTrack.medium;

      linked.push(record);
    }

    if (linked.length > 0) {
      const { tracks: fresh } = await loadTracks();
      const existing = fresh || [];
      let combined;
      if (linkPosition === 'before') combined = [...linked, ...existing];
      else if (linkPosition === 'after') combined = [...existing, ...linked];
      else combined = [...existing, ...linked]; // 'mix' — player sorts alphabetically
      const { tracks: withIds } = withTrackIds(combined);
      await saveTracks(withIds);
    }

    return json(200, {
      linked: linked.length,
      skipped: linkSkipped.length,
      gatedWithoutAudio: linked.filter((t) => t.paid && !t.mp3Url).length,
      position: linkPosition,
      linkedTracks: linked.map((t) => ({
        id: t._id,
        title: t.trackName,
        album: t.albumName,
        hasAudio: Boolean(t.mp3Url),
      })),
      skippedTracks: linkSkipped,
    });
  }

  // ── Preview ──────────────────────────────────────────────────────────────
  if (action === 'preview') {
    return json(200, {
      sourceInstance: sourceFeed.instance,
      totalTracksInSource: sourceTracks.length,
      tracksToImport: newTracks.length,
      duplicatesSkipped: duplicateTracks.length,
      releases: (sourceFeed.releases || []).map((r) => ({
        title: r.title,
        artist: r.artist,
        trackCount: r.tracks?.length || 0,
        newTracks: (r.tracks || []).filter((t) => !existingIds.has(String(t.id))).length,
        artworkUrl: r.artworkUrl || null,
      })),
    });
  }

  // ── Import ───────────────────────────────────────────────────────────────
  // Upload each release's artwork once, keyed by a stable path.
  const uploadedArtwork = new Map(); // artworkUrl → new R2 URL

  async function transferArtwork(artworkUrl) {
    if (!artworkUrl) return null;
    if (uploadedArtwork.has(artworkUrl)) return uploadedArtwork.get(artworkUrl);
    try {
      const buf = await fetchToBuffer(artworkUrl);
      const ext = extFromUrl(artworkUrl);
      const key = `imports/artwork/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}${ext}`;
      const newUrl = await uploadToR2(buf, key, 'image/jpeg');
      uploadedArtwork.set(artworkUrl, newUrl);
      return newUrl;
    } catch (err) {
      console.error('artwork transfer failed', artworkUrl, err.message);
      uploadedArtwork.set(artworkUrl, artworkUrl); // fall back to source URL
      return artworkUrl;
    }
  }

  const imported = [];
  const failed = [];
  const skipped = duplicateTracks.map((t) => ({ id: t.id, title: t.title, reason: 'duplicate' }));

  for (const sourceTrack of newTracks) {
    const release = sourceTrack._release;
    const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      // ── Audio: fetch source URL → stream into R2 (no local disk) ──────────
      let mp3Url = sourceTrack.importAudioUrl || null;
      if (mp3Url) {
        const audioExt = extFromUrl(mp3Url);
        const audioKey = `imports/audio/${slugify(release.artist)}/${slugify(release.title)}/${uid}-${slugify(sourceTrack.title)}${audioExt}`;
        const audioBuf = await fetchToBuffer(mp3Url);
        mp3Url = await uploadToR2(audioBuf, audioKey, 'audio/mpeg');
      }

      // ── Artwork ────────────────────────────────────────────────────────────
      const releaseArtSrc = release.artworkUrl || null;
      const trackArtSrc = sourceTrack.artworkUrl || null;

      const newReleaseArtwork = await transferArtwork(releaseArtSrc);
      const newTrackArtwork = trackArtSrc && trackArtSrc !== releaseArtSrc
        ? await transferArtwork(trackArtSrc)
        : newReleaseArtwork;

      // ── Build destination track record ─────────────────────────────────────
      const record = {
        _id: String(sourceTrack.id),
        albumName: release.title || '',
        albumId: release.id || '',
        albumArtworkUrl: newReleaseArtwork || '',
        artistName: release.artist || '',
        trackName: sourceTrack.title || '',
        mp3Url: mp3Url || '',
        artworkUrl: newTrackArtwork || newReleaseArtwork || '',
        published: true,
        fav: false,
        paid: sourceTrack.gated === true,
        createdAt: new Date().toISOString(),
      };

      if (sourceTrack.trackNumber != null) record.trackNumber = sourceTrack.trackNumber;
      if (sourceTrack.durationSeconds) { record.durationSeconds = sourceTrack.durationSeconds; record.duration = sourceTrack.durationSeconds; }
      if (sourceTrack.genre) record.genre = sourceTrack.genre;
      if (sourceTrack.year) record.year = sourceTrack.year;
      if (sourceTrack.description) record.trackText = sourceTrack.description;
      if (sourceTrack.medium) record.trackMedium = sourceTrack.medium;

      imported.push(record);
    } catch (err) {
      console.error('track import failed', sourceTrack.id, err.message);
      failed.push({ id: sourceTrack.id, title: sourceTrack.title, error: err.message });
    }
  }

  // ── Write full updated catalogue ───────────────────────────────────────
  if (imported.length > 0) {
    const { tracks: fresh } = await loadTracks(); // re-load in case of concurrent edits
    const combined = [...(fresh || []), ...imported];
    const { tracks: withIds } = withTrackIds(combined);
    await saveTracks(withIds);
  }

  return json(200, {
    imported: imported.length,
    skipped: skipped.length,
    failed: failed.length,
    importedTracks: imported.map((t) => ({ id: t._id, title: t.trackName, album: t.albumName })),
    skippedTracks: skipped,
    failedTracks: failed,
  });
};
