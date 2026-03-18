/**
 * /s/:trackId  — share page for a single track.
 *
 * Strategy:
 *  1. Look up the track in the pre-generated share index (share-index.json).
 *     This file is written every time the admin saves/updates/deletes tracks
 *     so it is always current and loads in a single, tiny network call.
 *  2. Fall back to loading the full track catalogue if the index doesn't have
 *     the entry (handles tracks that existed before the index was introduced).
 *  3. Always return HTTP 200 with correct track-specific OG tags, or site-level
 *     fallback tags when the track truly cannot be found.
 *
 * Key correctness rules:
 *  - The track ID from generateTrackId() is ALWAYS hyphenated, e.g.
 *    "mmlxkca3-hvt5pym2".  We MUST NOT split on '-' — use the full rawParam
 *    as the ID.
 *  - og:url must point to THIS page (/s/:trackId), not to player.html.
 *    If og:url points elsewhere, Facebook/LinkedIn re-scrape that URL and
 *    use its generic tags instead.
 */

const { loadShareIndex } = require('./lib/shareIndexStore');
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

function sharePageHtml({ origin, rawId, title, description, image, imageAlt, imageWidth, imageHeight, embedUrl, playerUrl, siteTitle }) {
  const twitterCard = embedUrl ? 'player' : 'summary_large_image';
  const imageType = image
    ? (/\.png(\?|$)/i.test(image) ? 'image/png' : /\.webp(\?|$)/i.test(image) ? 'image/webp' : /\.gif(\?|$)/i.test(image) ? 'image/gif' : 'image/jpeg')
    : null;
  // og:url MUST be this page — pointing it at player.html causes Facebook/LinkedIn
  // to re-scrape player.html and use its generic tags, ignoring ours entirely.
  const canonicalUrl = rawId ? `${origin}/s/${rawId}` : origin;

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

  // Extract track ID from path /s/:trackId or ?track= query param.
  // IMPORTANT: do NOT split the ID on '-'.  generateTrackId() always produces
  // compound IDs like "mmlxkca3-hvt5pym2" — splitting destroys them.
  const segments = (event.path || '').split('/').filter(Boolean);
  const sIndex = segments.indexOf('s');
  const rawId = (sIndex >= 0 && segments[sIndex + 1])
    ? segments[sIndex + 1]
    : (event.queryStringParameters?.track || null);

  let entry = null;        // share index entry (fast path)
  let siteSettings = {};

  // ── Fast path: share index ──────────────────────────────────────────────────
  if (rawId) {
    try {
      const [index, settings] = await Promise.all([
        loadShareIndex(),
        loadSiteSettings().catch(() => ({})),
      ]);
      siteSettings = settings;
      entry = index[rawId] || null;
    } catch (err) {
      console.error('share: index load failed', err);
    }
  }

  // ── Slow fallback: full track catalogue ─────────────────────────────────────
  // Handles tracks uploaded before the share index existed.
  if (rawId && !entry) {
    try {
      const [trackData, settings] = await Promise.all([
        loadTracks(),
        Object.keys(siteSettings).length ? Promise.resolve(siteSettings) : loadSiteSettings().catch(() => ({})),
      ]);
      if (!Object.keys(siteSettings).length) siteSettings = settings;
      const track = trackData.tracks.find(t => {
        if (t.published === false) return false;
        return String(t._id || '') === rawId;
      });
      if (track) {
        const audioSrc = track.mp3Url || track.audioUrl || null;
        entry = {
          title: `${track.trackName}${track.artistName ? ` \u2014 ${track.artistName}` : ''}`,
          description: track.albumName
            ? `${track.trackName} from ${track.albumName}.`
            : track.trackName,
          image: track.albumArtworkUrl || track.artworkUrl || DEFAULT_IMAGE,
          imageAlt: track.albumName
            ? `${track.albumName} \u2014 album art`
            : `${track.trackName} \u2014 album art`,
          paid: Boolean(track.paid),
          hasAudio: Boolean(audioSrc),
        };
      }
    } catch (err) {
      console.error('share: track fallback load failed', err);
    }
  }

  // ── Build page ──────────────────────────────────────────────────────────────
  const siteTitle = siteSettings.siteTitle || siteSettings.brandName || 'Music Streaming Player';
  const playerUrl = rawId
    ? `${origin}/player.html?track=${encodeURIComponent(rawId)}`
    : `${origin}/player.html`;

  let title, description, image, imageAlt, embedUrl;

  let imageWidth, imageHeight;

  if (entry) {
    title       = entry.title;
    description = entry.description;
    image       = absoluteUrl(origin, entry.image);
    imageAlt    = entry.imageAlt;
    embedUrl    = (!entry.paid && entry.hasAudio) ? `${origin}/embed/${rawId}` : null;
    // Album art is square; default og_image is 1200×630
    const isDefault = entry.image === DEFAULT_IMAGE;
    imageWidth  = isDefault ? 1200 : 1000;
    imageHeight = isDefault ? 630 : 1000;
  } else {
    title       = siteTitle;
    description = siteSettings.shareDescription || FALLBACK_DESCRIPTION;
    image       = absoluteUrl(origin, siteSettings.ogImage || DEFAULT_IMAGE);
    imageAlt    = siteTitle;
    embedUrl    = null;
    imageWidth  = 1200;
    imageHeight = 630;
  }

  const html = sharePageHtml({ origin, rawId, title, description, image, imageAlt, imageWidth, imageHeight, embedUrl, playerUrl, siteTitle });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      // Cache for 5 minutes at CDN; serve stale for up to 1 hour while refreshing.
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
    body: html,
  };
};
