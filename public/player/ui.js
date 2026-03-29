import { state } from './state.js';
import { loadLibrary } from './api.js';
import { playerConfig } from './config.js';

const dom = {
  albumGallery: document.getElementById('albumGallery'),
  albumDetail: document.getElementById('albumDetail'),
  albumGalleryGrid: document.getElementById('albumGalleryGrid'),
  albumHeading: document.getElementById('albumHeading'),
  albumGalleryTitle: document.getElementById('albumGalleryTitle'),
  albumGallerySubtitle: document.getElementById('albumGallerySubtitle'),
  tracksList: document.getElementById('tracksList'),
  brandHome: document.getElementById('brandHome'),
  brandMark: document.getElementById('brandMark'),
  brandWord: document.getElementById('brandWord'),
  refreshButton: document.getElementById('refreshButton'),
  trackListToggle: document.getElementById('trackListToggle'),
  trackListContainer: document.querySelector('.track-list-container'),
  backToAlbums: document.getElementById('backToAlbums'),
  playButton: document.getElementById('play-button'),
  nextButton: document.getElementById('next-button'),
  prevButton: document.getElementById('prev-button'),
  shuffleButton: document.getElementById('shuffle-button'),
  repeatButton: document.getElementById('repeat-button'),
  volumeSlider: document.getElementById('volume-slider'),
  seekBar: document.getElementById('seek-bar'),
  currentTime: document.getElementById('current-time'),
  duration: document.getElementById('duration'),
  nowPlayingPane: document.getElementById('playerPane'),
  trackTitle: document.querySelector('.track-title'),
  trackArtist: document.querySelector('.track-artist'),
  trackAlbum: document.querySelector('.album-title'),
  artwork: document.querySelector('.track-artwork'),
  nowPlayingBar: document.getElementById('now-playing'),
  npArt: document.querySelector('.np-art'),
  npTitle: document.querySelector('.np-title'),
  npArtist: document.querySelector('.np-artist'),
  npPlay: document.getElementById('np-play'),
  npPrev: document.getElementById('np-prev'),
  npNext: document.getElementById('np-next'),
  npShuffle: document.getElementById('np-shuffle'),
  npRepeat: document.getElementById('np-repeat'),
  npShare: document.getElementById('np-share'),
  trackOverlay: document.getElementById('track-overlay'),
  overlayArt: document.querySelector('.overlay-art'),
  overlayTitle: document.querySelector('.overlay-title'),
  overlayArtist: document.querySelector('.overlay-artist'),
  overlayAlbum: document.querySelector('.overlay-album'),
  overlayPlay: document.getElementById('overlay-play'),
  overlayPrev: document.getElementById('overlay-prev'),
  overlayNext: document.getElementById('overlay-next'),
  overlayShare: document.getElementById('overlay-share'),
  overlayShuffle: document.getElementById('overlay-shuffle'),
  overlayRepeat: document.getElementById('overlay-repeat'),
  overlayClose: document.getElementById('close-overlay'),
  overlaySeekBar: document.getElementById('overlay-seek-bar'),
  overlayCurrentTime: document.getElementById('overlay-current-time'),
  overlayDuration: document.getElementById('overlay-duration'),
  expandTrack: document.getElementById('expand-track'),
  filterArtist: document.getElementById('filter-artist'),
  filterYear: document.getElementById('filter-year'),
  filterGenre: document.getElementById('filter-genre'),
  filterSearch: document.getElementById('filter-search'),
  albumGalleryGridContainer: document.getElementById('albumGalleryGrid'),
  navAlbums: document.getElementById('navAlbums'),
  navNowPlaying: document.getElementById('navNowPlaying'),
  tipJarLink: document.getElementById('tipJarLink'),
  themeToggle: document.getElementById('themeToggle'),
  albumDetailCover: document.getElementById('albumDetailCover'),
  copyLinkButton: document.getElementById('copy-link-button'),
  albumLength: document.getElementById('albumLength'),
  verseText: document.querySelector('.verse-text'),
  trackMedium: document.querySelector('.track-medium'),
  welcomeHero: document.getElementById('welcomeHero'),
  welcomeHeroTitle: document.getElementById('welcomeHeroTitle'),
  welcomeHeroCopy: document.getElementById('welcomeHeroCopy'),
  welcomeHeroCta: document.getElementById('welcomeHeroCta'),
  welcomeHeroCover: document.getElementById('welcomeHeroCover'),
  aboutSiteLink: document.getElementById('aboutSiteLink')
};

let eventsBound = false;
let artworkEventsBound = false;
const paletteCache = new Map();
const artworkPreloadCache = new Map();
const audioPreloadCache = new Map();
// Cache the resolved (post-redirect) MP3 URL for each stream URL so that
// subsequent plays bypass the Netlify function redirect round-trip entirely.
const resolvedUrlCache = new Map();
// Dedicated Audio element kept hot with the next track so the transition is
// near-instant even when the page is backgrounded (screen off, tab hidden).
let nextTrackAudio = null;
let nextTrackAudioUrl = null;
// Screen Wake Lock handle — held while audio is actively playing to discourage
// the browser from throttling JavaScript execution on mobile.
let wakeLock = null;
// Whether the user intends playback to be active (survives brief OS-level pauses
// between tracks so we can resume after mobile background suspension).
let userWantsToPlay = false;
// Safety-net timer: fires slightly after the expected track end and triggers the
// next-track transition if the native `ended` event was silently swallowed by a
// mobile browser while the page was backgrounded.
let trackEndWatchdogTimer = null;
const INITIAL_BACKGROUND = playerConfig?.initialBackgroundColor || '#f7f5f0';
let SITE_BACKGROUND_COLOR = INITIAL_BACKGROUND;
const INITIAL_OVERLAY_TONE = playerConfig?.initialOverlayTone || 'rgba(12, 12, 18, 0.92)';
let dynamicThemingEnabled = playerConfig?.dynamicTheming !== false;
const DEFAULT_ART_PLACEHOLDER = '/img/icons8-music-album-64.png';
const ALL_TRACKS_ALBUM_ID = playerConfig?.allTracksAlbum?.albumId || 'all-songs-shuffle';
let DEFAULT_META_DESCRIPTION = 'Listen to tracks and albums.';
let SITE_TITLE = playerConfig?.siteBranding?.siteTitle || 'Tracks';
let BRAND_NAME = playerConfig?.siteBranding?.brandName || 'Independent Artist';
let BRAND_LOGO_URL = playerConfig?.siteBranding?.logoUrl || '';
const DEFAULT_ALBUM_HEADING = 'Albums';
let WELCOME_ALBUM_TITLE = playerConfig?.welcomeAlbums?.title || DEFAULT_ALBUM_HEADING;
let WELCOME_ALBUM_SUBTITLE = playerConfig?.welcomeAlbums?.subtitle || '';
let ABOUT_LINK_LABEL = 'about this website';
let RELEASE_ORDER = 'alphabetical';
let SITE_RELEASE_ORDER = 'alphabetical'; // admin default, used to reset user pref
const USER_ORDER_KEY = 'tmc-user-release-order';
const SETTINGS_CACHE_KEY = 'tmc-site-settings-cache';
const ACCESS_TOKEN_LS_KEY = 'tmc-access-token';
const ACCESS_TOKEN_COOKIE = 'tmc_access_token';

// ── Access token (localStorage + cookie fallback) ──────────────────
function parseTokenPayload(token) {
  if (!token) return null;
  try {
    const data = token.split('.')[0];
    // base64url → base64
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch (_) { return null; }
}

function isTokenExpired(token) {
  const payload = parseTokenPayload(token);
  if (!payload) return true;
  if (!payload.exp) return false; // no expiry = permanent (order purchase)
  return Math.floor(Date.now() / 1000) >= payload.exp;
}

function getRawToken() {
  try {
    const ls = localStorage.getItem(ACCESS_TOKEN_LS_KEY);
    if (ls) return ls;
  } catch (_) {}
  const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(ACCESS_TOKEN_COOKIE + '='));
  return match ? decodeURIComponent(match.slice(ACCESS_TOKEN_COOKIE.length + 1)) : null;
}

function getAccessToken() {
  const token = getRawToken();
  if (!token) return null;
  if (isTokenExpired(token)) return null; // treat expired as absent; refresh happens separately
  return token;
}

function setAccessToken(token) {
  try { localStorage.setItem(ACCESS_TOKEN_LS_KEY, token); } catch (_) {}
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Strict`;
}

function clearAccessToken() {
  try { localStorage.removeItem(ACCESS_TOKEN_LS_KEY); } catch (_) {}
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Strict`;
}

// Silently refresh a subscription token. Resolves to new token or null.
async function refreshSubscriptionToken() {
  const raw = getRawToken();
  const payload = parseTokenPayload(raw);
  if (!payload || payload.type !== 'subscription' || !payload.refId) return null;
  try {
    const res = await fetch('/.netlify/functions/verifyPayment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'subscription', id: payload.refId }),
    });
    if (!res.ok) return null;
    const { token } = await res.json();
    setAccessToken(token);
    return token;
  } catch (_) { return null; }
}

// On page load: if we have an expired subscription token, try a silent background refresh.
(async () => {
  const raw = getRawToken();
  if (raw && isTokenExpired(raw)) {
    await refreshSubscriptionToken();
    // If refresh fails the token stays expired; playTrack will show the paywall when needed.
  }
})();

// ── Payment runtime state ──────────────────────────────────────────
// Loaded async by initPayments(); null until the fetch completes.
let paymentConfig = null;
// Track that was blocked by the paywall — replayed after subscription completes.
let pendingTrack = null;

const ALBUMS_PAGE_SIZE = 20;
let pendingAlbums = [];
let albumSentinelObserver = null;

// ── Utility ───────────────────────────────────────────────────────
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── Toast ─────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = type === 'error' ? 'toast toast--error'
    : type === 'welcome' ? 'toast toast--welcome'
    : 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  // welcome toasts stay visible longer (5.5s animation + 0.35s fade ≈ 6s)
  setTimeout(() => toast.remove(), type === 'welcome' ? 6000 : 2750);
}

// ── Skeleton placeholder cards ────────────────────────────────────
function showSkeletonCards(count = 8) {
  dom.albumGalleryGrid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('article');
    card.className = 'album-card skeleton';
    const cover = document.createElement('div');
    cover.className = 'album-card-cover';
    const meta = document.createElement('div');
    meta.className = 'album-card-meta';
    const line1 = document.createElement('div');
    line1.className = 'skeleton-line';
    const line2 = document.createElement('div');
    line2.className = 'skeleton-line skeleton-line--short';
    const line3 = document.createElement('div');
    line3.className = 'skeleton-line skeleton-line--btn';
    meta.append(line1, line2, line3);
    card.append(cover, meta);
    dom.albumGalleryGrid.appendChild(card);
  }
}
const TRACKS_FIRST_DESKTOP = playerConfig?.layout?.tracksFirstOnDesktop === true;
const TIP_JAR_CONFIG = playerConfig?.tipJar || {};
const THEME_STORAGE_KEY = 'tmc-player-theme';
const DARK_BACKGROUND = '#0f0c14';
const DARK_OVERLAY_TONE = 'rgba(6, 6, 10, 0.94)';
let currentBackgroundLayers = 'none';
let currentArtworkSrc = null;
let welcomeHeroContent = null;
document.documentElement.style.setProperty('--overlay-tone', INITIAL_OVERLAY_TONE);
const colorThief = window.ColorThief ? new window.ColorThief() : null;
const mediaSessionSupported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;
let mediaSessionHandlersBound = false;

const MEDIA_SESSION_SKIP_SECONDS = 10;

const iconClassMap = {
  play: 'fa-play',
  pause: 'fa-pause',
  forward: 'fa-forward-step',
  back: 'fa-backward-step',
  shuffle: 'fa-shuffle',
  repeat: 'fa-repeat',
  volume: 'fa-volume-high',
  share: 'fa-share-nodes',
  expand: 'fa-up-right-and-down-left-from-center',
  'chev-up': 'fa-chevron-up',
  'chev-down': 'fa-chevron-down',
  disc: 'fa-compact-disc',
  wave: 'fa-wave-square',
  info: 'fa-circle-info',
  'arrow-left': 'fa-arrow-left',
  close: 'fa-xmark'
};

const mobileQuery = window.matchMedia('(max-width: 720px)');
const prefersDarkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const isMobileLayout = () => mobileQuery?.matches;

const isDarkMode = () => document.body.classList.contains('dark-mode');

function setBaseBackgroundColor(fallback) {
  const baseColor = isDarkMode() ? DARK_BACKGROUND : fallback || INITIAL_BACKGROUND;
  document.body.style.removeProperty('background-color');
  document.documentElement.style.setProperty('--paper', baseColor);
}

function getBackgroundOpacity(hasBackground) {
  if (!hasBackground) return '0';
  return isDarkMode() ? '0.08' : '0.12';
}

function getStoredTheme() {
  try {
    return window.localStorage?.getItem(THEME_STORAGE_KEY);
  } catch (err) {
    console.warn('Unable to read theme preference', err);
    return null;
  }
}

