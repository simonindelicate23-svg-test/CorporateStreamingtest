/**
 * /s/:trackId  — simple, reliable share page for a single track.
 *
 * Unlike makeSharePage, this endpoint:
 *  - Uses the raw track _id directly (no slug matching that can fail)
 *  - Returns 200 with site-level fallback when the track isn't found
 *  - Adds Cache-Control so CDN/crawlers don't hammer cold function starts
 *
 * URL format:  /s/TRACKID
 * history.replaceState and the share button both generate this URL.
 */

const { loadTracks } = require('./lib/legacyTracksStore');
const { loadSiteSettings } = require('./lib/siteSettingsStore');

const DEFAULT_IMAGE = '/img/og_image.jpg';
const FALLBACK_DESCRIPTION = 'Listen online via this self-hosted music player.';

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

function extractId(raw) {
  // Share URLs are /s/TRACKID — the ID is the whole segment.
  // Guard against /s/TRACKID-some-slug just in case.
  return raw ? String(raw).split('-')[0] : null;
}

function findTrack(tracks, rawId) {
  if (!rawId) return null;
  return tracks.find(t => {
    if (t.published === false) return false;
    const id = String(t._id || '');
    return id === rawId;
  }) || null;
}

function sharePageHtml({ origin, title, description, image, imageAlt, embedUrl, playerUrl, siteTitle }) {
  const twitterCard = embedUrl ? 'player' : 'summary_large_image';
  const canonicalUrl = playerUrl; // canonical points to the player, not this intermediate page

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
  <meta property="og:type" content="music.song" />
  <meta property="og:url" content="${canonicalUrl}" />
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
  <link rel="canonical" href="${canonicalUrl}" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #111; color: #eee;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 100vh;
      padding: 40px 24px; text-align: center; gap: 20px;
    }
    .cover { width: 200px; height: 200px; border-radius: 12px; object-fit: cover; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
    h1 { font-size: 22px; font-weight: 700; line-height: 1.3; max-width: 480px; }
    .sub { font-size: 15px; color: #aaa; max-width: 480px; }
    .listen { display: inline-block; padding: 12px 32px; background: #fff; color: #111; border-radius: 24px; text-decoration: none; font-weight: 600; font-size: 15px; margin-top: 4px; }
    .listen:hover { background: #e0e0e0; }
  </style>
</head>
<body>
  ${image ? `<img class="cover" src="${image}" alt="${imageAlt}" />` : ''}
  <h1>${title}</h1>
  <p class="sub">${description}</p>
  <a class="listen" href="${playerUrl}">Listen now</a>
  <script>window.location.replace('${playerUrl}');</script>
</body>
</html>`;
}

exports.handler = async event => {
  const origin = buildOrigin(event);

  // Path is /s/:trackId — extract the segment after /s/
  const segments = (event.path || '').split('/').filter(Boolean);
  const sIndex = segments.indexOf('s');
  const rawParam = (sIndex >= 0 && segments[sIndex + 1]) ? segments[sIndex + 1] : (event.queryStringParameters?.track || null);
  const rawId = extractId(rawParam);

  let track = null;
  let siteSettings = {};

  try {
    const [trackData, settings] = await Promise.all([
      loadTracks(),
      loadSiteSettings().catch(() => ({})),
    ]);
    siteSettings = settings;
    track = findTrack(trackData.tracks, rawId);
  } catch (err) {
    console.error('share: data load failed', err);
    // Fall through — return site-level OG tags rather than erroring
  }

  const siteTitle = siteSettings.siteTitle || siteSettings.brandName || 'Music Streaming Player';
  const playerUrl = track
    ? `${origin}/player.html?track=${encodeURIComponent(String(track._id))}`
    : `${origin}/player.html`;

  let title, description, image, imageAlt, embedUrl;

  if (track) {
    const audioSrc = track.mp3Url || track.audioUrl || null;
    title = `${track.trackName}${track.artistName ? ` \u2014 ${track.artistName}` : ''}`;
    description = track.albumName
      ? `${track.trackName} from ${track.albumName}.`
      : track.trackName;
    image = absoluteUrl(origin, track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE);
    imageAlt = track.albumName ? `${track.albumName} \u2014 album art` : `${track.trackName} \u2014 album art`;
    embedUrl = (!track.paid && audioSrc) ? `${origin}/embed/${String(track._id)}` : null;
  } else {
    title = siteTitle;
    description = siteSettings.shareDescription || FALLBACK_DESCRIPTION;
    image = absoluteUrl(origin, siteSettings.ogImage || DEFAULT_IMAGE);
    imageAlt = siteTitle;
    embedUrl = null;
  }

  const html = sharePageHtml({ origin, title, description, image, imageAlt, embedUrl, playerUrl, siteTitle });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      // Cache for 5 minutes at CDN; serve stale for up to 1 hour while refreshing.
      // This means a second crawler hit (e.g. link preview re-fetch) is instant.
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
    body: html,
  };
};
