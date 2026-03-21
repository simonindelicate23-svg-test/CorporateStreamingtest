/**
 * GET /.netlify/functions/catalogue  (also reachable at /catalogue via netlify.toml redirect)
 *
 * Public catalogue feed — the RSS equivalent for this ecosystem.
 *
 * An aggregator adds a site's feed URL to its list, polls it periodically,
 * and builds a unified multi-catalogue view from many independent instances.
 * No central database needed on either side.
 *
 * Schema version: 1
 * CORS: open (any aggregator can fetch this from a browser)
 * Auth: none — public read. Gated tracks are listed but audioUrl is omitted.
 * Opt-in: returns 403 unless DISCOVERY_OPT_IN=true in env.
 */

const { loadTracks } = require('./lib/legacyTracksStore');
const { loadSiteSettings } = require('./lib/siteSettingsStore');
const config = require('./dbConfig');

const FEED_VERSION = '1';

const json = (statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    ...extraHeaders,
  },
  body: JSON.stringify(payload),
});

function slugify(value = '') {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildFeed(tracks, settings, feedUrl, importEnabled) {
  const byRelease = new Map();

  for (const track of tracks) {
    if (track.published === false) continue;

    const key = `${track.artistName || ''}::${track.albumName || ''}`;

    if (!byRelease.has(key)) {
      byRelease.set(key, {
        id: track.albumId || slugify(`${track.artistName || ''} ${track.albumName || ''}`),
        title: track.albumName || '',
        artist: track.artistName || '',
        artworkUrl: track.albumArtworkUrl || track.artworkUrl || undefined,
        genre: track.genre || undefined,
        year: track.year || undefined,
        tracks: [],
      });
    }

    const release = byRelease.get(key);

    const t = {
      id: String(track._id || track.id || ''),
      title: track.trackName || '',
      trackNumber: track.trackNumber || undefined,
      durationSeconds: track.durationSeconds || track.duration || undefined,
      // Gated tracks: expose metadata but not the audio URL
      audioUrl: track.paid ? undefined : (track.mp3Url || undefined),
      gated: track.paid ? true : undefined,
      // importAudioUrl is only set when the admin has explicitly enabled catalogue importing.
      // It exposes the raw mp3Url for all tracks (including gated) so another instance can
      // transfer the files directly to its own storage during a catalogue migration.
      importAudioUrl: importEnabled ? (track.mp3Url || undefined) : undefined,
      artworkUrl: track.artworkUrl && track.artworkUrl !== release.artworkUrl
        ? track.artworkUrl
        : undefined,
      genre: track.genre || undefined,
      year: track.year || undefined,
      description: track.trackText || undefined,
      medium: track.trackMedium || undefined,
    };

    // Drop undefined fields cleanly
    release.tracks.push(Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)));
  }

  const releases = Array.from(byRelease.values());

  for (const release of releases) {
    release.tracks.sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
    release.trackCount = release.tracks.length;
    // Drop undefined fields on the release object itself
    for (const k of Object.keys(release)) {
      if (release[k] === undefined) delete release[k];
    }
  }

  // Most recent year first; ties broken alphabetically by artist then title
  releases.sort((a, b) => {
    if (a.year && b.year && a.year !== b.year) return b.year - a.year;
    return (a.artist || '').localeCompare(b.artist || '') || (a.title || '').localeCompare(b.title || '');
  });

  return {
    feedVersion: FEED_VERSION,
    generatedAt: new Date().toISOString(),
    importEnabled: importEnabled || undefined,
    instance: {
      name: settings.siteTitle || settings.brandName || undefined,
      description: settings.metaDescription || undefined,
      url: config.appBaseUrl,
      feedUrl,
      logoUrl: settings.logoUrl || undefined,
    },
    releaseCount: releases.length,
    releases,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, '');
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const feedUrl = `${config.appBaseUrl}/.netlify/functions/catalogue`;
    const [{ tracks }, settings] = await Promise.all([
      loadTracks(),
      loadSiteSettings().catch(() => ({})),
    ]);

    // siteSettings.discoveryOptIn takes precedence; fall back to env var
    const optedIn = typeof settings.discoveryOptIn === 'boolean'
      ? settings.discoveryOptIn
      : config.discoveryOptIn;

    if (!optedIn) {
      return json(403, {
        error: 'This catalogue is private.',
        hint: 'The site owner can enable discovery in Site Settings → Catalogue API.',
      });
    }

    const importEnabled = settings.catalogueImportEnabled === true;
    const feed = buildFeed(tracks || [], settings, feedUrl, importEnabled);

    // When import mode is active, audio URLs are present in the response.
    // Don't let a CDN cache a response that contains them.
    const cacheHeader = importEnabled
      ? 'private, no-store'
      : 'public, max-age=300, stale-while-revalidate=60';
    return json(200, feed, { 'Cache-Control': cacheHeader });
  } catch (error) {
    console.error('catalogue feed error', error);
    return json(500, { error: 'Failed to generate catalogue feed' });
  }
};