function saveThemePreference(theme) {
  try {
    window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {
    console.warn('Unable to save theme preference', err);
  }
}

function updateThemeToggleState(theme) {
  const isDark = theme === 'dark';
  const icon = dom.themeToggle?.querySelector('.icon');
  const srText = dom.themeToggle?.querySelector('.sr-only');
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  if (dom.themeToggle) {
    dom.themeToggle.setAttribute('aria-pressed', String(isDark));
    dom.themeToggle.setAttribute('aria-label', label);
    dom.themeToggle.setAttribute('title', label);
  }
  if (icon) {
    icon.classList.remove('fa-moon', 'fa-sun');
    icon.classList.add(isDark ? 'fa-sun' : 'fa-moon');
  }
  if (srText) {
    srText.textContent = label;
  }
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  document.body.dataset.theme = isDark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--overlay-tone', isDark ? DARK_OVERLAY_TONE : INITIAL_OVERLAY_TONE);
  setBaseBackgroundColor(state.currentTrack?.bgcolor);
  updateThemeBackground(currentBackgroundLayers);
  updateThemeToggleState(isDark ? 'dark' : 'light');
  refreshThemeForCurrentTrack();
}

function toggleTheme() {
  const nextTheme = isDarkMode() ? 'light' : 'dark';
  applyTheme(nextTheme);
  saveThemePreference(nextTheme);
}

function initTheme() {
  const storedTheme = getStoredTheme();
  const initialTheme = storedTheme || (prefersDarkQuery?.matches ? 'dark' : 'light');
  applyTheme(initialTheme);
  prefersDarkQuery?.addEventListener('change', event => {
    if (getStoredTheme()) return;
    applyTheme(event.matches ? 'dark' : 'light');
  });
}

function refreshThemeForCurrentTrack() {
  if (state.currentTrack) {
    applyColorPalette(state.currentTrack, currentArtworkSrc);
    return;
  }
  applyNeutralTheme();
  updateThemeBackground(currentBackgroundLayers);
}


function applySettingsData(settings) {
  SITE_TITLE = settings.siteTitle || SITE_TITLE;
  BRAND_NAME = settings.brandName || BRAND_NAME;
  DEFAULT_META_DESCRIPTION = settings.metaDescription || DEFAULT_META_DESCRIPTION;
  BRAND_LOGO_URL = settings.logoUrl || BRAND_LOGO_URL;
  const faviconHref = settings.faviconUrl || '/favicon.ico';
  const faviconEl = document.querySelector('link[rel="icon"]') || (() => { const el = document.createElement('link'); el.rel = 'icon'; document.head.appendChild(el); return el; })();
  faviconEl.href = faviconHref;
  // Keep apple-touch-icon in sync with the admin-uploaded PWA icon so Chrome
  // uses the right artwork for both home-screen shortcuts and install prompts.
  const touchIconHref = settings.pwaIcon192 || settings.pwaIcon512 || '/sigil.png';
  const touchIconEl = document.querySelector('link[rel="apple-touch-icon"]') || (() => { const el = document.createElement('link'); el.rel = 'apple-touch-icon'; document.head.appendChild(el); return el; })();
  touchIconEl.href = touchIconHref;
  const themeColorMeta = document.querySelector('meta[name="theme-color"]') || (() => { const el = document.createElement('meta'); el.name = 'theme-color'; document.head.appendChild(el); return el; })();
  themeColorMeta.content = settings.pwaThemeColor || settings.themePanelSurface || settings.themeBackground || getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#0f0c14';
  const rootStyle = document.documentElement.style;
  if (settings.themeBackground) {
    SITE_BACKGROUND_COLOR = settings.themeBackground;
    rootStyle.setProperty('--paper', settings.themeBackground);
  }
  if (settings.themePanelSurface) rootStyle.setProperty('--panel-surface', settings.themePanelSurface);
  if (settings.themeTopbarSurface) rootStyle.setProperty('--nav-surface', settings.themeTopbarSurface);
  if (settings.themeTopbarText) rootStyle.setProperty('--nav-text', settings.themeTopbarText);
  if (settings.themeControlSurface) rootStyle.setProperty('--control-surface', settings.themeControlSurface);
  if (settings.themeCardSurface || settings.themeSurface) rootStyle.setProperty('--card', settings.themeCardSurface || settings.themeSurface);
  if (settings.themeCardContrast) rootStyle.setProperty('--card-contrast', settings.themeCardContrast);
  if (settings.themeText) rootStyle.setProperty('--ink', settings.themeText);
  if (settings.themeMutedText) rootStyle.setProperty('--muted', settings.themeMutedText);
  if (settings.themeAccent) rootStyle.setProperty('--accent', settings.themeAccent);
  if (settings.themeBorder) rootStyle.setProperty('--border', settings.themeBorder);
  if (settings.themeHeroBackground) rootStyle.setProperty('--hero-bg', settings.themeHeroBackground);
  if (settings.dynamicColorTheming !== undefined) dynamicThemingEnabled = settings.dynamicColorTheming !== false;
  if (settings.releaseOrder) {
    SITE_RELEASE_ORDER = settings.releaseOrder;
    RELEASE_ORDER = settings.releaseOrder;
  }
  if (window.SiteSettings?.applyFontPair) window.SiteSettings.applyFontPair(settings.fontPair);
  WELCOME_ALBUM_TITLE = settings.welcomeTitle || WELCOME_ALBUM_TITLE;
  WELCOME_ALBUM_SUBTITLE = settings.welcomeSubtitle || WELCOME_ALBUM_SUBTITLE;
  ABOUT_LINK_LABEL = settings.aboutLinkLabel || ABOUT_LINK_LABEL;
  if (dom.aboutSiteLink) dom.aboutSiteLink.textContent = ABOUT_LINK_LABEL;
  const footerSummary = document.querySelector('.footer-disclosure summary');
  if (footerSummary && settings.footerSummary) footerSummary.innerHTML = settings.footerSummary;
  const footerContent = document.querySelector('.default-footer');
  if (footerContent && settings.footerContent) footerContent.innerHTML = settings.footerContent;
}

// Apply any previously-cached settings synchronously so branding is visible
// before the network responds — eliminates the "Independent Artist" flash.
function applyCachedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return;
    const settings = JSON.parse(raw);
    applySettingsData(settings);
    applyBranding();
  } catch (_) {}
}

async function applySiteSettings() {
  try {
    const response = await fetch('/.netlify/functions/siteSettings', { cache: 'no-cache' });
    if (!response.ok) return;
    const settings = await response.json();
    applySettingsData(settings);
    try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings)); } catch (_) {}
  } catch (_error) {}
}

function applyBranding() {
  if (dom.brandWord) {
    dom.brandWord.textContent = BRAND_NAME || SITE_TITLE;
  }
  if (dom.brandHome) {
    const label = BRAND_NAME || SITE_TITLE || 'Home';
    dom.brandHome.setAttribute('aria-label', label);
    dom.brandHome.setAttribute('title', label);
  }
  if (dom.brandMark && BRAND_LOGO_URL) {
    dom.brandMark.style.backgroundImage = `url(${BRAND_LOGO_URL})`;
    dom.brandMark.classList.add('has-image');
  }
}

function applyTipJarConfig() {
  if (!dom.tipJarLink) return;
  const enabled = Boolean(TIP_JAR_CONFIG.enabled && TIP_JAR_CONFIG.url);
  dom.tipJarLink.classList.toggle('hidden', !enabled);
  if (!enabled) return;
  dom.tipJarLink.href = TIP_JAR_CONFIG.url;
  const iconName = TIP_JAR_CONFIG.iconClass || 'fa-circle-dollar-to-slot';
  const iconEl = dom.tipJarLink.querySelector('.icon');
  if (iconEl) {
    iconEl.className = `icon fa-solid ${iconName}`;
  }
}

function applyDesktopLayoutPreference() {
  document.body.classList.toggle('tracks-first', TRACKS_FIRST_DESKTOP);
}

function updateAlbumGalleryHeading(isWelcome) {
  if (dom.albumGalleryTitle) {
    dom.albumGalleryTitle.textContent = isWelcome ? WELCOME_ALBUM_TITLE : DEFAULT_ALBUM_HEADING;
  }
  if (dom.albumGallerySubtitle) {
    const showSubtitle = Boolean(isWelcome && WELCOME_ALBUM_SUBTITLE);
    if (showSubtitle) {
      dom.albumGallerySubtitle.innerHTML = WELCOME_ALBUM_SUBTITLE;
    } else {
      dom.albumGallerySubtitle.textContent = '';
    }
    dom.albumGallerySubtitle.classList.toggle('hidden', !showSubtitle);
  }
}

function refreshNowPlayingMarquee() {
  const title = dom.npTitle;
  const container = title?.parentElement;
  if (!title || !container) return;

  title.classList.remove('marquee');
  title.style.removeProperty('--marquee-offset');

  requestAnimationFrame(() => {
    const overflow = title.scrollWidth - container.clientWidth;
    if (overflow > 12) {
      title.style.setProperty('--marquee-offset', `${-overflow}px`);
      title.classList.add('marquee');
    }
  });
}

function slugifyAlbumName(name = '') {
  return name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function canonicalAlbumSlug(albumOrIdentifier) {
  const album = findAlbum(albumOrIdentifier);
  if (album?.albumName) return slugifyAlbumName(album.albumName);
  if (typeof albumOrIdentifier === 'string') return slugifyAlbumName(albumOrIdentifier);
  if (albumOrIdentifier?.albumName) return slugifyAlbumName(albumOrIdentifier.albumName);
  return '';
}

function isFavoriteTrack(track) {
  const value = track?.fav;
  return value === true || value === 'true' || value === 1 || value === '1';
}

function objectIdTimestamp(idValue) {
  const hex = typeof idValue === 'string' ? idValue : idValue?.$oid || idValue?.oid;
  if (!hex || typeof hex !== 'string') return 0;
  if (!/^[a-f\d]{24}$/i.test(hex)) return 0;
  return parseInt(hex.slice(0, 8), 16) * 1000;
}

function getTrackTimestamp(track) {
  if (track?.createdAt) {
    const created = Date.parse(track.createdAt);
    if (!Number.isNaN(created)) return created;
  }
  return objectIdTimestamp(track?._id);
}

function setMetaTag(attribute, key, content) {
  if (!key) return;
  let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content ?? '');
}

function updateDocumentMetadata({ title, description, image, type = 'website', url }) {
  const safeTitle = title || SITE_TITLE;
  const safeDescription = description || DEFAULT_META_DESCRIPTION;
  const safeImage = image || BRAND_LOGO_URL || DEFAULT_ART_PLACEHOLDER;
  const safeUrl = url || window.location.href;

  document.title = safeTitle;
  setMetaTag('name', 'description', safeDescription);
  setMetaTag('property', 'og:title', safeTitle);
  setMetaTag('property', 'og:description', safeDescription);
  setMetaTag('property', 'og:type', type);
  setMetaTag('property', 'og:url', safeUrl);
  setMetaTag('property', 'og:image', safeImage);
  setMetaTag('name', 'twitter:title', safeTitle);
  setMetaTag('name', 'twitter:description', safeDescription);
  setMetaTag('name', 'twitter:image', safeImage);
}

function buildAlbumSlug(heroConfig) {
  if (!heroConfig) return null;
  const explicitId = heroConfig.albumId || heroConfig.albumSlug || heroConfig.album;
  if (explicitId) return explicitId;
  if (heroConfig.title) {
    return slugifyAlbumName(heroConfig.title);
  }
  return null;
}

function buildFeaturedAlbumLink(slug) {
  if (!slug) return '#';
  const canonicalSlug = canonicalAlbumSlug(slug) || slugifyAlbumName(slug);
  return `/album/${canonicalSlug}`;
}

function hydrateWelcomeHero(heroConfig) {
  if (!heroConfig || !dom.welcomeHero) return;
  const { title, coverImageUrl, tagline, ctaText } = heroConfig;
  const albumSlug = buildAlbumSlug(heroConfig);
  welcomeHeroContent = {
    ...heroConfig,
    albumSlug
  };
  if (dom.welcomeHeroTitle && title) {
    dom.welcomeHeroTitle.textContent = `Featured Release: ${title}`;
  }
  if (dom.welcomeHeroCopy && tagline) {
    dom.welcomeHeroCopy.textContent = tagline;
  }
  if (dom.welcomeHeroCover && coverImageUrl) {
    dom.welcomeHeroCover.src = coverImageUrl;
    dom.welcomeHeroCover.alt = `${title || 'Featured release'} cover art`;
    dom.welcomeHeroCover.dataset.album = albumSlug || '';
  }
  if (dom.welcomeHeroCta) {
    if (albumSlug) {
      const albumLink = buildFeaturedAlbumLink(albumSlug);
      dom.welcomeHeroCta.href = albumLink;
      dom.welcomeHeroCta.textContent = ctaText || 'Listen now';
      dom.welcomeHeroCta.target = '_self';
      dom.welcomeHeroCta.dataset.album = albumSlug;
    } else {
      dom.welcomeHeroCta.classList.add('hidden');
    }
  }
}

