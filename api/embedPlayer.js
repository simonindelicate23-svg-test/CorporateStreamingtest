const { ObjectId } = require('mongodb');
const { loadTracks } = require('./lib/legacyTracksStore');

// Headers that allow Discord, Twitter, Slack etc. to iframe this page
const EMBED_HEADERS = {
  'Content-Type': 'text/html; charset=UTF-8',
  'X-Frame-Options': 'ALLOWALL',
  'Content-Security-Policy': "frame-ancestors *",
};

function extractTrackId(trackParam) {
  if (!trackParam) return null;
  return String(trackParam).split('-')[0];
}

function absoluteUrl(origin, url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function matchesTrackId(track, rawId) {
  if (!rawId) return false;
  const id = String(track?._id || '');
  if (id === rawId) return true;
  try {
    if (ObjectId.isValid(rawId) && ObjectId.isValid(id)) {
      return String(new ObjectId(id)) === String(new ObjectId(rawId));
    }
  } catch (_) {}
  return false;
}

function errorPage(message) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Player</title>
<style>body{background:#111;color:#aaa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:14px;}</style>
</head><body><p>${message}</p></body></html>`;
}

exports.handler = async event => {
  const protocol = event.headers?.['x-forwarded-proto'] || 'https';
  const host = event.headers?.host || event.headers?.['x-forwarded-host'] || 'localhost';
  const origin = `${protocol}://${host}`;

  const params = event.queryStringParameters || {};
  const trackParam = params.track;

  if (!trackParam) {
    return { statusCode: 400, headers: EMBED_HEADERS, body: errorPage('No track specified.') };
  }

  let tracks;
  try {
    ({ tracks } = await loadTracks());
  } catch (err) {
    console.error('embedPlayer: loadTracks failed', err);
    return { statusCode: 500, headers: EMBED_HEADERS, body: errorPage('Could not load track data.') };
  }

  const rawId = extractTrackId(trackParam);
  const track = tracks.find(t => t.published !== false && matchesTrackId(t, rawId));

  if (!track) {
    return { statusCode: 404, headers: EMBED_HEADERS, body: errorPage('Track not found.') };
  }

  const audioSrc = track.mp3Url || track.audioUrl || null;

  if (track.paid || !audioSrc) {
    return {
      statusCode: 403,
      headers: EMBED_HEADERS,
      body: errorPage('This track requires a subscription.'),
    };
  }

  const artworkUrl = absoluteUrl(origin, track.albumArtworkUrl || track.artworkUrl || '');
  const trackName = track.trackName || 'Unknown track';
  const artistName = track.artistName || '';
  const albumName = track.albumName || '';
  const playerUrl = `${origin}/player.html?track=${encodeURIComponent(track._id)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${trackName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1a1a1a;
      color: #eee;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      height: 100vh;
      overflow: hidden;
    }
    .art {
      width: 60px;
      height: 60px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
    }
    .art-placeholder {
      width: 60px;
      height: 60px;
      border-radius: 6px;
      background: #333;
      flex-shrink: 0;
    }
    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .track-name {
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      font-size: 11px;
      color: #999;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    audio {
      width: 100%;
      height: 28px;
      margin-top: 6px;
    }
    .open-link {
      display: block;
      font-size: 10px;
      color: #666;
      text-decoration: none;
      margin-top: 4px;
    }
    .open-link:hover { color: #aaa; }
  </style>
</head>
<body>
  ${artworkUrl
    ? `<img class="art" src="${artworkUrl}" alt="${albumName || trackName}" />`
    : `<div class="art-placeholder"></div>`}
  <div class="info">
    <div class="track-name">${trackName}</div>
    ${artistName || albumName ? `<div class="meta">${[artistName, albumName].filter(Boolean).join(' · ')}</div>` : ''}
    <audio controls src="${audioSrc}"></audio>
    <a class="open-link" href="${playerUrl}" target="_blank" rel="noopener noreferrer">Open full player ↗</a>
  </div>
</body>
</html>`;

  return { statusCode: 200, headers: EMBED_HEADERS, body: html };
};
