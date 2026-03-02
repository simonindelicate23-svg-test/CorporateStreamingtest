const { ObjectId } = require('mongodb');
const { loadTracks } = require('./lib/legacyTracksStore');

const DEFAULT_DESCRIPTION = 'Listen to Simon Indelicate online.';
const DEFAULT_IMAGE = '/img/icons8-music-album-64.png';

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

function buildShareHtml(meta = {}, redirectUrl) {
  const title = meta.title || 'Simon Indelicate';
  const description = meta.description || DEFAULT_DESCRIPTION;
  const image = meta.image;
  const canonical = meta.url;
  const type = meta.type || 'website';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:site_name" content="Simon Indelicate" />
    <meta property="og:type" content="${type}" />
    ${canonical ? `<meta property="og:url" content="${canonical}" />` : ''}
    ${image ? `<meta property="og:image" content="${image}" />` : ''}
    ${image ? `<meta property="og:image:secure_url" content="${image}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${image ? `<meta name="twitter:image" content="${image}" />` : ''}
    ${canonical ? `<link rel="canonical" href="${canonical}" />` : ''}
  </head>
  <body>
    <p>Redirecting you to the player…</p>
    ${redirectUrl ? `<a href="${redirectUrl}">Continue to the player</a>` : ''}
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

  return {
    title: track.albumName,
    description: track.artistName ? `${track.albumName} by ${track.artistName}.` : `${track.albumName}.`,
    image: absoluteUrl(origin, track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE),
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

  return {
    title: `${track.trackName}${track.artistName ? ` — ${track.artistName}` : ''}`,
    description: track.albumName ? `${track.trackName} from ${track.albumName}.` : track.trackName,
    image: absoluteUrl(origin, track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE),
    type: 'music.song',
    url: buildSlugPath(origin, track, albumParam || canonicalAlbumSlug),
    redirectUrl,
  };
}

function isPublishedTrack(track) {
  return track?.published !== false;
}

function matchesTrackId(track, trackParam) {
  const rawId = extractTrackId(trackParam);
  if (!rawId) return false;
  const id = String(track?._id || '');
  if (id === rawId) return true;
  if (ObjectId.isValid(rawId) && ObjectId.isValid(id)) return String(new ObjectId(id)) === String(new ObjectId(rawId));
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

exports.handler = async event => {
  const origin = buildOrigin(event);
  const requestUrl = event.rawUrl || buildRedirect(origin);
  const { trackParam, albumParam } = extractRequestParams(event);

  try {
    const { tracks } = await loadTracks();

    const track = fetchTrack(tracks, trackParam);
    const albumTrack = track ? null : fetchAlbumLeadTrack(tracks, albumParam);

    const meta =
      buildTrackMeta(track, origin, albumParam) ||
      buildAlbumMeta(albumTrack, origin, albumParam) || {
        title: 'Simon Indelicate',
        description: DEFAULT_DESCRIPTION,
        image: absoluteUrl(origin, DEFAULT_IMAGE),
        url: buildSlugPath(origin, track || albumTrack, albumParam),
        redirectUrl: buildRedirect(origin, { track: trackParam, album: albumParam }),
      };

    const html = buildShareHtml(meta, meta.redirectUrl || meta.url);

    return {
      statusCode: track || albumTrack ? 200 : 404,
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      body: html,
    };
  } catch (error) {
    console.error('Unable to generate share page', error);
    const fallbackUrl = buildRedirect(origin, { track: trackParam, album: albumParam });
    const html = buildShareHtml({ title: 'Simon Indelicate', description: DEFAULT_DESCRIPTION }, fallbackUrl, requestUrl);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      body: html,
    };
  }
};