function parseFeatureTimestamp(feature) {
  if (!feature) return 0;
  const candidate = feature.featuredAt || feature.updatedAt || feature.featuredReleaseUpdatedAt || feature.timestamp;
  const parsed = candidate ? Date.parse(candidate) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function chooseCanonicalFeaturedRelease(...candidates) {
  const valid = candidates.filter((entry) => entry?.title && entry?.coverImageUrl);
  if (!valid.length) return null;
  return valid.sort((a, b) => parseFeatureTimestamp(b) - parseFeatureTimestamp(a))[0];
}

async function loadWelcomeHero() {
  try {
    const [siteSettingsResponse, welcomeResponse] = await Promise.all([
      fetch('/.netlify/functions/siteSettings', { cache: 'no-cache' }).catch(() => null),
      fetch('/welcome-config.json', { cache: 'no-cache' }).catch(() => null)
    ]);

    let settingsFeatured = null;
    let allowWelcomeConfigFallback = false;
    if (siteSettingsResponse?.ok) {
      const settings = await siteSettingsResponse.json();
      if (settings?.featuredReleaseEnabled === false) {
        welcomeHeroContent = null;
        updateWelcomeState();
        return;
      }
      allowWelcomeConfigFallback = settings?.useWelcomeConfigFallback === true;
      if (settings?.featuredRelease) {
        settingsFeatured = {
          ...settings.featuredRelease,
          featuredAt: settings.featuredRelease?.featuredAt || settings.featuredReleaseUpdatedAt || settings.updatedAt
        };
      }
    }

    let fileFeatured = null;
    if (!settingsFeatured && allowWelcomeConfigFallback && welcomeResponse?.ok) {
      const config = await welcomeResponse.json();
      if (config?.featuredRelease) fileFeatured = config.featuredRelease;
    }

    const featured = chooseCanonicalFeaturedRelease(settingsFeatured, fileFeatured);
    if (!featured) return;
    hydrateWelcomeHero(featured);
    updateWelcomeState();
  } catch (error) {
    console.warn('Could not load welcome hero config', error);
  }
}

function handleFeaturedHeroNavigation(event) {
  if (!welcomeHeroContent) return false;
  const albumSlug = welcomeHeroContent.albumSlug || buildAlbumSlug(welcomeHeroContent);
  if (!albumSlug) return false;
  event?.preventDefault?.();
  setAlbum(albumSlug);
  return true;
}

function updateWelcomeState() {
  const isWelcome = !state.currentAlbum;
  document.body.classList.toggle('welcome-state', isWelcome);
  dom.albumGallery?.classList.toggle('welcome-state', isWelcome);
  dom.albumGalleryGrid?.classList.toggle('welcome-state', isWelcome);
  dom.aboutSiteLink?.classList.toggle('hidden', !isWelcome);
  updateAlbumGalleryHeading(isWelcome);
  if (dom.welcomeHero) {
    const showHero = isWelcome && !!welcomeHeroContent;
    dom.welcomeHero.classList.toggle('hidden', !showHero);
  }
}

function swapIcon(target, iconName) {
  if (!target || !iconName) return;
  const iconEl = target.querySelector('.icon');
  if (iconEl) {
    const mapped = iconClassMap[iconName] || iconName;
    iconEl.className = `icon fa-solid ${mapped}`;
  }
}

function formatDuration(totalSeconds = 0) {
  if (!totalSeconds || Number.isNaN(totalSeconds)) return '0:00';
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(seconds) {
  return formatDuration(seconds);
}

function resolveArtwork(track) {
  const album = track ? findAlbum(track.albumId || track.albumName) : null;
  return (
    track?.artworkUrl ||
    track?.albumArtworkUrl ||
    album?.albumArtworkUrl ||
    album?.artworkUrl ||
    DEFAULT_ART_PLACEHOLDER
  );
}

function preloadTrackAssets(track) {
  if (!track) return;
  preloadArtwork(resolveArtwork(track));
  const trackSrc = resolveTrackUrl(track);
  if (trackSrc) preloadAudio(trackSrc);
}

function warmTrackAssets(tracks = [], limit = 3) {
  const toPrime = tracks.filter(Boolean).slice(0, limit);
  toPrime.forEach(preloadTrackAssets);
}

function parseDurationValue(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    const parts = trimmed.split(':').map(Number);
    if (parts.every(num => !Number.isNaN(num))) {
      return parts.reduce((acc, part) => acc * 60 + part, 0);
    }
  }
  return 0;
}

function getTrackDurationSeconds(track) {
  const keys = [
    'durationSeconds',
    'duration',
    'length',
    'trackDuration',
    'trackLength',
    'durationSec',
    'lengthSec',
    'lengthSeconds',
    'durationMs',
    'lengthMs',
    'durationMillis',
    'msDuration',
    'runtime',
    'runTime',
    'time',
    'durationMinutes'
  ];
  for (const key of keys) {
    const seconds = parseDurationValue(track?.[key]);
    if (seconds > 0) {
      return seconds > 10000 ? Math.round(seconds / 1000) : seconds;
    }
  }
  return 0;
}

function getProxiedArtwork(url) {
  if (!url) return '';
  const isAbsolute = /^https?:\/\//i.test(url);
  if (!isAbsolute) return url;
  return `/.netlify/functions/proxyImage?url=${encodeURIComponent(url)}`;
}

function preloadArtwork(url) {
  const target = getProxiedArtwork(url) || url;
  if (!target || artworkPreloadCache.has(target)) return artworkPreloadCache.get(target);

  const img = new Image();
  img.loading = 'eager';
  img.decoding = 'async';
  img.crossOrigin = 'anonymous';

  const loadPromise = new Promise(resolve => {
    const finalize = () => resolve(target);
    img.addEventListener('load', finalize, { once: true });
    img.addEventListener('error', finalize, { once: true });
  });

  img.src = target;
  artworkPreloadCache.set(target, loadPromise);
  return loadPromise;
}

function preloadAudio(url) {
  if (!url || audioPreloadCache.has(url)) return audioPreloadCache.get(url);

  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;

  const loadPromise = new Promise(resolve => {
    const finalize = () => {
      // currentSrc is the post-redirect URL — cache it so playTrack can use it
      // directly, skipping the Netlify function redirect on every subsequent play.
      const resolved = audio.currentSrc;
      if (resolved && resolved !== url) resolvedUrlCache.set(url, resolved);
      resolve(url);
    };
    audio.addEventListener('canplaythrough', finalize, { once: true });
    audio.addEventListener('error', finalize, { once: true });
  });

  audioPreloadCache.set(url, loadPromise);
  return loadPromise;
}

// Returns the direct MP3 URL if a prior preload already resolved the redirect,
// otherwise returns the stream URL as-is. This eliminates the API round-trip
// for the most common case (next track was preloaded while current track played).
function getEffectiveAudioUrl(streamUrl) {
  return resolvedUrlCache.get(streamUrl) || streamUrl;
}

// Keep a dedicated next-track Audio element fully buffered.  Called whenever
// the adjacent-track prime list changes, or ~30 s before the current track ends.
function primeNextTrackAudio(track) {
  if (!track) return;
  // Use the already-resolved direct URL when available so the browser's media
  // cache is populated at the same URL that state.audio will use — meaning no
  // redirect round-trip is needed when the track transitions in background.
  const url = getEffectiveAudioUrl(resolveTrackUrl(track));
  if (!url || url === nextTrackAudioUrl) return; // already primed

  nextTrackAudioUrl = url;
  if (!nextTrackAudio) {
    nextTrackAudio = new Audio();
    nextTrackAudio.preload = 'auto';
    nextTrackAudio.setAttribute('playsinline', '');
  }
  // Capture resolved URL when it becomes available.
  // Guard: rapid calls to primeNextTrackAudio leave stale { once: true } listeners
  // on the element. When the *next* load fires canplaythrough, every stale listener
  // sees nextTrackAudio.currentSrc for the *new* track and would cache that URL
  // under the *old* stream URL — poisoning the cache so a later playTrack call
  // plays the wrong audio file. The nextTrackAudioUrl check detects staleness.
  const onCanPlay = () => {
    if (nextTrackAudioUrl !== url) return;
    const resolved = nextTrackAudio.currentSrc;
    if (resolved && resolved !== url) resolvedUrlCache.set(url, resolved);
  };
  nextTrackAudio.removeEventListener('canplaythrough', onCanPlay);
  nextTrackAudio.addEventListener('canplaythrough', onCanPlay, { once: true });
  nextTrackAudio.src = url;
}

function buildArtworkLayers(primary, fallback) {
  if (primary && fallback && primary !== fallback) {
    return `url(${primary}), url(${fallback})`;
  }
  if (primary) return `url(${primary})`;
  if (fallback) return `url(${fallback})`;
  return '';
}

function updateThemeBackground(layers) {
  const hasBackground = Boolean(layers && layers !== 'none');
  currentBackgroundLayers = layers || 'none';
  document.documentElement.style.setProperty('--bg-opacity', getBackgroundOpacity(hasBackground));
  document.body.classList.add('theme-switching');
  setTimeout(() => {
    document.documentElement.style.setProperty('--page-bg', currentBackgroundLayers);
    requestAnimationFrame(() => document.body.classList.remove('theme-switching'));
  }, 80);
}

function applyNeutralTheme(track) {
  const fallbackBg = (!dynamicThemingEnabled && !isDarkMode())
    ? SITE_BACKGROUND_COLOR
    : (track?.bgcolor || SITE_BACKGROUND_COLOR || INITIAL_BACKGROUND);
  setBaseBackgroundColor(fallbackBg);
  const overlayTone = isDarkMode() ? DARK_OVERLAY_TONE : INITIAL_OVERLAY_TONE;
  document.documentElement.style.setProperty('--overlay-tone', overlayTone);
}

function getMediaSessionArtwork(track) {
  const artwork = resolveArtwork(track) || DEFAULT_ART_PLACEHOLDER;
  const proxied = getProxiedArtwork(artwork) || artwork;
  const sources = [proxied, DEFAULT_ART_PLACEHOLDER].filter(Boolean);
  return sources.map(src => ({
    src,
    sizes: '512x512',
    type: 'image/png'
  }));
}

function updateMediaSessionMetadata(track) {
  if (!mediaSessionSupported || !track) return;
  const metadata = {
    title: track.trackName || 'Untitled',
    artist: track.artistName || '',
    album: track.albumName || '',
    artwork: getMediaSessionArtwork(track)
  };
  try {
    navigator.mediaSession.metadata = new MediaMetadata(metadata);
  } catch (err) {
    console.warn('Media Session metadata unavailable', err);
  }
}

function updateMediaSessionPositionState() {
  if (!mediaSessionSupported || !state.audio?.duration || !navigator.mediaSession.setPositionState) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: Number(state.audio.duration) || 0,
      playbackRate: Number(state.audio.playbackRate) || 1,
      position: Math.min(state.audio.currentTime || 0, state.audio.duration || 0)
    });
  } catch (err) {
    console.warn('Unable to update media session position', err);
  }
}

function resetMediaSessionPositionState() {
  if (!mediaSessionSupported || !navigator.mediaSession.setPositionState) return;
  try {
    navigator.mediaSession.setPositionState({ duration: 0, playbackRate: 1, position: 0 });
  } catch (err) {
    // ignore — some browsers may not support a zero-duration reset
  }
}

function syncMediaSessionPlaybackState() {
  if (!mediaSessionSupported) return;
  const isPlaying = Boolean(state.audio && !state.audio.paused && !state.audio.ended);
  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  updateMediaSessionPositionState();
}

function ensureMediaSessionHandlers() {
  if (!mediaSessionSupported || mediaSessionHandlersBound) return;

  navigator.mediaSession.setActionHandler('play', () => {
    if (state.audio?.paused) {
      userWantsToPlay = true;
      state.audio.play().finally(syncPlayState);
    }
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    if (!state.audio?.paused) {
      userWantsToPlay = false;
      state.audio.pause();
      syncPlayState();
    }
  });

  navigator.mediaSession.setActionHandler('previoustrack', () => changeTrack(-1));
  navigator.mediaSession.setActionHandler('nexttrack', () => changeTrack(1));

  const seekBy = delta => {
    if (!state.audio) return;
    const next = Math.min(Math.max((state.audio.currentTime || 0) + delta, 0), state.audio.duration || 0);
    state.audio.currentTime = next;
    updateMediaSessionPositionState();
  };

  navigator.mediaSession.setActionHandler('seekbackward', event => {
    const seekOffset = event?.seekOffset ?? MEDIA_SESSION_SKIP_SECONDS;
    seekBy(-Math.abs(seekOffset));
  });

  navigator.mediaSession.setActionHandler('seekforward', event => {
    const seekOffset = event?.seekOffset ?? MEDIA_SESSION_SKIP_SECONDS;
    seekBy(Math.abs(seekOffset));
  });

  navigator.mediaSession.setActionHandler('seekto', event => {
    if (!state.audio || typeof event?.seekTime !== 'number') return;
    const clampedTime = Math.min(Math.max(event.seekTime, 0), state.audio.duration || 0);
    if (event.fastSeek && 'fastSeek' in state.audio) {
      state.audio.fastSeek(clampedTime);
    } else {
      state.audio.currentTime = clampedTime;
    }
    updateMediaSessionPositionState();
  });

  navigator.mediaSession.setActionHandler('stop', () => {
    if (!state.audio) return;
    userWantsToPlay = false;
    state.audio.pause();
    state.audio.currentTime = 0;
    syncPlayState();
  });

  mediaSessionHandlersBound = true;
}

// ── Screen Wake Lock ──────────────────────────────────────────────────────────
// Acquiring a wake lock keeps the screen lit, which also prevents browsers from
// aggressively throttling JS timers while the page is "hidden-but-audible" on
// many Android devices.  On iOS 16.4+ this API is also supported.
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    // If the OS releases the lock (e.g. power button), clear our reference so
    // the next play() re-requests it.
    wakeLock.addEventListener('release', () => { wakeLock = null; }, { once: true });
  } catch (_) {
    // Non-fatal — playback continues without the lock.
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (!wakeLock) return;
  wakeLock.release().catch(() => {});
  wakeLock = null;
}

// ── Track-end watchdog ────────────────────────────────────────────────────────
// iOS Safari and some Android browsers silently drop the `ended` event when the
// page is backgrounded, leaving the player stalled forever on the last track.
// We arm a setTimeout for slightly past the expected track end so we can kick
// off the next-track transition ourselves if `ended` never arrives.

