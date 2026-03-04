const { isAdmin } = require('./lib/auth');

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const AUDIO_EXTS = /\.(mp3|flac|m4a|ogg|wav|aac|opus)$/i;
const IMAGE_EXTS = /\.(jpe?g|png|webp|gif)$/i;

// Preferred artwork filenames, in priority order
const ARTWORK_NAMES = ['cover', 'artwork', 'folder', 'front', 'album', 'art', 'thumb', 'thumbnail'];

function parseLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const linkRe = /href=["']([^"']+)["']/gi;
  const seen = new Set();
  const links = [];
  let match;

  while ((match = linkRe.exec(html)) !== null) {
    const href = match[1];
    // Skip parent dir, query strings, fragments, mailto, etc.
    if (!href || href.startsWith('?') || href.startsWith('#') || href.includes('://') && !href.startsWith('http')) continue;
    if (href === '../' || href === './' || href.endsWith('/..') || href.includes('/../')) continue;
    // Skip links that resolve outside the folder (parent navigation)
    try {
      const resolved = new URL(href, base).href;
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      links.push(resolved);
    } catch (_) { /* skip malformed */ }
  }
  return links;
}

function pickBestArtwork(imageFiles) {
  if (!imageFiles.length) return null;
  // Prefer known cover art filenames
  for (const name of ARTWORK_NAMES) {
    const match = imageFiles.find(f => {
      const stem = f.filename.replace(/\.[^.]+$/, '').toLowerCase();
      return stem === name;
    });
    if (match) return match;
  }
  // Fall back to first image
  return imageFiles[0];
}

exports.handler = async (event) => {
  if (!isAdmin(event)) return json(401, { message: 'Unauthorized' });

  const url = (event.queryStringParameters || {}).url;
  if (!url) return json(400, { message: 'url parameter is required' });

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_) {
    return json(400, { message: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return json(400, { message: 'Only http/https URLs are supported' });
  }

  let html;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MusicAdmin/1.0; folder-scanner)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return json(502, { message: `Folder fetch failed: HTTP ${res.status}` });
    html = await res.text();
  } catch (err) {
    return json(502, { message: 'Could not fetch folder listing', detail: err.message });
  }

  const allLinks = parseLinks(html, url);

  const audioFiles = allLinks
    .filter(l => AUDIO_EXTS.test(l.split('?')[0]))
    .map(l => ({ url: l, filename: decodeURIComponent(l.split('/').pop().split('?')[0]) }))
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

  const imageFiles = allLinks
    .filter(l => IMAGE_EXTS.test(l.split('?')[0]))
    .map(l => ({ url: l, filename: decodeURIComponent(l.split('/').pop().split('?')[0]) }));

  const suggestedArtwork = pickBestArtwork(imageFiles);

  return json(200, {
    audioFiles,
    imageFiles,
    suggestedArtwork,
    total: audioFiles.length,
  });
};
