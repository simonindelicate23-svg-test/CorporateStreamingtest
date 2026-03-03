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
const INITIAL_BACKGROUND = playerConfig?.initialBackgroundColor || '#f7f5f0';
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
  document.body.style.backgroundColor = baseColor;
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


async function applySiteSettings() {
  try {
    const response = await fetch('/.netlify/functions/siteSettings', { cache: 'no-cache' });
    if (!response.ok) return;
    const settings = await response.json();
    SITE_TITLE = settings.siteTitle || SITE_TITLE;
    BRAND_NAME = settings.brandName || BRAND_NAME;
    DEFAULT_META_DESCRIPTION = settings.metaDescription || DEFAULT_META_DESCRIPTION;
    BRAND_LOGO_URL = settings.logoUrl || BRAND_LOGO_URL;
    const faviconHref = settings.faviconUrl || '/favicon.ico';
    const faviconEl = document.querySelector('link[rel="icon"]') || (() => { const el = document.createElement('link'); el.rel = 'icon'; document.head.appendChild(el); return el; })();
    faviconEl.href = faviconHref;
    const rootStyle = document.documentElement.style;
    if (settings.themeBackground) rootStyle.setProperty('--paper', settings.themeBackground);
    if (settings.themePanelSurface) rootStyle.setProperty('--panel-surface', settings.themePanelSurface);
    if (settings.themeTopbarSurface) rootStyle.setProperty('--nav-surface', settings.themeTopbarSurface);
    if (settings.themeControlSurface) rootStyle.setProperty('--control-surface', settings.themeControlSurface);
    if (settings.themeCardSurface || settings.themeSurface) rootStyle.setProperty('--card', settings.themeCardSurface || settings.themeSurface);
    if (settings.themeCardContrast) rootStyle.setProperty('--card-contrast', settings.themeCardContrast);
    if (settings.themeText) rootStyle.setProperty('--ink', settings.themeText);
    if (settings.themeMutedText) rootStyle.setProperty('--muted', settings.themeMutedText);
    if (settings.themeAccent) rootStyle.setProperty('--accent', settings.themeAccent);
    if (settings.themeBorder) rootStyle.setProperty('--border', settings.themeBorder);
    if (settings.dynamicColorTheming !== undefined) dynamicThemingEnabled = settings.dynamicColorTheming !== false;
    WELCOME_ALBUM_TITLE = settings.welcomeTitle || WELCOME_ALBUM_TITLE;
    WELCOME_ALBUM_SUBTITLE = settings.welcomeSubtitle || WELCOME_ALBUM_SUBTITLE;
    ABOUT_LINK_LABEL = settings.aboutLinkLabel || ABOUT_LINK_LABEL;
    if (dom.aboutSiteLink) dom.aboutSiteLink.textContent = ABOUT_LINK_LABEL;
    const footerSummary = document.querySelector('.footer-disclosure summary');
    if (footerSummary && settings.footerSummary) footerSummary.innerHTML = settings.footerSummary;
    const footerContent = document.querySelector('.default-footer');
    if (footerContent && settings.footerContent) footerContent.innerHTML = settings.footerContent;
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
    const finalize = () => resolve(url);
    audio.addEventListener('canplaythrough', finalize, { once: true });
    audio.addEventListener('error', finalize, { once: true });
  });

  audioPreloadCache.set(url, loadPromise);
  return loadPromise;
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
  const fallbackBg = track?.bgcolor || INITIAL_BACKGROUND;
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
      state.audio.play().finally(syncPlayState);
    }
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    if (!state.audio?.paused) {
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
    state.audio.currentTime = Math.min(Math.max(event.seekTime, 0), state.audio.duration || 0);
    if (event.fastSeek && 'fastSeek' in state.audio) {
      state.audio.fastSeek(event.seekTime);
    }
    updateMediaSessionPositionState();
  });

  navigator.mediaSession.setActionHandler('stop', () => {
    if (!state.audio) return;
    state.audio.pause();
    state.audio.currentTime = 0;
    syncPlayState();
  });

  mediaSessionHandlersBound = true;
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
  } else if (album.allTracks) {
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

function albumCoverFor(album) {
  if (album.albumArtworkUrl) return album.albumArtworkUrl;
  if (album.artworkUrl) return album.artworkUrl;
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
  const url = new URL(window.location.href);
  url.searchParams.delete('album');
  url.searchParams.delete('track');
  history.replaceState(null, '', url);
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

function renderAlbums() {
  dom.albumGalleryGrid.innerHTML = '';
  state.albums
    .filter(matchesFilters)
    .forEach(album => {
      const card = document.createElement('article');
      card.className = 'album-card';
      const cover = document.createElement('div');
      cover.className = 'album-card-cover';
      const artwork = albumCoverFor(album);
      if (artwork) {
        cover.style.backgroundImage = `url(${artwork})`;
        cover.setAttribute('aria-label', `${album.albumName} cover`);
        preloadArtwork(artwork);
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
      dom.albumGalleryGrid.appendChild(card);
    });
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
    const li = document.createElement('li');
    li.className = 'track-item';
    li.dataset.id = track._id;
    const prefix = resolvedAlbum?.allTracks || resolvedAlbum?.pseudoType ? `${index + 1}.` : track.trackNumber ? `${track.trackNumber}.` : '';
    li.innerHTML = `<div>${prefix}</div><div>${track.trackName}</div>`;
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
    dom.albumDetailCover.style.backgroundImage = `url(${artwork})`;
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
  warmTrackAssets(albumTracks, 5);
  if (album.allTracks && album.enableShuffle) {
    state.queue.shuffleEnabled = true;
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

function openNowPlayingOverlay() {
  if (!state.currentTrack) return;
  if (state.currentTrack?.albumName) {
    setAlbum(state.currentTrack.albumName);
    highlightActiveTrack();
  }
  showOverlay();
}

function updatePlayerMeta(track) {
  dom.trackTitle.textContent = track.trackName || 'Untitled';
  dom.trackArtist.textContent = track.artistName || '';
  dom.trackAlbum.textContent = track.albumName || '';
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
    dom.artwork.src = safeArtwork || DEFAULT_ART_PLACEHOLDER;
  }
  if (dom.overlayArt) {
    dom.overlayArt.crossOrigin = 'anonymous';
    dom.overlayArt.src = safeArtwork || DEFAULT_ART_PLACEHOLDER;
  }

  if (dom.npArt) dom.npArt.style.backgroundImage = layers || '';
  if (dom.albumDetailCover) dom.albumDetailCover.style.backgroundImage = layers || '';
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
  if (dom.overlayAlbum) dom.overlayAlbum.textContent = track.albumName || '';
  refreshNowPlayingMarquee();
  dom.nowPlayingBar?.classList.remove('inactive');

  applyNeutralTheme(track);
  updateThemeBackground(currentBackgroundLayers);
  applyColorPalette(track, currentArtworkSrc);
  updateMediaSessionMetadata(track);
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
  const albumParam = state.currentTrack?.albumId || state.currentAlbumId || slugifyAlbumName(state.currentTrack?.albumName || state.currentAlbum);

  const shareUrl = buildShareUrl(state.currentTrack, albumParam);

  if (!shareUrl || !shareUrl.pathname) return;
  try {
    await navigator.clipboard.writeText(shareUrl.toString());
    if (dom.copyLinkButton) {
      const original = dom.copyLinkButton.getAttribute('aria-label') || 'Share track';
      dom.copyLinkButton.setAttribute('aria-label', 'Link copied');
      dom.copyLinkButton.title = 'Link copied';
      dom.copyLinkButton.classList.add('copied');
      setTimeout(() => {
        dom.copyLinkButton?.setAttribute('aria-label', original);
        if (dom.copyLinkButton) dom.copyLinkButton.title = original;
        dom.copyLinkButton?.classList.remove('copied');
      }, 2000);
    }
  } catch (err) {
    console.warn('Clipboard unavailable', err);
  }
}


function getPathRouteParams() {
  const segments = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!segments.length) return { album: null, track: null };

  const albumIndex = segments.indexOf('album');
  const trackIndex = segments.indexOf('track');

  const album = albumIndex >= 0 ? segments[albumIndex + 1] || null : null;
  const track = trackIndex >= 0 ? segments[trackIndex + 1] || null : null;

  return { album, track };
}

function extractTrackId(trackParam) {
  if (!trackParam) return null;
  return String(trackParam).split('-')[0] || null;
}

function resolveTrackUrl(track) {
  return (
    track?.mp3Url ||
    track?.url ||
    track?.audioUrl ||
    track?.fileUrl ||
    track?.streamUrl ||
    track?.downloadUrl ||
    track?.downloadURL ||
    track?.src
  );
}

function ensureQueueForTrack(track) {
  if (!state.queue) return;
  const albumContext =
    findAlbum(state.currentAlbumId || state.currentAlbum) ||
    findAlbum(track.albumId || track.albumName);
  const albumTracks = tracksForAlbum(albumContext || track.albumName);
  if (albumTracks.length) {
    state.queue.setItems(albumTracks, track._id);
  } else {
    state.queue.enqueue(track);
    state.queue.setCurrent(track);
  }
}

function primeAdjacentTracks(track) {
  if (!state.queue || !track) return;
  const items = state.queue.items || [];
  const currentIndex = state.queue.currentIndexFor(track._id);
  if (currentIndex === -1) {
    warmTrackAssets([track]);
    return;
  }

  const nearby = [track];
  if (currentIndex + 1 < items.length) nearby.push(items[currentIndex + 1]);
  if (currentIndex > 0) nearby.push(items[currentIndex - 1]);
  warmTrackAssets(nearby, 3);
}

function playTrack(track, { autoplay = true } = {}) {
  state.currentTrack = track;
  ensureQueueForTrack(track);
  const src = resolveTrackUrl(track);
  if (!src) {
    console.warn('No playable source for track', track);
    return;
  }
  state.audio.src = src;
  state.audio.currentTime = 0;
  updatePlayerMeta(track);
  primeAdjacentTracks(track);
  highlightActiveTrack();
  const shareUrl = buildShareUrl(track, track.albumId || state.currentAlbumId || slugifyAlbumName(track.albumName));
  if (shareUrl?.pathname) {
    history.replaceState(null, '', shareUrl.pathname + shareUrl.search);
  }
  refreshDocumentMetadata({ track });
  if (autoplay) {
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
    state.audio.play().finally(syncPlayState);
  } else {
    state.audio.pause();
    syncPlayState();
  }
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
  const previousAlbum = state.currentAlbum;
  const previousAlbumId = state.currentAlbumId;
  const previousTrackId = state.currentTrack?._id;
  const previousShuffle = state.queue?.shuffleEnabled;
  const previousRepeat = state.queue?.repeatEnabled;
  await loadLibrary();
  if (state.queue) {
    state.queue.shuffleEnabled = previousShuffle;
    state.queue.repeatEnabled = previousRepeat;
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
  dom.filterSearch?.addEventListener('input', e => {
    state.filters.search = e.target.value;
    renderAlbums();
  });
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
  state.audio.addEventListener('timeupdate', updateTime);
  state.audio.addEventListener('loadedmetadata', updateTime);
  state.audio.addEventListener('ended', () => {
    if (state.queue?.repeatEnabled) {
      state.audio.currentTime = 0;
      state.audio.play().finally(syncPlayState);
      return;
    }
    syncPlayState();
    changeTrack(1);
  });
  state.audio.addEventListener('play', syncPlayState);
  state.audio.addEventListener('playing', syncPlayState);
  state.audio.addEventListener('waiting', syncPlayState);
  state.audio.addEventListener('pause', syncPlayState);
}

export async function init() {
  initTheme();
  await applySiteSettings();
  applyBranding();
  applyTipJarConfig();
  applyDesktopLayoutPreference();
  updateAlbumGalleryHeading(!state.currentAlbum);
  if (!state.audio) {
    state.audio = new Audio();
    state.audio.preload = 'metadata';
    state.audio.volume = Number(dom.volumeSlider?.value ?? 1);
  }
  ensureMediaSessionHandlers();
  if (!artworkEventsBound && dom.artwork) {
    dom.artwork.addEventListener('load', () => {
      if (state.currentTrack) applyColorPalette(state.currentTrack, dom.artwork.src);
    });
    dom.artwork.addEventListener('error', () => {
      if (state.currentTrack) applyNeutralTheme(state.currentTrack);
    });
    artworkEventsBound = true;
  }
  try {
    const heroPromise = loadWelcomeHero();
    await loadLibrary();
    await heroPromise;
    updateFilters();
    renderAlbums();
    syncPlayModes();
    bindEvents();
    const params = new URLSearchParams(window.location.search);
    const routeParams = getPathRouteParams();
    const sharedTrackParam = params.get('track') || params.get('id') || routeParams.track;
    const sharedTrackId = extractTrackId(sharedTrackParam);
    const albumParam = params.get('album') || params.get('albumId') || routeParams.album;
    const albumFromParam = findAlbum(albumParam);

    if (sharedTrackId) {
      const sharedTrack = state.tracks.find(track => String(track._id) === String(sharedTrackId));
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
  }
}

init();