function clearTrackEndWatchdog() {
  if (trackEndWatchdogTimer !== null) {
    clearTimeout(trackEndWatchdogTimer);
    trackEndWatchdogTimer = null;
  }
}

function armTrackEndWatchdog() {
  clearTrackEndWatchdog();
  const audio = state.audio;
  if (!audio || !userWantsToPlay) return;
  const duration = audio.duration;
  const currentTime = audio.currentTime;
  if (!isFinite(duration) || duration <= 0 || currentTime >= duration) return;
  const remainingMs = (duration - currentTime) * 1000;
  // Fire 1.5 s after the expected end as a backup.
  trackEndWatchdogTimer = setTimeout(() => {
    trackEndWatchdogTimer = null;
    if (!state.audio || !userWantsToPlay) return;
    const d = state.audio.duration;
    const t = state.audio.currentTime;
    if (!isFinite(d) || d <= 0) return;
    // Only act when genuinely at/near the end; skip if the user seeked away.
    if (!state.audio.ended && t < d - 2.0) return;
    // Mirror the `ended` event handler logic.
    // Do NOT call syncPlayState() before changeTrack — same reason as the `ended`
    // handler: it would set playbackState='paused', causing Android/iOS to treat
    // the next play() as a new session requiring a user gesture.
    if (state.queue?.repeatEnabled) {
      state.audio.currentTime = 0;
      state.audio.play().finally(syncPlayState);
    } else {
      changeTrack(1);
    }
  }, remainingMs + 1500);
}

