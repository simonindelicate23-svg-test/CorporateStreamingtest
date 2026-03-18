const { ObjectId } = require('mongodb');
const { loadTracks } = require('./lib/legacyTracksStore');
const { loadShareIndex } = require('./lib/shareIndexStore');
const { loadSiteSettings } = require('./lib/siteSettingsStore');

const FALLBACK_DESCRIPTION = 'Listen online via this self-hosted music player.';
// og_image.jpg is a proper-sized image; the 64px icon is too small for social cards
const DEFAULT_IMAGE = '/img/og_image.jpg';

function slugify(text = '') {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePathSegments(pathname = '') {
  return pathname
    .split('/')
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment));
}

function extractRequestParams(event) {
  const params = event.queryStringParameters || {};
  let trackParam = params.track;
  let albumParam = params.album;

  const segments = normalizePathSegments(event.path || '');

  const albumIndex = segments.indexOf('album');
  if (albumIndex >= 0 && segments[albumIndex + 1]) albumParam = segments[albumIndex + 1];

  const trackIndex = segments.indexOf('track');
  if (trackIndex >= 0 && segments[trackIndex + 1]) trackParam = segments[trackIndex + 1];

  return { trackParam, albumParam };
}

function extractTrackId(trackParam) {
  if (!trackParam) return null;
  return String(trackParam).split('-')[0];
}

function buildOrigin(event) {
  const protocol = event.headers?.['x-forwarded-proto'] || 'https';
  const host = event.headers?.host || event.headers?.['x-forwarded-host'] || 'localhost';
  return `${protocol}://${host}`;
}

