const { ObjectId } = require('mongodb');
const { loadTracks } = require('./lib/legacyTracksStore');
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

  return {
    title: track.albumName,
    description: track.artistName ? `${track.albumName} by ${track.artistName}.` : `${track.albumName}.`,
    image: absoluteUrl(origin, track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE),
    imageAlt: track.artistName ? `${track.albumName} by ${track.artistName} — album art` : `${track.albumName} — album art`,
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

  return {
    title: `${track.trackName}${track.artistName ? ` — ${track.artistName}` : ''}`,
    description: track.albumName ? `${track.trackName} from ${track.albumName}.` : track.trackName,
    image: absoluteUrl(origin, track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE),
    imageAlt: track.albumName ? `${track.albumName} — album art` : `${track.trackName} — album art`,
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
  const { trackParam, albumParam } = extractRequestParams(event);

  try {
    const [trackData, siteSettings] = await Promise.all([loadTracks(), loadSiteSettings().catch(() => ({}))]);
    const { tracks } = trackData;

    const track = fetchTrack(tracks, trackParam);
    const albumTrack = track ? null : fetchAlbumLeadTrack(tracks, albumParam);

    const meta =
      buildTrackMeta(track, origin, albumParam) ||
      buildAlbumMeta(albumTrack, origin, albumParam) || {
        title: siteSettings.siteTitle || siteSettings.brandName || 'Music Streaming Player',
        description: siteSettings.shareDescription || FALLBACK_DESCRIPTION,
        image: absoluteUrl(origin, siteSettings.ogImage || DEFAULT_IMAGE),
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