function slugify(text = '') {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function getPaletteKey(track) {
  if (track?._id) return track._id;
  if (track?.albumName) return `album:${slugify(track.albumName)}`;
  return null;
}

function getCachedPalette(track) {
  const key = getPaletteKey(track);
  if (!key) return null;
  return paletteCache.get(key) || null;
}

function storePalette(track, palette) {
  const key = getPaletteKey(track);
  if (!key || !palette) return;
  paletteCache.set(key, palette);
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function updateFilters() {
  const artists = new Set();
  const years = new Set();
  const genres = new Set();
  state.tracks.forEach(track => {
    if (track.artistName) artists.add(track.artistName);
    if (track.year) years.add(track.year);
    if (track.genre) genres.add(track.genre);
  });

  const populate = (select, values, label) => {
    if (!select) return;
    select.innerHTML = '';
    const any = document.createElement('option');
    any.value = 'all';
    any.textContent = `All ${label}`;
    select.appendChild(any);
    Array.from(values)
      .sort()
      .forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
  };

  populate(dom.filterArtist, artists, 'artists');
  populate(dom.filterYear, years, 'years');
  populate(dom.filterGenre, genres, 'genres');
}

function sortTracksForAlbum(album, tracks = []) {
  if (album?.pseudoType === 'custom-playlist') {
    const order = album.trackSortOrder || 'manual';
    if (order === 'manual') {
      return album?.limit ? tracks.slice(0, album.limit) : tracks;
    }
    const sorted = [...tracks];
    if (order === 'alpha-asc') {
      sorted.sort((a, b) => (a.trackName || '').localeCompare(b.trackName || ''));
    } else if (order === 'alpha-desc') {
      sorted.sort((a, b) => (b.trackName || '').localeCompare(a.trackName || ''));
    } else if (order === 'album-order') {
      sorted.sort((a, b) => {
        const byAlbum = (a.albumName || '').localeCompare(b.albumName || '');
        if (byAlbum !== 0) return byAlbum;
        const byNum = (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0);
        if (byNum !== 0) return byNum;
        return (a.trackName || '').localeCompare(b.trackName || '');
      });
    } else if (order === 'date-desc') {
      sorted.sort((a, b) => getTrackTimestamp(b) - getTrackTimestamp(a));
    } else if (order === 'date-asc') {
      sorted.sort((a, b) => getTrackTimestamp(a) - getTrackTimestamp(b));
    }
    return album?.limit ? sorted.slice(0, album.limit) : sorted;
  }
  const sorted = [...tracks];
  if (album?.pseudoType === 'whats-new') {
    sorted.sort((a, b) => getTrackTimestamp(b) - getTrackTimestamp(a) || (a.trackName || '').localeCompare(b.trackName || ''));
    return album?.limit ? sorted.slice(0, album.limit) : sorted;
  }

  const useCombinedOrder = album?.allTracks || album?.pseudoType === 'favorites';
  sorted.sort((a, b) => {
    if (useCombinedOrder) {
      const byAlbum = (a.albumName || '').localeCompare(b.albumName || '');
      if (byAlbum !== 0) return byAlbum;
    }
    const aNum = Number(a.trackNumber) || 0;
    const bNum = Number(b.trackNumber) || 0;
    const byTrack = aNum - bNum;
    if (byTrack !== 0) return byTrack;
    return (a.trackName || '').localeCompare(b.trackName || '');
  });
  const limited = album?.limit ? sorted.slice(0, album.limit) : sorted;
  return limited;
}

function tracksForAlbum(albumOrName) {
  const album = typeof albumOrName === 'string' ? findAlbum(albumOrName) : albumOrName;
  if (!album) return [];

  let tracks = [];
  if (album.pseudoType === 'favorites') {
    tracks = state.tracks.filter(isFavoriteTrack);
  } else if (album.pseudoType === 'whats-new') {
    tracks = state.tracks;
  } else if (album.pseudoType === 'custom-playlist') {
    const idList = album.trackIds || [];
    const byId = Object.fromEntries(state.tracks.map(t => [t._id, t]));
    tracks = idList.map(id => byId[id]).filter(Boolean);
  } else if (album.allTracks || album.pseudoType === 'all-tracks') {
    tracks = state.tracks;
  } else {
    tracks = state.tracks.filter(track => track.albumName === album.albumName);
  }

  return sortTracksForAlbum(album, tracks);
}

function matchesFilters(album) {
  const albumTracks = tracksForAlbum(album);
  return albumTracks.some(track => {
    const artistOk = state.filters.artist === 'all' || track.artistName === state.filters.artist;
    const yearOk = state.filters.year === 'all' || `${track.year}` === `${state.filters.year}`;
    const genreOk = state.filters.genre === 'all' || track.genre === state.filters.genre;
    const searchText = state.filters.search.toLowerCase();
    const searchOk = !searchText || track.trackName?.toLowerCase().includes(searchText) || album.albumName?.toLowerCase().includes(searchText);
    return artistOk && yearOk && genreOk && searchOk;
  });
}

function generatePseudoAlbumArt(albumName, pseudoType) {
  const palettes = {
    'all-tracks':       ['#4f3bff', '#8b5cf6'],
    'whats-new':        ['#0ea5e9', '#06b6d4'],
    'favorites':        ['#ec4899', '#ef4444'],
    'custom-playlist':  ['#f97316', '#eab308'],
  };
  const [c1, c2] = palettes[pseudoType] || ['#6b7280', '#374151'];
  const label = albumName || 'Collection';
  // Split into up to two lines of ~14 chars each
  const words = label.split(' ');
  const lines = [];
  let current = '';
  words.forEach(w => {
    if (!current) { current = w; }
    else if ((current + ' ' + w).length <= 14) { current += ' ' + w; }
    else { lines.push(current); current = w; }
  });
  if (current) lines.push(current);
  const lineHeight = 42;
  const totalHeight = lines.length * lineHeight;
  const startY = 150 - (totalHeight / 2) + 30;
  const textEls = lines.map((line, i) =>
    `<text x="150" y="${startY + i * lineHeight}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="34" fill="rgba(255,255,255,0.92)">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/>${textEls}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function albumCoverFor(album) {
  if (album.albumArtworkUrl) return album.albumArtworkUrl;
  if (album.artworkUrl) return album.artworkUrl;
  if (album.pseudoType || album.allTracks) {
    return generatePseudoAlbumArt(album.albumName, album.pseudoType || 'all-tracks');
  }
  return DEFAULT_ART_PLACEHOLDER;
}

function findAlbum(identifier) {
  if (!identifier) return null;
  if (typeof identifier === 'object' && identifier.albumName) return identifier;
  const raw = identifier.toString();
  const lookup = raw.toLowerCase();
  const slugLookup = slugifyAlbumName(raw);
  return state.albums.find(album => {
    const albumId = String(album.albumId || '').toLowerCase();
    const albumName = String(album.albumName || '').toLowerCase();
    const albumNameSlug = slugifyAlbumName(album.albumName || '');
    const albumIdSlug = slugifyAlbumName(album.albumId || '');
    return (
      albumId === lookup ||
      albumName === lookup ||
      albumNameSlug === slugLookup ||
      albumIdSlug === slugLookup
    );
  });
}

function applyPaletteStyles(track, dominantColor, artworkSrc) {
  if (isDarkMode()) {
    const layers = artworkSrc ? buildArtworkLayers(getProxiedArtwork(artworkSrc), artworkSrc) : 'none';
    setBaseBackgroundColor(track?.bgcolor);
    document.documentElement.style.setProperty('--overlay-tone', DARK_OVERLAY_TONE);
    updateThemeBackground(layers);
    return;
  }

  const hasCustomBg = track?.bgcolor && /^#([0-9a-f]{3}){1,2}$/i.test(track.bgcolor);
  const baseColor = hasCustomBg
    ? track.bgcolor
    : `rgb(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]})`;
  setBaseBackgroundColor(baseColor);
  const overlayTone = `rgba(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]}, 0.92)`;
  document.documentElement.style.setProperty('--overlay-tone', overlayTone);
  if (artworkSrc) {
    const layers = buildArtworkLayers(getProxiedArtwork(artworkSrc), artworkSrc);
    updateThemeBackground(layers);
  }
}

function applyColorPalette(track, artworkSrc) {
  currentArtworkSrc = artworkSrc || currentArtworkSrc;
  if (!dynamicThemingEnabled || !track || !artworkSrc) {
    applyNeutralTheme(track);
    updateThemeBackground('none');
    return;
  }

  try {
    const cachedPalette = getCachedPalette(track);
    if (cachedPalette) {
      applyPaletteStyles(track, cachedPalette, artworkSrc);
      return;
    }

    if (!colorThief || !dom.artwork?.complete) return;
    let dominantColor = colorThief.getColor(dom.artwork);
    let hsl = rgbToHsl(dominantColor[0], dominantColor[1], dominantColor[2]);
    const lightnessThreshold = 0.3;
    if (hsl[2] < lightnessThreshold) {
      hsl[2] = lightnessThreshold;
      dominantColor = hslToRgb(hsl[0], hsl[1], hsl[2]);
    }

    storePalette(track, dominantColor);
    applyPaletteStyles(track, dominantColor, artworkSrc);
  } catch (error) {
    console.warn('Color extraction failed', error);
    updateThemeBackground(artworkSrc ? `url(${artworkSrc})` : 'none');
  }
}

function syncViewportLayout() {
  if (!dom.albumGallery || !dom.albumDetail) return;
  updateWelcomeState();
  if (isMobileLayout()) {
    dom.albumGallery.classList.remove('hidden');
    if (state.currentAlbum) {
      dom.albumDetail.classList.remove('hidden');
    }
    dom.nowPlayingPane?.classList.add('hidden');
    return;
  }

  if (state.currentAlbum) {
    dom.albumGallery.classList.add('hidden');
    dom.albumDetail.classList.remove('hidden');
  } else {
    dom.albumGallery.classList.remove('hidden');
    dom.albumDetail.classList.add('hidden');
  }

  updateWelcomeState();
}

mobileQuery?.addEventListener('change', syncViewportLayout);

function showAlbumGallery() {
  dom.albumGallery.classList.remove('hidden');
  if (isMobileLayout()) {
    dom.albumDetail.classList.toggle('hidden', !state.currentAlbum);
    dom.nowPlayingPane?.classList.add('hidden');
    updateWelcomeState();
    return;
  }
  dom.albumDetail.classList.add('hidden');
  dom.nowPlayingPane.classList.add('hidden');
  updateWelcomeState();
}

function goToWelcome() {
  state.currentAlbum = null;
  state.currentAlbumId = null;
  history.replaceState(null, '', '/');
  refreshDocumentMetadata();
  showAlbumGallery();
  syncViewportLayout();
}

function showAlbumDetail() {
  if (isMobileLayout()) {
    dom.albumGallery.classList.remove('hidden');
    dom.albumDetail.classList.remove('hidden');
    return;
  }
  dom.albumGallery.classList.add('hidden');
  dom.albumDetail.classList.remove('hidden');
}

function showPlayerPane() {
  if (isMobileLayout()) {
    openNowPlayingOverlay();
    return;
  }
  dom.albumGallery.classList.add('hidden');
  dom.albumDetail.classList.add('hidden');
  dom.nowPlayingPane.classList.remove('hidden');
}

function getTrackText(track) {
  const textFields = ['trackText', 'text', 'notes', 'lyrics', 'trackNotes', 'description'];
  for (const key of textFields) {
    if (track?.[key]) return track[key];
  }
  return '';
}

function buildTrackMetadata(track, album) {
  if (!track) return null;
  const albumForTrack = album || findAlbum(track.albumId || track.albumName);
  const artwork =
    getProxiedArtwork(resolveArtwork(track)) ||
    resolveArtwork(track) ||
    (albumForTrack ? albumCoverFor(albumForTrack) : DEFAULT_ART_PLACEHOLDER);
  const titleParts = [track.trackName || 'Untitled'];
  if (track.artistName) {
    titleParts.push(track.artistName);
  } else if (track.albumName) {
    titleParts.push(track.albumName);
  }
  const description =
    getTrackText(track) ||
    `Listen to ${track.trackName || 'this track'}${track.albumName ? ` from ${track.albumName}` : ''}.`;
  const url = new URL(window.location.href);
  if (track._id) url.searchParams.set('track', track._id);
  const albumIdForUrl = track.albumId || albumForTrack?.albumId || slugifyAlbumName(track.albumName);
  if (albumIdForUrl) url.searchParams.set('album', albumIdForUrl);
  return {
    title: titleParts.join(' • '),
    description,
    image: artwork,
    type: 'music.song',
    url: url.toString()
  };
}

function buildAlbumMetadata(album) {
  if (!album) return null;
  const metaInfo = buildAlbumMeta(album);
  const artwork = getProxiedArtwork(albumCoverFor(album)) || albumCoverFor(album) || DEFAULT_ART_PLACEHOLDER;
  const url = new URL(window.location.href);
  const albumIdForUrl = album.albumId || slugifyAlbumName(album.albumName);
  if (albumIdForUrl) {
    url.searchParams.set('album', albumIdForUrl);
  }
  url.searchParams.delete('track');
  return {
    title: album.albumName || 'Album',
    description: metaInfo.summary ? `${album.albumName} • ${metaInfo.summary}` : DEFAULT_META_DESCRIPTION,
    image: artwork,
    type: 'music.album',
    url: url.toString()
  };
}

function refreshDocumentMetadata(context = {}) {
  const track = context.track || state.currentTrack;
  const album =
    context.album ||
    (track ? findAlbum(track.albumId || track.albumName) : findAlbum(state.currentAlbumId || state.currentAlbum));

  if (track) {
    const trackMeta = buildTrackMetadata(track, album);
    updateDocumentMetadata(trackMeta || {});
    return;
  }

  if (album) {
    const albumMeta = buildAlbumMetadata(album);
    updateDocumentMetadata(albumMeta || {});
    return;
  }

  updateDocumentMetadata({
    title: SITE_TITLE,
    description: DEFAULT_META_DESCRIPTION,
    image: BRAND_LOGO_URL || DEFAULT_ART_PLACEHOLDER,
    type: 'website',
    url: window.location.href
  });
}

function buildAlbumMeta(albumOrName) {
  const album = typeof albumOrName === 'string' ? findAlbum(albumOrName) : albumOrName;
  const albumName = album?.albumName || (typeof albumOrName === 'string' ? albumOrName : '');
  const tracksInAlbum = tracksForAlbum(album || albumName);
  const curatedAlbum = findAlbum(albumName);
  const albumLevelDuration = parseDurationValue(curatedAlbum?.albumLength || curatedAlbum?.length || curatedAlbum?.duration);
  const durationSeconds = tracksInAlbum.reduce((total, track) => total + getTrackDurationSeconds(track), 0);
  const summaryParts = [`${tracksInAlbum.length} track${tracksInAlbum.length === 1 ? '' : 's'}`];
  const totalSeconds = durationSeconds || albumLevelDuration;
  if (totalSeconds) summaryParts.push(formatDuration(totalSeconds));
  return {
    tracksInAlbum,
    durationSeconds: totalSeconds,
    summary: summaryParts.join(' • ')
  };
}

function sortPseudoAlbums(albums) {
  return [...albums].sort((a, b) => {
    const aOrder = a.pseudoSortOrder != null ? Number(a.pseudoSortOrder) : 999;
    const bOrder = b.pseudoSortOrder != null ? Number(b.pseudoSortOrder) : 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.albumName || '').localeCompare(b.albumName || '');
  });
}

function sortedAlbumsForDisplay() {
  const albums = [...state.albums];
  const pseudos = sortPseudoAlbums(albums.filter(a => a.allTracks || a.pseudoType));
  const real    = albums.filter(a => !a.allTracks && !a.pseudoType);

  const before = pseudos.filter(a => (a.placement || 'before') === 'before');
  const after  = pseudos.filter(a => a.placement === 'after');

  if (RELEASE_ORDER === 'date-desc' || RELEASE_ORDER === 'date-asc') {
    real.sort((a, b) => {
      const aYear = a.year || 0;
      const bYear = b.year || 0;
      const yearDiff = RELEASE_ORDER === 'date-asc' ? aYear - bYear : bYear - aYear;
      if (yearDiff !== 0) return yearDiff;
      return (a.artistName || a.albumName || '').localeCompare(b.artistName || b.albumName || '') ||
        (a.albumName || '').localeCompare(b.albumName || '');
    });
    return [...before, ...real, ...after];
  }
  if (RELEASE_ORDER === 'custom') {
    real.sort((a, b) => {
      const aOrder = a.albumSortOrder != null ? Number(a.albumSortOrder) : Infinity;
      const bOrder = b.albumSortOrder != null ? Number(b.albumSortOrder) : Infinity;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.albumName || '').localeCompare(b.albumName || '');
    });
    return [...before, ...real, ...after];
  }
  // Default: alphabetical
  return [...before, ...real, ...after];
}

function buildAlbumCard(album) {
  const card = document.createElement('article');
  card.className = 'album-card';
  if (album.bgcolor && /^#([0-9a-f]{3}){1,2}$/i.test(album.bgcolor)) {
    card.style.background = `linear-gradient(180deg, ${album.bgcolor}ee, ${album.bgcolor}cc)`;
  }
  const cover = document.createElement('div');
  cover.className = 'album-card-cover';
  const artwork = albumCoverFor(album);
  if (artwork) {
    cover.setAttribute('aria-label', `${album.albumName} cover`);
    if (artwork.startsWith('data:')) {
      // Inline SVG for generated pseudo-album art — no network load needed
      cover.style.backgroundImage = `url("${artwork}")`;
    } else {
      // Real image — use native lazy loading with a fade-in reveal
      const img = document.createElement('img');
      img.className = 'cover-img';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = artwork;
      img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
      img.addEventListener('error', () => {
        img.src = DEFAULT_ART_PLACEHOLDER;
        img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
      }, { once: true });
      cover.appendChild(img);
    }
  }
  if (album.year && !album.allTracks && !album.pseudoType) {
    const yearChip = document.createElement('span');
    yearChip.className = 'album-card-year';
    yearChip.textContent = album.year;
    cover.appendChild(yearChip);
  }
  card.appendChild(cover);
  const meta = document.createElement('div');
  meta.className = 'album-card-meta';
  const title = document.createElement('h3');
  title.textContent = album.albumName;
  meta.appendChild(title);
  const metaInfo = buildAlbumMeta(album);
  const note = document.createElement('p');
  note.textContent = metaInfo.summary;
  meta.appendChild(note);
  const view = document.createElement('button');
  view.className = 'pill';
  view.textContent = 'View album';
  view.addEventListener('click', event => {
    event.stopPropagation();
    setAlbum(album);
  });
  meta.appendChild(view);
  card.appendChild(meta);
  card.addEventListener('click', () => setAlbum(album));
  return card;
}

function attachAlbumSentinel() {
  const sentinel = document.createElement('div');
  sentinel.className = 'album-grid-sentinel';
  dom.albumGalleryGrid.appendChild(sentinel);
  albumSentinelObserver = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    albumSentinelObserver.disconnect();
    albumSentinelObserver = null;
    sentinel.remove();
    const batch = pendingAlbums.splice(0, ALBUMS_PAGE_SIZE);
    batch.forEach(album => dom.albumGalleryGrid.appendChild(buildAlbumCard(album)));
    if (pendingAlbums.length > 0) attachAlbumSentinel();
  }, { rootMargin: '300px' });
  albumSentinelObserver.observe(sentinel);
}

function renderAlbums() {
  if (albumSentinelObserver) { albumSentinelObserver.disconnect(); albumSentinelObserver = null; }
  dom.albumGalleryGrid.innerHTML = '';
  const filtered = sortedAlbumsForDisplay().filter(matchesFilters);
  const firstBatch = filtered.slice(0, ALBUMS_PAGE_SIZE);
  pendingAlbums = filtered.slice(ALBUMS_PAGE_SIZE);
  firstBatch.forEach(album => dom.albumGalleryGrid.appendChild(buildAlbumCard(album)));
  if (pendingAlbums.length > 0) attachAlbumSentinel();
}

function renderTracks(album) {
  const albumName = typeof album === 'string' ? album : album?.albumName;
  dom.tracksList.innerHTML = '';
  const resolvedAlbum = typeof album === 'string' ? findAlbum(album) : album;
  const albumTracks = tracksForAlbum(resolvedAlbum || albumName);
  if (!albumTracks.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No tracks available.';
    empty.className = 'track-item empty';
    dom.tracksList.appendChild(empty);
    return;
  }
  albumTracks.forEach((track, index) => {
    const isPaid = track.paid === true;
    const isSubscribed = !!getAccessToken();
    const li = document.createElement('li');
    li.className = isPaid
      ? (isSubscribed ? 'track-item paid is-subscribed' : 'track-item paid')
      : 'track-item';
    li.dataset.id = track._id;
    const prefix = resolvedAlbum?.allTracks || resolvedAlbum?.pseudoType ? `${index + 1}.` : track.trackNumber ? `${track.trackNumber}.` : '';
    const lockIcon = (isPaid && paymentConfig?.paymentsEnabled !== false)
      ? isSubscribed
        ? '<span class="track-star" aria-label="Members track" title="Members track — you have full access">★</span>'
        : '<span class="track-lock" aria-label="Members only" title="Subscribe to unlock">&#128274;</span>'
      : '';
    li.innerHTML = `<div>${prefix}${lockIcon}</div><div>${track.trackName}</div>`;
    li.addEventListener('click', () => playTrack(track));
    dom.tracksList.appendChild(li);
  });
  highlightActiveTrack();
}

function setTrackToggleState(collapsed) {
  swapIcon(dom.trackListToggle, collapsed ? 'chev-down' : 'chev-up');
  dom.trackListToggle?.setAttribute('aria-expanded', (!collapsed).toString());
}

function setAlbum(albumIdentifier) {
  const album = findAlbum(albumIdentifier);
  if (!album) return;
  const albumName = album.albumName;
  const albumId = album.albumId || slugifyAlbumName(album.albumName);
  const canonicalSlug = canonicalAlbumSlug(album) || slugifyAlbumName(albumName);
  state.currentAlbum = albumName;
  state.currentAlbumId = albumId;
  dom.albumHeading.textContent = albumName;
  const artwork = albumCoverFor(album);
  if (artwork) {
    dom.albumDetailCover.style.backgroundImage = `url("${artwork}")`;
  }
  const metaInfo = buildAlbumMeta(album);
  if (dom.albumLength) {
    dom.albumLength.textContent = metaInfo.summary;
  }
  renderTracks(album);
  const shareUrl = buildShareUrl(null, canonicalSlug || albumId || albumName);
  if (shareUrl?.pathname) {
    history.replaceState(null, '', shareUrl.pathname + shareUrl.search);
  }
  const activeTrack = state.currentTrack && state.currentTrack.albumName === albumName ? state.currentTrack : null;
  refreshDocumentMetadata({ album, track: activeTrack });
  if (!isMobileLayout()) {
    dom.albumGallery.classList.add('hidden');
  }
  dom.albumDetail.classList.remove('hidden');
  const albumTracks = metaInfo.tracksInAlbum;
  let currentId = state.currentTrack && albumTracks.some(track => track._id === state.currentTrack._id)
    ? state.currentTrack._id
    : null;
  if (!currentId) {
    const startingTrack = album.enableShuffle && albumTracks.length
      ? albumTracks[Math.floor(Math.random() * albumTracks.length)]
      : albumTracks[0];
    currentId = startingTrack?._id ?? null;
  }
  state.queue.setItems(albumTracks, currentId);
  state.queueAlbumId = albumId;
  warmTrackAssets(albumTracks, 3);
  if (album.allTracks && album.enableShuffle) {
    state.queue.shuffleEnabled = true;
    state.queue.buildShuffle(currentId);
  }
  if (album.allTracks && albumTracks.length) {
    const selectedTrack = albumTracks.find(track => track._id === currentId) || albumTracks[0];
    if (selectedTrack) {
      playTrack(selectedTrack, { autoplay: true });
    }
  }
  syncPlayModes();
  syncViewportLayout();
}

function highlightActiveTrack() {
  if (!state.currentTrack) return;
  dom.tracksList.querySelectorAll('.track-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === state.currentTrack._id);
  });
}

function showOverlay() {
  if (!dom.trackOverlay) return;
  dom.trackOverlay.classList.add('visible');
  dom.trackOverlay.setAttribute('aria-hidden', 'false');
}

function hideOverlay() {
  if (!dom.trackOverlay) return;
  dom.trackOverlay.classList.remove('visible');
  dom.trackOverlay.setAttribute('aria-hidden', 'true');
}

function currentPseudoAlbum() {
  // queueAlbumId is set when the queue is built and is NOT cleared by navigation
  // (goToWelcome clears currentAlbumId, but not queueAlbumId), so checking it
  // first keeps the pseudo album context alive after the user swipes back to the
  // gallery or the now-playing bar is tapped.
  const album = findAlbum(state.queueAlbumId || state.currentAlbumId || state.currentAlbum);
  return (album?.pseudoType || album?.allTracks) ? album : null;
}

function openNowPlayingOverlay() {
  if (!state.currentTrack) return;
  // If we're already inside a pseudo album, stay there — don't switch to the track's real album.
  if (!currentPseudoAlbum() && state.currentTrack?.albumName) {
    // Snapshot queue before setAlbum() resets it
    const prevItems = state.queue?.items?.slice() ?? [];
    const prevShuffle = state.queue?.shuffleEnabled ?? false;
    const prevRepeat = state.queue?.repeatEnabled ?? false;
    const prevCurrentId = state.queue?.currentId;
    const prevQueueAlbumId = state.queueAlbumId;
    setAlbum(state.currentTrack.albumName);
    // If shuffle was active over a broader set (e.g. "all songs"), restore it.
    // Also restore queueAlbumId so currentPseudoAlbum() and ensureQueueForTrack
    // keep using the pseudo album context on subsequent track changes.
    if (prevShuffle && prevItems.length > (state.queue?.items?.length ?? 0)) {
      state.queue.items = prevItems;
      state.queue.shuffleEnabled = true;
      state.queue.repeatEnabled = prevRepeat;
      state.queue.currentId = prevCurrentId;
      state.queue.buildShuffle(prevCurrentId);
      state.queueAlbumId = prevQueueAlbumId;
      syncPlayModes();
    }
  }
  highlightActiveTrack();
  showOverlay();
}

function updatePlayerMeta(track) {
  const pseudoCtx = currentPseudoAlbum();
  dom.trackTitle.textContent = track.trackName || 'Untitled';
  dom.trackArtist.textContent = track.artistName || '';
  // When playing from a pseudo album, show the pseudo album name as context;
  // show the track's real album in parentheses so it remains visible.
  dom.trackAlbum.textContent = pseudoCtx
    ? `${pseudoCtx.albumName}${track.albumName && track.albumName !== pseudoCtx.albumName ? ' · ' + track.albumName : ''}`
    : (track.albumName || '');
  const trackText = getTrackText(track);
  const hasVerseContent = Boolean(trackText) || Boolean(track?.medium);
  if (dom.verseText) {
    dom.verseText.textContent = trackText || '';
    dom.verseText.classList.toggle('hidden', !trackText);
  }
  if (dom.trackMedium) {
    dom.trackMedium.textContent = track.medium || '';
    dom.trackMedium.classList.toggle('hidden', !track.medium);
  }
  if (dom.verseText?.parentElement) {
    dom.verseText.parentElement.classList.toggle('hidden', !hasVerseContent);
  }
  const artwork = resolveArtwork(track);
  const safeArtwork = getProxiedArtwork(artwork) || artwork || DEFAULT_ART_PLACEHOLDER;
  const layers = buildArtworkLayers(safeArtwork, artwork);
  const playerStage = document.querySelector('.player-stage');
  currentArtworkSrc = safeArtwork || DEFAULT_ART_PLACEHOLDER;
  currentBackgroundLayers = artwork ? layers : 'none';

  if (dom.artwork) {
    dom.artwork.crossOrigin = 'anonymous';
    dom.artwork.classList.add('artwork-loading');
    dom.artwork.src = safeArtwork || DEFAULT_ART_PLACEHOLDER;
  }
  if (dom.overlayArt) {
    dom.overlayArt.crossOrigin = 'anonymous';
    dom.overlayArt.classList.add('artwork-loading');
    dom.overlayArt.src = safeArtwork || DEFAULT_ART_PLACEHOLDER;
    dom.overlayArt.addEventListener('load', () => dom.overlayArt.classList.remove('artwork-loading'), { once: true });
    dom.overlayArt.addEventListener('error', () => dom.overlayArt.classList.remove('artwork-loading'), { once: true });
  }

  if (dom.npArt) dom.npArt.style.backgroundImage = layers || '';
  // When in a pseudo album, keep its own artwork in the album detail cover rather
  // than replacing it with the individual track's artwork on every track change.
  if (dom.albumDetailCover && !pseudoCtx) dom.albumDetailCover.style.backgroundImage = layers || '';
  if (playerStage) {
    const gradient = isDarkMode()
      ? 'linear-gradient(rgba(24, 20, 32, 0.92), rgba(16, 12, 24, 0.86))'
      : 'linear-gradient(rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.74))';
    playerStage.style.backgroundImage = artwork ? `${gradient}, ${layers}` : gradient;
  }

  if (dom.npTitle) dom.npTitle.textContent = track.trackName || '';
  if (dom.npArtist) dom.npArtist.textContent = track.artistName || '';
  if (dom.overlayTitle) dom.overlayTitle.textContent = track.trackName || '';
  if (dom.overlayArtist) dom.overlayArtist.textContent = track.artistName || '';
  if (dom.overlayAlbum) dom.overlayAlbum.textContent = pseudoCtx
    ? `${pseudoCtx.albumName}${track.albumName && track.albumName !== pseudoCtx.albumName ? ' · ' + track.albumName : ''}`
    : (track.albumName || '');
  refreshNowPlayingMarquee();
  dom.nowPlayingBar?.classList.remove('inactive');

  applyNeutralTheme(track);
  updateThemeBackground(currentBackgroundLayers);
  // Defer expensive ColorThief analysis until the browser is idle so it doesn't
  // add latency to the audio start or cause a janky frame drop on track change.
  const _paletteTrack = track;
  const _paletteArtSrc = currentArtworkSrc;
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => applyColorPalette(_paletteTrack, _paletteArtSrc), { timeout: 3000 });
  } else {
    setTimeout(() => applyColorPalette(_paletteTrack, _paletteArtSrc), 150);
  }
  updateMediaSessionMetadata(track);
  resetMediaSessionPositionState();
}

function buildShareUrl(track, albumParam) {
  const shareUrl = new URL(window.location.origin);
  const resolvedAlbum = canonicalAlbumSlug(albumParam || track?.albumName || state.currentAlbum) || slugifyAlbumName(albumParam || track?.albumName || state.currentAlbum || '');

  if (track) {
    const trackSlug = slugify(track.trackName);
    const trackSegment = trackSlug ? `${track._id}-${trackSlug}` : track._id;
    shareUrl.pathname = resolvedAlbum ? `/album/${resolvedAlbum}/track/${trackSegment}` : `/track/${trackSegment}`;
  } else if (resolvedAlbum) {
    shareUrl.pathname = `/album/${resolvedAlbum}`;
  }

  return shareUrl;
}

async function copyShareLink() {
  const track = state.currentTrack;
  const albumParam = state.currentAlbumId || state.currentAlbum;
  const su = buildShareUrl(track || null, track ? null : albumParam);
  const url = su?.pathname ? su.toString() : window.location.href;

  const title = state.currentTrack?.trackName || document.title;

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user dismissed the share sheet
      // share failed — fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied');
    if (dom.copyLinkButton) {
      dom.copyLinkButton.classList.add('copied');
      setTimeout(() => dom.copyLinkButton?.classList.remove('copied'), 2000);
    }
  } catch (err) {
    showToast('Could not copy link', 'error');
    console.warn('Clipboard unavailable', err);
  }
}


function getPathRouteParams() {
  const segments = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!segments.length) return { album: null, track: null };

  // /s/:trackId — simple share URL format
  if (segments[0] === 's' && segments[1]) {
    return { album: null, track: segments[1] };
  }

  const albumIndex = segments.indexOf('album');
  const trackIndex = segments.indexOf('track');

  const album = albumIndex >= 0 ? segments[albumIndex + 1] || null : null;
  const track = trackIndex >= 0 ? segments[trackIndex + 1] || null : null;

  return { album, track };
}

function extractTrackId(trackParam) {
  if (!trackParam) return null;
  return String(trackParam) || null;
}

function resolveTrackUrl(track) {
  if (track?._id) {
    let url = `/.netlify/functions/stream?trackId=${encodeURIComponent(String(track._id))}`;
    if (track.paid) {
      const token = getAccessToken();
      if (token) url += `&accessToken=${encodeURIComponent(token)}`;
    }
    return url;
  }
  return track?.streamUrl || track?.src || null;
}

function ensureQueueForTrack(track) {
  if (!state.queue) return;
  const albumContext =
    findAlbum(state.queueAlbumId || state.currentAlbumId || state.currentAlbum) ||
    findAlbum(track.albumId || track.albumName);
  const albumTracks = tracksForAlbum(albumContext || track.albumName);
  if (albumTracks.length) {
    // Only rebuild queue items when the track set actually changed.
    // Calling setItems while shuffle is on resets the entire shuffled play
    // order (Fisher-Yates + shuffleIndex = 0), which causes already-played
    // tracks to repeat and makes "previous" always return null.
    const currentItems = state.queue.items;
    const itemsUnchanged =
      albumTracks.length === currentItems.length &&
      albumTracks.every((t, i) => t._id === currentItems[i]?._id);

    if (itemsUnchanged) {
      state.queue.currentId = track._id;
      if (state.queue.shuffleEnabled) {
        const idx = state.queue.shuffledItems.findIndex(t => t._id === track._id);
        if (idx !== -1) state.queue.shuffleIndex = idx;
      }
    } else {
      state.queue.setItems(albumTracks, track._id);
      if (albumContext) {
        state.queueAlbumId = albumContext.albumId || slugifyAlbumName(albumContext.albumName || '');
      }
    }
  } else {
    state.queue.enqueue(track);
    state.queue.setCurrent(track);
  }
}

function primeAdjacentTracks(track) {
  if (!state.queue || !track) return;
  const q = state.queue;
  const items = q.shuffleEnabled && q.shuffledItems.length ? q.shuffledItems : q.items;
  const currentIndex = items.findIndex(t => t._id === track._id);
  if (currentIndex === -1) {
    warmTrackAssets([track]);
    return;
  }

  const nearby = [track];
  const nextTrack = currentIndex + 1 < items.length ? items[currentIndex + 1] : null;
  if (nextTrack) nearby.push(nextTrack);
  if (currentIndex > 0) nearby.push(items[currentIndex - 1]);
  warmTrackAssets(nearby, 3);
  // Keep the dedicated next-track buffer hot so the transition is instant.
  if (nextTrack) primeNextTrackAudio(nextTrack);
}

function activateSubscribedState() {
  // Nav button → non-interactive "Subscribed ✓" badge
  const navBtn = document.getElementById('navSubscribe');
  if (navBtn) {
    navBtn.classList.remove('hidden');
    navBtn.classList.add('is-subscribed');
    navBtn.textContent = 'Subscribed \u2713';
    navBtn.setAttribute('aria-label', 'You have a full-access subscription');
  }
  // Convert any rendered lock icons to star (premium indicator)
  document.querySelectorAll('.track-lock').forEach(el => {
    el.className = 'track-star';
    el.textContent = '\u2605';
    el.setAttribute('aria-label', 'Members track');
    el.setAttribute('title', 'Members track \u2014 you have full access');
  });
  // Remove the dim from paid track items
  document.querySelectorAll('.track-item.paid').forEach(el => el.classList.add('is-subscribed'));
  // Show the subscriber help panel below the footer
  showSubscriberHelp();
}

function showSubscriberHelp() {
  const section = document.getElementById('subscriber-help');
  if (!section) return;
  section.hidden = false;
  // Display email from token if available
  const payload = parseTokenPayload(getRawToken());
  const emailEl = document.getElementById('subscriber-help-email');
  if (emailEl && payload?.email) emailEl.textContent = payload.email;
}

function showPaywallModal(track) {
  const modal = document.getElementById('paywall-modal');
  if (!modal) return;

  if (getAccessToken()) {
    // Already subscribed — show confirmation instead of payment flow
    const iconEl = document.getElementById('paywall-icon');
    const titleEl = document.getElementById('paywall-title');
    const bodyEl = document.getElementById('paywall-body');
    if (iconEl) iconEl.textContent = '\u2713';
    if (titleEl) titleEl.textContent = "You're subscribed!";
    if (bodyEl) bodyEl.textContent = 'You have full access to the entire catalogue. Enjoy the music!';
    document.getElementById('paywall-payment-flow').hidden = true;
    document.getElementById('paywall-subscribed-view').hidden = false;
    document.getElementById('paywall-dismiss').hidden = true;
    modal.hidden = false;
    document.getElementById('paywall-subscribed-ok')?.focus();
    return;
  }

  // Ensure payment flow is shown (reset in case previously opened in subscribed state)
  const paymentFlow = document.getElementById('paywall-payment-flow');
  const subscribedView = document.getElementById('paywall-subscribed-view');
  const dismissBtn = document.getElementById('paywall-dismiss');
  if (paymentFlow) paymentFlow.hidden = false;
  if (subscribedView) subscribedView.hidden = true;
  if (dismissBtn) dismissBtn.hidden = false;
  const iconEl = document.getElementById('paywall-icon');
  if (iconEl) iconEl.innerHTML = '&#128274;';

  pendingTrack = track;
  const body = document.getElementById('paywall-body');
  if (body) {
    body.textContent = track
      ? `"${track.trackName}" is only available to subscribers. Subscribe once to unlock the full catalogue.`
      : 'Subscribe to unlock the full catalogue.';
  }
  modal.hidden = false;
  // Render the PayPal button now that the container is visible
  renderPayPalButton();
  (document.querySelector('#paywall-paypal-btn iframe') ?? document.getElementById('paywall-dismiss'))?.focus();
}

function playTrack(track, { autoplay = true } = {}) {
  if (track.paid === true && paymentConfig?.paymentsEnabled !== false && !getAccessToken()) {
    showPaywallModal(track);
    return;
  }
  state.currentTrack = track;
  ensureQueueForTrack(track);
  const streamUrl = resolveTrackUrl(track);
  if (!streamUrl) {
    console.warn('No playable source for track', track);
    return;
  }

  // Prefer the URL that nextTrackAudio already has fully loaded (currentSrc is
  // the post-redirect URL the browser has in its media cache).  Falling back to
  // the resolved-URL cache, then the raw stream URL as a last resort.
  const primed = (nextTrackAudio && nextTrackAudioUrl &&
    (nextTrackAudioUrl === streamUrl || nextTrackAudioUrl === getEffectiveAudioUrl(streamUrl)))
    ? (nextTrackAudio.currentSrc || null)
    : null;
  const src = primed || getEffectiveAudioUrl(streamUrl);
  // Clear any pending watchdog from the previous track before swapping src.
  clearTrackEndWatchdog();
  state.audio.src = src;

  updatePlayerMeta(track);
  highlightActiveTrack();

  // Defer non-critical work so the audio element can start loading immediately.
  const scheduleIdle = typeof requestIdleCallback === 'function'
    ? cb => requestIdleCallback(cb, { timeout: 2000 })
    : cb => setTimeout(cb, 0);

  scheduleIdle(() => {
    primeAdjacentTracks(track);
    if (document.visibilityState !== 'hidden') {
      history.replaceState(null, '', buildShareUrl(track).pathname);
      refreshDocumentMetadata({ track });
    }
  });

  if (autoplay) {
    userWantsToPlay = true;
    const playPromise = state.audio.play();
    if (playPromise?.catch) {
      playPromise
        .then(() => syncPlayState())
        .catch(err => console.warn('Playback blocked', err))
        .finally(syncPlayState);
    }
    if (!playPromise || !playPromise.then) {
      syncPlayState();
    }
  } else {
    syncPlayState();
  }
  dom.nowPlayingPane.classList.remove('hidden');
}

function togglePlay() {
  if (!state.audio.src) return;
  if (state.audio.paused) {
    userWantsToPlay = true;
    state.audio.play().finally(syncPlayState);
  } else {
    userWantsToPlay = false;
    state.audio.pause();
    syncPlayState();
  }
}

function setBufferingState(buffering) {
  [dom.playButton, dom.npPlay, dom.overlayPlay].forEach(btn => {
    btn?.classList.toggle('buffering', buffering);
  });
}

function syncPlayState() {
  const isPlaying = Boolean(state.audio && !state.audio.paused && !state.audio.ended);
  const targets = [dom.playButton, dom.npPlay, dom.overlayPlay];
  targets.forEach(button => {
    swapIcon(button, isPlaying ? 'pause' : 'play');
  });
  dom.nowPlayingBar?.classList.toggle('playing', isPlaying);
  syncMediaSessionPlaybackState();
}

function syncPlayModes() {
  const shuffleOn = Boolean(state.queue?.shuffleEnabled);
  const repeatOn = Boolean(state.queue?.repeatEnabled);

  const toggleButtonState = (button, on, onTitle, offTitle) => {
    if (!button) return;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', on.toString());
    button.title = on ? onTitle : offTitle;
  };

  toggleButtonState(dom.shuffleButton, shuffleOn, 'Shuffle on', 'Shuffle off');
  toggleButtonState(dom.repeatButton, repeatOn, 'Repeat on', 'Repeat off');
  toggleButtonState(dom.npShuffle, shuffleOn, 'Shuffle on', 'Shuffle off');
  toggleButtonState(dom.npRepeat, repeatOn, 'Repeat on', 'Repeat off');
  toggleButtonState(dom.overlayShuffle, shuffleOn, 'Shuffle on', 'Shuffle off');
  toggleButtonState(dom.overlayRepeat, repeatOn, 'Repeat on', 'Repeat off');

  if (state.audio) {
    state.audio.loop = repeatOn;
  }
}

function updateTime() {
  dom.currentTime.textContent = formatTime(state.audio.currentTime);
  dom.duration.textContent = formatTime(state.audio.duration);
  if (dom.seekBar) {
    dom.seekBar.value = state.audio.duration ? (state.audio.currentTime / state.audio.duration) * 100 : 0;
  }
  if (dom.overlayCurrentTime) {
    dom.overlayCurrentTime.textContent = formatTime(state.audio.currentTime);
  }
  if (dom.overlayDuration) {
    dom.overlayDuration.textContent = formatTime(state.audio.duration);
  }
  if (dom.overlaySeekBar) {
    dom.overlaySeekBar.value = state.audio.duration ? (state.audio.currentTime / state.audio.duration) * 100 : 0;
  }
  updateMediaSessionPositionState();
}

function changeTrack(direction) {
  if (!state.queue) return;
  const nextTrack =
    direction === 1 ? state.queue.next(state.currentTrack?._id) : state.queue.previous(state.currentTrack?._id);
  if (nextTrack) {
    playTrack(nextTrack);
  }
}

async function refreshLibrary() {
  dom.refreshButton?.classList.add('loading');
  const previousAlbum = state.currentAlbum;
  const previousAlbumId = state.currentAlbumId;
  const previousTrackId = state.currentTrack?._id;
  const previousShuffle = state.queue?.shuffleEnabled;
  const previousRepeat = state.queue?.repeatEnabled;
  try {
    await loadLibrary();
    if (state.queue) {
      state.queue.shuffleEnabled = previousShuffle;
      state.queue.repeatEnabled = previousRepeat;
      if (previousShuffle) state.queue.buildShuffle(previousTrackId);
    }
    updateFilters();
    renderAlbums();
    const existingAlbum = previousAlbumId ? findAlbum(previousAlbumId) : findAlbum(previousAlbum);
    if (existingAlbum) {
      setAlbum(existingAlbum);
      if (previousTrackId) {
        const matchingTrack = state.tracks.find(track => track._id === previousTrackId);
        if (matchingTrack) {
          state.currentTrack = matchingTrack;
          ensureQueueForTrack(matchingTrack);
          updatePlayerMeta(matchingTrack);
          highlightActiveTrack();
        }
      }
    }
    syncPlayModes();
    syncPlayState();
  } finally {
    dom.refreshButton?.classList.remove('loading');
  }
}

function onKeyboard(event) {
  if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  switch (event.key) {
    case ' ': {
      event.preventDefault();
      togglePlay();
      break;
    }
    case 'ArrowLeft':
      state.audio.currentTime = Math.max(0, state.audio.currentTime - 5);
      break;
    case 'ArrowRight':
      state.audio.currentTime = Math.min(state.audio.duration || 0, state.audio.currentTime + 5);
      break;
    case 'ArrowUp':
      state.audio.volume = Math.min(1, state.audio.volume + 0.05);
      dom.volumeSlider.value = state.audio.volume;
      break;
    case 'ArrowDown':
      state.audio.volume = Math.max(0, state.audio.volume - 0.05);
      dom.volumeSlider.value = state.audio.volume;
      break;
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  dom.refreshButton?.addEventListener('click', e => {
    e.preventDefault();
    refreshLibrary();
  });
  dom.backToAlbums?.addEventListener('click', () => {
    goToWelcome();
  });
  setTrackToggleState(false);
  dom.trackListToggle?.addEventListener('click', () => {
    const collapsed = dom.trackListContainer?.classList.toggle('collapsed');
    setTrackToggleState(Boolean(collapsed));
  });
  dom.playButton?.addEventListener('click', togglePlay);
  dom.nextButton?.addEventListener('click', () => changeTrack(1));
  dom.prevButton?.addEventListener('click', () => changeTrack(-1));
  dom.seekBar?.addEventListener('input', e => {
    if (!state.audio.duration) return;
    state.audio.currentTime = (Number(e.target.value) / 100) * state.audio.duration;
  });
  dom.overlaySeekBar?.addEventListener('input', e => {
    if (!state.audio.duration) return;
    state.audio.currentTime = (Number(e.target.value) / 100) * state.audio.duration;
  });
  dom.shuffleButton?.addEventListener('click', () => {
    if (!state.queue) return;
    state.queue.toggleShuffle();
    syncPlayModes();
  });
  dom.repeatButton?.addEventListener('click', () => {
    if (!state.queue) return;
    state.queue.toggleRepeat();
    syncPlayModes();
  });
  dom.npShuffle?.addEventListener('click', event => {
    event.stopPropagation();
    if (!state.queue) return;
    state.queue.toggleShuffle();
    syncPlayModes();
  });
  dom.npRepeat?.addEventListener('click', event => {
    event.stopPropagation();
    if (!state.queue) return;
    state.queue.toggleRepeat();
    syncPlayModes();
  });
  dom.volumeSlider?.addEventListener('input', e => {
    state.audio.volume = Number(e.target.value);
  });
  dom.navAlbums?.addEventListener('click', () => {
    goToWelcome();
  });
  dom.brandHome?.addEventListener('click', event => {
    event.preventDefault();
    goToWelcome();
  });
  dom.navNowPlaying?.addEventListener('click', () => {
    openNowPlayingOverlay();
  });
  dom.themeToggle?.addEventListener('click', toggleTheme);
  dom.welcomeHeroCta?.addEventListener('click', event => {
    handleFeaturedHeroNavigation(event);
  });
  dom.welcomeHeroCover?.addEventListener('click', event => {
    handleFeaturedHeroNavigation(event);
  });
  dom.copyLinkButton?.addEventListener('click', copyShareLink);
  dom.filterArtist?.addEventListener('change', e => {
    state.filters.artist = e.target.value;
    renderAlbums();
  });
  dom.filterYear?.addEventListener('change', e => {
    state.filters.year = e.target.value;
    renderAlbums();
  });
  dom.filterGenre?.addEventListener('change', e => {
    state.filters.genre = e.target.value;
    renderAlbums();
  });
  dom.filterSearch?.addEventListener('input', debounce(e => {
    state.filters.search = e.target.value;
    renderAlbums();
  }, 180));
  const sortOrderSelect = document.getElementById('sortOrderSelect');
  if (sortOrderSelect) {
    sortOrderSelect.addEventListener('change', () => {
      const val = sortOrderSelect.value;
      if (val) {
        RELEASE_ORDER = val;
        localStorage.setItem(USER_ORDER_KEY, val);
      } else {
        RELEASE_ORDER = SITE_RELEASE_ORDER;
        localStorage.removeItem(USER_ORDER_KEY);
      }
      renderAlbums();
    });
  }
  dom.npPlay?.addEventListener('click', togglePlay);
  dom.npNext?.addEventListener('click', () => changeTrack(1));
  dom.npPrev?.addEventListener('click', () => changeTrack(-1));
  dom.npShare?.addEventListener('click', event => {
    event.stopPropagation();
    copyShareLink();
  });
  dom.overlayPlay?.addEventListener('click', togglePlay);
  dom.overlayNext?.addEventListener('click', () => changeTrack(1));
  dom.overlayPrev?.addEventListener('click', () => changeTrack(-1));
  dom.overlayShare?.addEventListener('click', copyShareLink);
  dom.overlayShuffle?.addEventListener('click', () => {
    if (!state.queue) return;
    state.queue.toggleShuffle();
    syncPlayModes();
  });
  dom.overlayRepeat?.addEventListener('click', () => {
    if (!state.queue) return;
    state.queue.toggleRepeat();
    syncPlayModes();
  });
  dom.overlayClose?.addEventListener('click', hideOverlay);
  dom.trackOverlay?.addEventListener('click', event => {
    const nonDismissable = event.target.closest(
      'button, input, a, .overlay-visual, .overlay-meta, .overlay-controls'
    );
    if (!nonDismissable) hideOverlay();
  });
  dom.nowPlayingBar?.addEventListener('click', e => {
    if (e.target.closest('.np-controls') || e.target.closest('.np-secondary')) return;
    openNowPlayingOverlay();
  });
  dom.expandTrack?.addEventListener('click', openNowPlayingOverlay);
  window.addEventListener('resize', refreshNowPlayingMarquee);
  document.addEventListener('keydown', onKeyboard);
  state.audio.addEventListener('timeupdate', () => {
    updateTime();
    // ~30 s before the end, ensure the next track's audio is pre-buffered so
    // the transition is near-instant even with the screen off / page hidden.
    const dur = state.audio.duration;
    const remaining = dur - state.audio.currentTime;
    if (remaining > 0 && remaining < 30 && state.queue) {
      // Peek at the next track without advancing the queue pointer.
      const q = state.queue;
      const orderedItems = q.shuffleEnabled && q.shuffledItems.length ? q.shuffledItems : q.items;
      const currentPos = orderedItems.findIndex(t => t._id === state.currentTrack?._id);
      const peekNext = currentPos !== -1 && currentPos + 1 < orderedItems.length
        ? orderedItems[currentPos + 1]
        : null;
      if (peekNext) primeNextTrackAudio(peekNext);
    }
  });
  state.audio.addEventListener('loadedmetadata', updateTime);
  state.audio.addEventListener('durationchange', updateTime);
  state.audio.addEventListener('ended', () => {
    clearTrackEndWatchdog();
    if (state.queue?.repeatEnabled) {
      state.audio.currentTime = 0;
      state.audio.play().finally(syncPlayState);
      return;
    }
    // Do NOT call syncPlayState() or releaseWakeLock() here before changeTrack.
    // syncPlayState → syncMediaSessionPlaybackState would set playbackState='paused',
    // which causes iOS to treat the next play() as a new session requiring a user
    // gesture rather than a continuation of the active audio session.
    // The 'pause' event fired by src reassignment in playTrack handles releaseWakeLock,
    // and syncPlayState runs once 'play'/'playing' fire on the next track.
    changeTrack(1);
  });
  state.audio.addEventListener('play', () => {
    userWantsToPlay = true;
    syncPlayState();
  });
  state.audio.addEventListener('playing', () => {
    setBufferingState(false);
    syncPlayState();
    // Arm the watchdog every time playback (re)starts or resumes after buffering.
    armTrackEndWatchdog();
    requestWakeLock();
  });
  state.audio.addEventListener('waiting', () => { setBufferingState(true); syncPlayState(); });
  state.audio.addEventListener('pause', () => {
    setBufferingState(false);
    syncPlayState();
    // Clear the watchdog while paused so it doesn't fire during an intentional pause.
    clearTrackEndWatchdog();
    releaseWakeLock();
  });
  // Re-arm the watchdog whenever the user seeks so remaining-time stays accurate.
  state.audio.addEventListener('seeked', () => {
    if (!state.audio.paused && userWantsToPlay) armTrackEndWatchdog();
  });
  state.audio.addEventListener('error', async () => {
    setBufferingState(false);
    syncPlayState();
    const track = state.currentTrack;
    if (!track?.paid) return; // non-paid error, nothing special to do
    // Paid track failed — token may have expired. Try a silent refresh once.
    const newToken = await refreshSubscriptionToken();
    if (newToken) {
      // Re-try playback with fresh token
      state.audio.src = resolveTrackUrl(track);
      state.audio.play().catch(() => {});
    } else {
      clearAccessToken();
      showPaywallModal(track);
    }
  });

  // When the page comes back to the foreground after being hidden, recover any
  // playback state that was silently lost while the page was backgrounded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (state.currentTrack) {
        // Case 1: the `ended` event was swallowed while we were hidden.
        if (state.audio?.ended && userWantsToPlay) {
          if (state.queue?.repeatEnabled) {
            state.audio.currentTime = 0;
            state.audio.play().catch(() => {});
          } else {
            changeTrack(1);
          }
          return;
        }
        // Case 2: the OS suspended the audio element mid-track.
        if (userWantsToPlay && state.audio?.paused && !state.audio?.ended) {
          state.audio.play().catch(() => {});
        }
        // Re-arm watchdog and re-request wake lock in case they lapsed.
        if (userWantsToPlay && state.audio && !state.audio.paused) {
          armTrackEndWatchdog();
          requestWakeLock();
        }
        // Sync the URL bar and document meta (skipped while hidden to avoid
        // broken history entries).
        history.replaceState(null, '', buildShareUrl(state.currentTrack).pathname);
        refreshDocumentMetadata({ track: state.currentTrack });
        syncPlayState();
      }
    } else {
      // Page is being hidden — wake lock will be released by the OS; clear our
      // reference so requestWakeLock() re-acquires it when we come back.
      wakeLock = null;
    }
  });

  // Handle back-forward cache restoration (common when swiping between apps on
  // mobile).  `pageshow` fires with event.persisted=true when the page is
  // rehydrated from bfcache rather than freshly loaded.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    if (state.audio?.ended && userWantsToPlay) {
      changeTrack(1);
    } else if (userWantsToPlay && state.audio?.paused && !state.audio?.ended) {
      state.audio.play().catch(() => {});
    }
    if (userWantsToPlay && state.audio && !state.audio.paused) {
      armTrackEndWatchdog();
      requestWakeLock();
    }
    syncPlayState();
  });

  window.addEventListener('pagehide', () => {
    // Release the wake lock cleanly so the OS doesn't hold it past our lifetime.
    releaseWakeLock();
  });

  // Paywall modal dismiss
  const paywallModal = document.getElementById('paywall-modal');
  const paywallDismiss = document.getElementById('paywall-dismiss');
  if (paywallModal && paywallDismiss) {
    const closePaywall = () => { paywallModal.hidden = true; pendingTrack = null; };
    paywallDismiss.addEventListener('click', closePaywall);
    paywallModal.addEventListener('click', (event) => { if (event.target === paywallModal) closePaywall(); });
  }
  document.getElementById('paywall-subscribed-ok')?.addEventListener('click', () => {
    const modal = document.getElementById('paywall-modal');
    if (modal) modal.hidden = true;
  });
}

// ── Payment / subscription flow ───────────────────────────────────

function loadPayPalSDK(clientId) {
  return new Promise((resolve, reject) => {
    if (window.paypal) { resolve(); return; }
    const script = document.createElement('script');
    // vault=true + intent=subscription required for subscription buttons
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription`;
    script.onload = resolve;
    script.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.head.appendChild(script);
  });
}