function absoluteUrl(origin, url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function buildShareHtml(meta = {}, redirectUrl, siteSettings = {}) {
  const siteTitle = siteSettings.siteTitle || siteSettings.brandName || 'Music Streaming Player';
  const title = meta.title || siteTitle;
  const description = meta.description || siteSettings.shareDescription || FALLBACK_DESCRIPTION;
  const image = meta.image;
  const imageAlt = meta.imageAlt || title;
  const imageWidth = meta.imageWidth || null;
  const imageHeight = meta.imageHeight || null;
  // Provide og:image:type so Discord (and others) don't need to probe the URL
  const imageType = image
    ? (/\.png(\?|$)/i.test(image) ? 'image/png' : /\.webp(\?|$)/i.test(image) ? 'image/webp' : /\.gif(\?|$)/i.test(image) ? 'image/gif' : 'image/jpeg')
    : null;
  const canonical = meta.url;
  const type = meta.type || 'website';
  const embedUrl = meta.embedUrl || null;
  // Use Twitter player card when we have an embeddable player; otherwise large image card
  const twitterCard = embedUrl ? 'player' : 'summary_large_image';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:site_name" content="${siteTitle}" />
    <meta property="og:type" content="${type}" />
    ${canonical ? `<meta property="og:url" content="${canonical}" />` : ''}
    ${image ? `<meta property="og:image" content="${image}" />` : ''}
    ${image ? `<meta property="og:image:secure_url" content="${image}" />` : ''}
    ${image ? `<meta property="og:image:type" content="${imageType}" />` : ''}
    ${imageWidth ? `<meta property="og:image:width" content="${imageWidth}" />` : ''}
    ${imageHeight ? `<meta property="og:image:height" content="${imageHeight}" />` : ''}
    ${image ? `<meta property="og:image:alt" content="${imageAlt}" />` : ''}
    ${embedUrl ? `<meta property="og:video" content="${embedUrl}" />` : ''}
    ${embedUrl ? `<meta property="og:video:type" content="text/html" />` : ''}
    ${embedUrl ? `<meta property="og:video:width" content="480" />` : ''}
    ${embedUrl ? `<meta property="og:video:height" content="152" />` : ''}
    <meta name="twitter:card" content="${twitterCard}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${image ? `<meta name="twitter:image" content="${image}" />` : ''}
    ${image ? `<meta name="twitter:image:alt" content="${imageAlt}" />` : ''}
    ${embedUrl ? `<meta name="twitter:player" content="${embedUrl}" />` : ''}
    ${embedUrl ? `<meta name="twitter:player:width" content="480" />` : ''}
    ${embedUrl ? `<meta name="twitter:player:height" content="152" />` : ''}
    ${canonical ? `<link rel="canonical" href="${canonical}" />` : ''}
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: #111;
        color: #eee;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 40px 24px;
        text-align: center;
        gap: 20px;
      }
      .cover {
        width: 200px;
        height: 200px;
        border-radius: 12px;
        object-fit: cover;
        box-shadow: 0 8px 40px rgba(0,0,0,.6);
      }
      h1 { font-size: 22px; font-weight: 700; line-height: 1.3; max-width: 480px; }
      .sub { font-size: 15px; color: #aaa; max-width: 480px; }
      .listen {
        display: inline-block;
        padding: 12px 32px;
        background: #fff;
        color: #111;
        border-radius: 24px;
        text-decoration: none;
        font-weight: 600;
        font-size: 15px;
        margin-top: 4px;
      }
      .listen:hover { background: #e0e0e0; }
    </style>
  </head>
  <body>
    ${image ? `<img class="cover" src="${image}" alt="${imageAlt}" />` : ''}
    <h1>${title}</h1>
    <p class="sub">${description}</p>
    ${redirectUrl ? `<a class="listen" href="${redirectUrl}">Listen now</a>` : ''}
    ${redirectUrl ? `<script>window.location.replace('${redirectUrl}');</script>` : ''}
  </body>
</html>`;
}

function buildRedirect(origin, params = {}) {
  const url = new URL('/player.html', origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
}

function buildSlugPath(origin, track, albumParam) {
  const albumSegment = albumParam || slugify(track?.albumName || '');

  if (track?.trackName) {
    const trackSlug = slugify(track.trackName);
    const trackSegment = trackSlug ? `${track._id}-${trackSlug}` : track._id;
    if (albumSegment) return `${origin}/album/${albumSegment}/track/${trackSegment}`;
    return `${origin}/track/${trackSegment}`;
  }

  if (albumSegment) return `${origin}/album/${albumSegment}`;
  return `${origin}/`;
}

function buildAlbumMeta(track = {}, origin, albumParam) {
  if (!track.albumName) return null;
  const canonicalAlbumSlug = slugify(track.albumName);
  const redirectUrl = buildRedirect(origin, { album: canonicalAlbumSlug });
  const rawImage = track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE;
  const isDefault = rawImage === DEFAULT_IMAGE;

  return {
    title: track.albumName,
    description: track.artistName ? `${track.albumName} by ${track.artistName}.` : `${track.albumName}.`,
    image: absoluteUrl(origin, rawImage),
    imageAlt: track.artistName ? `${track.albumName} by ${track.artistName} — album art` : `${track.albumName} — album art`,
    // Default og_image.jpg is 1200×630; album art is always square
    imageWidth: isDefault ? 1200 : 1000,
    imageHeight: isDefault ? 630 : 1000,
    type: 'music.album',
    url: buildSlugPath(origin, null, albumParam || canonicalAlbumSlug),
    redirectUrl,
  };
}

function buildTrackMeta(track = {}, origin, albumParam) {
  if (!track.trackName) return null;
  const canonicalAlbumSlug = slugify(track.albumName || albumParam || '');
  const redirectUrl = buildRedirect(origin, {
    track: track._id,
    album: canonicalAlbumSlug,
  });

  // Only expose embed player for free tracks that have an audio URL
  const audioSrc = track.mp3Url || track.audioUrl || null;
  const embedUrl = (!track.paid && audioSrc) ? `${origin}/embed/${track._id}` : null;

  const rawImage = track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE;
  const isDefault = rawImage === DEFAULT_IMAGE;

  return {
    title: `${track.trackName}${track.artistName ? ` — ${track.artistName}` : ''}`,
    description: track.albumName ? `${track.trackName} from ${track.albumName}.` : track.trackName,
    image: absoluteUrl(origin, rawImage),
    imageAlt: track.albumName ? `${track.albumName} — album art` : `${track.trackName} — album art`,
    imageWidth: isDefault ? 1200 : 1000,
    imageHeight: isDefault ? 630 : 1000,
    type: 'music.song',
    url: buildSlugPath(origin, track, albumParam || canonicalAlbumSlug),
    redirectUrl,
    embedUrl,
  };
}

function isPublishedTrack(track) {
  return track?.published !== false;
}

function matchesTrackId(track, trackParam) {
  if (!trackParam) return false;
  const id = String(track?._id || '');
  const param = String(trackParam);

  // Build candidates to try, in order of specificity:
  // 1. Exact match (e.g. ?track= query param passes the raw ID)
  // 2. Two-part compound ID: generated IDs are always "base36ts-base36rand".
  //    URL path segments append a slug: "base36ts-base36rand-slug-words",
  //    so take the first two hyphen-separated parts.
  // 3. Single-part ID (legacy MongoDB ObjectIds have no hyphens; slug-appended
  //    form is "objectid-slug-words" so parts[0] is the ID).
  const parts = param.split('-');
  const candidates = new Set([
    param,
    parts.length >= 2 ? `${parts[0]}-${parts[1]}` : null,
    parts[0],
  ].filter(Boolean));

  for (const rawId of candidates) {
    if (id === rawId) return true;
    try {
      if (ObjectId.isValid(rawId) && ObjectId.isValid(id)) {
        if (String(new ObjectId(id)) === String(new ObjectId(rawId))) return true;
      }
    } catch (_) {}
  }
  return false;
}

function matchesTrackSlug(track, trackParam) {
  const slug = slugify(trackParam);
  if (!slug) return false;
  const trackSlug = slugify(track?.trackName || track?.trackSlug || '');
  return trackSlug === slug;
}

function fetchTrack(tracks, trackParam) {
  if (!trackParam) return null;
  return tracks.find(track => isPublishedTrack(track) && (matchesTrackId(track, trackParam) || matchesTrackSlug(track, trackParam))) || null;
}

function matchesAlbum(track, albumParam) {
  const albumSlug = slugify(albumParam);
  const albumName = String(track?.albumName || '');
  const albumId = String(track?.albumId || '');
  const nameSlug = slugify(albumName);
  const idSlug = slugify(albumId);
  const exactAlbumParam = String(albumParam || '').toLowerCase();

  return (
    idSlug === albumSlug ||
    nameSlug === albumSlug ||
    albumId.toLowerCase() === exactAlbumParam ||
    albumName.toLowerCase() === exactAlbumParam ||
    new RegExp(`^${escapeRegExp(String(albumParam || ''))}$`, 'i').test(albumName)
  );
}

function fetchAlbumLeadTrack(tracks, albumParam) {
  if (!albumParam) return null;
  return tracks
    .filter(track => isPublishedTrack(track) && matchesAlbum(track, albumParam))
    .sort((a, b) => (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0))[0] || null;
}

// Pseudo-albums are virtual collections (curated playlists, "all tracks", etc.)
// defined in siteSettings.pseudoAlbums. They have no real albumName in the track
// store, so fetchAlbumLeadTrack always misses them. Match them by albumId slug or
// albumName slug instead.
function findPseudoAlbum(siteSettings, albumParam) {
  const entries = Array.isArray(siteSettings?.pseudoAlbums) ? siteSettings.pseudoAlbums : [];
  const albumSlug = slugify(albumParam);
  const lower = String(albumParam).toLowerCase();
  for (const entry of entries) {
    if (entry.enabled === false) continue;
    const id = entry.albumId || slugify(entry.albumName || '');
    if (
      slugify(id) === albumSlug ||
      slugify(entry.albumName || '') === albumSlug ||
      String(id).toLowerCase() === lower
    ) return entry;
  }
  return null;
}

function buildPseudoAlbumMeta(entry, tracks, origin, albumParam) {
  const albumName = entry.albumName || albumParam;
  const rawImage = entry.albumArtworkUrl || entry.artworkUrl || DEFAULT_IMAGE;
  const isDefault = rawImage === DEFAULT_IMAGE;
  const albumId = entry.albumId || slugify(albumName);

  // For pseudo-albums with explicit trackIds, find any lead track for artist name
  const trackIds = Array.isArray(entry.trackIds) ? entry.trackIds.map(String) : [];
  const leadTrack = trackIds.length
    ? tracks.find(t => isPublishedTrack(t) && trackIds.includes(String(t._id)))
    : null;

  const artistName = leadTrack?.artistName || entry.artistName || null;

  return {
    title: albumName,
    description: artistName ? `${albumName} by ${artistName}.` : `${albumName}.`,
    image: absoluteUrl(origin, rawImage),
    imageAlt: artistName ? `${albumName} by ${artistName} — album art` : `${albumName} — album art`,
    imageWidth: isDefault ? 1200 : 1000,
    imageHeight: isDefault ? 630 : 1000,
    type: 'music.album',
    url: buildSlugPath(origin, null, albumParam),
    redirectUrl: buildRedirect(origin, { album: albumId }),
  };
}

exports.handler = async event => {
  const origin = buildOrigin(event);
  const { trackParam, albumParam } = extractRequestParams(event);

  try {
    const [trackData, shareIndex, siteSettings] = await Promise.all([
      loadTracks().catch(() => ({ tracks: [] })),
      loadShareIndex().catch(() => ({})),
      loadSiteSettings().catch(() => ({})),
    ]);
    const tracks = trackData?.tracks || [];

    const track = fetchTrack(tracks, trackParam);
    const albumTrack = track ? null : fetchAlbumLeadTrack(tracks, albumParam);

    // Share index album lookup — O(1), uses the same proven source as share.js.
    // Falls back to the loadTracks()-based search above for real albums, and to
    // siteSettings.pseudoAlbums for virtual collections.
    const albumIndexEntry = (!track && !albumTrack && albumParam)
      ? (shareIndex[`album:${albumParam}`] || shareIndex[`album:${slugify(albumParam)}`] || null)
      : null;
    const pseudoEntry = (!track && !albumTrack && !albumIndexEntry && albumParam)
      ? findPseudoAlbum(siteSettings, albumParam)
      : null;

    if (albumParam && !trackParam && !albumTrack && !albumIndexEntry && !pseudoEntry) {
      const albumNames = [...new Set(tracks.slice(0, 5).map(t => t.albumName).filter(Boolean))];
      console.warn(`makeSharePage: no album matched albumParam="${albumParam}". Track store size=${tracks.length}. First album names: ${JSON.stringify(albumNames)}`);
    }

    const siteTitle = siteSettings.siteTitle || siteSettings.brandName || 'Music Streaming Player';

    // Build album meta from share index entry (avoids loadTracks() dependency)
    const albumIndexMeta = albumIndexEntry ? (() => {
      const rawImage = albumIndexEntry.image || DEFAULT_IMAGE;
      const isDefault = rawImage === DEFAULT_IMAGE;
      return {
        title: albumIndexEntry.albumName,
        description: albumIndexEntry.artistName
          ? `${albumIndexEntry.albumName} by ${albumIndexEntry.artistName}.`
          : `${albumIndexEntry.albumName}.`,
        image: absoluteUrl(origin, rawImage),
        imageAlt: albumIndexEntry.imageAlt || albumIndexEntry.albumName,
        imageWidth: isDefault ? 1200 : 1000,
        imageHeight: isDefault ? 630 : 1000,
        type: 'music.album',
        url: buildSlugPath(origin, null, albumParam),
        redirectUrl: buildRedirect(origin, { album: albumIndexEntry.albumId || albumParam }),
      };
    })() : null;

    const meta =
      buildTrackMeta(track, origin, albumParam) ||
      buildAlbumMeta(albumTrack, origin, albumParam) ||
      albumIndexMeta ||
      (pseudoEntry ? buildPseudoAlbumMeta(pseudoEntry, tracks, origin, albumParam) : null) || {
        title: siteTitle,
        description: siteSettings.shareDescription || FALLBACK_DESCRIPTION,
        image: absoluteUrl(origin, siteSettings.ogImage || DEFAULT_IMAGE),
        imageWidth: 1200,
        imageHeight: 630,
        url: buildSlugPath(origin, track || albumTrack, albumParam),
        redirectUrl: buildRedirect(origin, { track: trackParam, album: albumParam }),
      };

    const html = buildShareHtml(meta, meta.redirectUrl || meta.url, siteSettings);

    // Always return 200 — platforms (Discord, Twitter, Slack) will not render
    // an embed for any non-200 response, even when the HTML contains valid OG tags.
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      body: html,
    };
  } catch (error) {
    console.error('Unable to generate share page', error);
    const fallbackUrl = buildRedirect(origin, { track: trackParam, album: albumParam });
    const html = buildShareHtml({ title: 'Music Streaming Player', description: FALLBACK_DESCRIPTION }, fallbackUrl, {});
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      body: html,
    };
  }
};