// Renders the PayPal Subscribe button into the (now-visible) modal.
// Called the first time showPaywallModal() makes the container visible.
let paypalButtonRendered = false;

function renderPayPalButton() {
  if (paypalButtonRendered || !window.paypal || !paymentConfig?.planId) return;
  paypalButtonRendered = true;
  window.paypal.Buttons({
    style: { shape: 'pill', color: 'gold', layout: 'vertical', label: 'subscribe' },
    createSubscription: async () => {
      const res = await fetch('/.netlify/functions/createSubscription', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create subscription');
      const { subscriptionId } = await res.json();
      return subscriptionId;
    },
    onApprove: async (data) => {
      const errorEl = document.getElementById('paywall-error');
      try {
        const res = await fetch('/.netlify/functions/verifyPayment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'subscription', id: data.subscriptionID }),
        });
        if (!res.ok) throw new Error((await res.json()).message || 'Verification failed');
        const { token } = await res.json();
        setAccessToken(token);
        document.getElementById('paywall-modal').hidden = true;
        activateSubscribedState();
        showToast('Welcome! You now have full access to the entire catalogue.', 'welcome');
        if (pendingTrack) { const t = pendingTrack; pendingTrack = null; playTrack(t); }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = 'Your subscription was received but access confirmation failed. Please use "Restore access" below or refresh the page.';
          errorEl.hidden = false;
        }
      }
    },
    onError: (err) => {
      console.error('PayPal button error', err);
      const errorEl = document.getElementById('paywall-error');
      if (errorEl) { errorEl.textContent = 'Something went wrong with PayPal. Please try again or use the restore form below.'; errorEl.hidden = false; }
    },
  }).render('#paywall-paypal-btn').catch((err) => {
    paypalButtonRendered = false; // allow a retry next open
    console.warn('PayPal button render failed', err);
  });
}

async function initPayments() {
  try {
    const res = await fetch('/.netlify/functions/paymentConfig');
    if (!res.ok) return;
    paymentConfig = await res.json();
    if (!paymentConfig.paymentsEnabled) return;

    // Show the Subscribe button in the nav (or subscribed badge if already active)
    const navBtn = document.getElementById('navSubscribe');
    if (navBtn) {
      navBtn.classList.remove('hidden');
      navBtn.addEventListener('click', () => showPaywallModal(null));
    }
    if (getAccessToken()) {
      activateSubscribedState();
    }

    // Pre-fill the price display so it's ready when the modal first opens
    const priceEl = document.getElementById('paywall-price');
    if (priceEl && paymentConfig.subscriptionPrice) {
      priceEl.textContent = paymentConfig.subscriptionPrice;
      priceEl.hidden = false;
    }

    // Wire the restore-access form (subscription ID, once at startup)
    document.getElementById('paywall-restore-submit')?.addEventListener('click', async () => {
      const id = (document.getElementById('paywall-restore-id')?.value || '').trim();
      const msgEl = document.getElementById('paywall-restore-msg');
      if (!msgEl) return;
      if (!id) { msgEl.textContent = 'Please paste your Subscription ID.'; msgEl.hidden = false; return; }
      msgEl.textContent = 'Verifying with PayPal\u2026';
      msgEl.hidden = false;
      try {
        const res2 = await fetch('/.netlify/functions/verifyPayment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'subscription', id }),
        });
        if (!res2.ok) throw new Error((await res2.json()).message || 'Not found');
        const { token } = await res2.json();
        setAccessToken(token);
        document.getElementById('paywall-modal').hidden = true;
        msgEl.hidden = true;
        activateSubscribedState();
        showToast('Access restored \u2014 welcome back! Full catalogue unlocked.', 'welcome');
        if (pendingTrack) { const t = pendingTrack; pendingTrack = null; playTrack(t); }
      } catch (err) {
        msgEl.textContent = err.message || 'Not found \u2014 check your Subscription ID and try again.';
      }
    });

    // "Subscriber help" link inside paywall modal opens the help panel
    document.getElementById('paywall-open-help')?.addEventListener('click', () => {
      document.getElementById('paywall-modal').hidden = true;
      const help = document.getElementById('subscriber-help');
      if (help) { help.hidden = false; help.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });



    // Load the SDK in the background — the button renders lazily on first modal open.
    // Also call renderPayPalButton() after load in case the modal was already open.
    if (paymentConfig.clientId) {
      loadPayPalSDK(paymentConfig.clientId)
        .then(() => renderPayPalButton())
        .catch(err => console.warn('PayPal SDK load failed', err));
    }
  } catch (err) {
    console.warn('Payment init failed', err);
  }
}

export async function init() {
  initTheme();
  // Instantly apply last-known settings from localStorage — eliminates the
  // "Independent Artist" flash on every load after the first visit.
  applyCachedSettings();
  // Show skeleton immediately so the user sees structure right away
  showSkeletonCards();
  // Kick off all network requests in parallel.
  // Settings are applied from cache immediately above; the fresh fetch updates
  // in the background so it never blocks the library from rendering.
  const libraryPromise = loadLibrary();
  const heroPromise = loadWelcomeHero();
  applySiteSettings(); // fire-and-forget — cache already applied above
  // Override with user's stored preference (applied after site default is set)
  const storedOrder = localStorage.getItem(USER_ORDER_KEY);
  if (storedOrder) RELEASE_ORDER = storedOrder;
  const sortSelect = document.getElementById('sortOrderSelect');
  if (sortSelect) sortSelect.value = storedOrder || '';
  applyBranding();
  applyTipJarConfig();
  applyDesktopLayoutPreference();
  updateAlbumGalleryHeading(!state.currentAlbum);
  if (!state.audio) {
    state.audio = new Audio();
    // 'auto' buffers the full track so playback can continue even if the network
    // briefly drops while the page is backgrounded.
    state.audio.preload = 'auto';
    // Prevent iOS from hijacking the element into a native full-screen player,
    // which interferes with in-page JS control.
    state.audio.setAttribute('playsinline', '');
    state.audio.volume = Number(dom.volumeSlider?.value ?? 1);
  }
  // Tell the OS this is a music player (affects audio routing and CPU scheduling
  // on Chrome for Android 116+).
  if ('audioSession' in navigator) {
    try { navigator.audioSession.type = 'playback'; } catch (_) {}
  }
  ensureMediaSessionHandlers();
  if (!artworkEventsBound && dom.artwork) {
    dom.artwork.addEventListener('load', () => {
      dom.artwork.classList.remove('artwork-loading');
      if (state.currentTrack) applyColorPalette(state.currentTrack, dom.artwork.src);
    });
    dom.artwork.addEventListener('error', () => {
      dom.artwork.classList.remove('artwork-loading');
      if (state.currentTrack) applyNeutralTheme(state.currentTrack);
    });
    artworkEventsBound = true;
  }
  try {
    // By now the library fetch has had a head start — await may resolve instantly
    await libraryPromise;
    await heroPromise;
    updateFilters();
    renderAlbums();
    syncPlayModes();
    bindEvents();
    initPayments(); // non-blocking — fetches config, loads PayPal SDK, wires up paywall
    initHeroCollapse();
    const params = new URLSearchParams(window.location.search);
    const routeParams = getPathRouteParams();
    const sharedTrackParam = params.get('track') || params.get('id') || routeParams.track;
    const sharedTrackId = extractTrackId(sharedTrackParam);
    const albumParam = params.get('album') || params.get('albumId') || routeParams.album;
    const albumFromParam = findAlbum(albumParam);

    if (sharedTrackId) {
      const _parts = sharedTrackId.split('-');
      const sharedTrack = state.tracks.find(track => {
        const id = String(track._id);
        return id === sharedTrackId ||
          (_parts.length >= 2 && id === `${_parts[0]}-${_parts[1]}`) ||
          id === _parts[0];
      });
      if (sharedTrack) {
        setAlbum(albumFromParam || sharedTrack.albumId || sharedTrack.albumName);
        playTrack(sharedTrack, { autoplay: false });
      } else if (albumFromParam) {
        setAlbum(albumFromParam);
      } else {
        showAlbumGallery();
      }
    } else if (albumFromParam) {
      setAlbum(albumFromParam);
    } else {
      showAlbumGallery();
    }
    syncViewportLayout();
    syncPlayState();
    refreshDocumentMetadata();
  } catch (err) {
    console.error('Failed to load library', err);
    showToast('Could not load library — please refresh', 'error');
    dom.albumGalleryGrid.innerHTML = '';
  }
}

// ── Collapsible featured release hero ────────────────────────────
const HERO_COLLAPSED_KEY = 'tmc-hero-collapsed';

function initHeroCollapse() {
  const hero = dom.welcomeHero;
  const toggleBtn = document.getElementById('heroToggleBtn');
  const showBar = document.getElementById('heroShowBar');
  if (!hero || !toggleBtn || !showBar) return;

  const isCollapsed = localStorage.getItem(HERO_COLLAPSED_KEY) === 'true';
  applyHeroCollapseState(isCollapsed, false);

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setHeroCollapsed(true);
  });
  showBar.addEventListener('click', () => setHeroCollapsed(false));
}

function applyHeroCollapseState(collapsed, animate = true) {
  const hero = dom.welcomeHero;
  const showBar = document.getElementById('heroShowBar');
  if (!hero || !showBar) return;
  if (!animate) {
    hero.style.transition = 'none';
    requestAnimationFrame(() => { hero.style.transition = ''; });
  }
  hero.classList.toggle('hero-collapsed', collapsed);
  showBar.classList.toggle('hidden', !collapsed);
}

function setHeroCollapsed(collapsed) {
  try { localStorage.setItem(HERO_COLLAPSED_KEY, String(collapsed)); } catch (_) {}
  applyHeroCollapseState(collapsed);
}

init();
