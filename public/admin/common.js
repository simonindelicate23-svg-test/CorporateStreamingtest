(function () {
  const CACHE_PREFIX = 'admin-cache-v1';
  const DEFAULT_TTL_MS = 5 * 60 * 1000;

  const tabs = [
    { href: 'admin-settings.html', label: 'Site Settings' },
    { href: 'insert.html', label: 'Add Tracks' },
    { href: 'edit.html', label: 'Track Directory' },
    { href: 'edit-albums.html', label: 'Edit Releases' }
  ];

  function normalizePage(pathname) {
    return pathname.split('/').pop() || 'edit.html';
  }

  function mountTabs() {
    const host = document.querySelector('[data-admin-tabs]');
    if (!host) return;
    const current = normalizePage(window.location.pathname);
    const nav = document.createElement('nav');
    nav.className = 'admin-tabs';

    tabs.forEach((tab) => {
      const link = document.createElement('a');
      link.href = tab.href;
      link.textContent = tab.label;
      link.className = 'admin-tab';
      if (current === tab.href) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
      nav.appendChild(link);
    });

    host.appendChild(nav);
  }

  function loadCache(key, ttlMs = DEFAULT_TTL_MS) {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}:${key}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.at || !('data' in parsed)) return null;
      if (Date.now() - parsed.at > ttlMs) return null;
      return parsed.data;
    } catch (_error) {
      return null;
    }
  }

  function saveCache(key, data) {
    localStorage.setItem(`${CACHE_PREFIX}:${key}`, JSON.stringify({ at: Date.now(), data }));
  }

  async function fetchJsonCached(url, key, options = {}) {
    const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    if (!options.bypassCache) {
      const cached = loadCache(key, ttlMs);
      if (cached) return cached;
    }

    const response = await fetch(url, options.fetchOptions || {});
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();
    saveCache(key, data);
    return data;
  }

  function invalidateCache(keys) {
    keys.forEach((key) => localStorage.removeItem(`${CACHE_PREFIX}:${key}`));
  }


  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || `Request failed: ${response.status}`);
    }
    return payload;
  }

  function inferTrackNameFromUrl(url) {
    try {
      const pathname = new URL(url, window.location.origin).pathname;
      const fileName = decodeURIComponent(pathname.split('/').pop() || '');
      return fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    } catch (_error) {
      return '';
    }
  }

  async function deriveDurationFromUrl(url) {
    if (!url) return null;

    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      let finished = false;
      const done = (value) => {
        if (finished) return;
        finished = true;
        audio.removeAttribute('src');
        audio.load();
        resolve(value);
      };

      const timer = setTimeout(() => done(null), 9000);
      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', () => {
        clearTimeout(timer);
        const seconds = Math.round(audio.duration || 0);
        done(seconds > 0 ? seconds : null);
      }, { once: true });
      audio.addEventListener('error', () => {
        clearTimeout(timer);
        done(null);
      }, { once: true });
      audio.src = url;
    });
  }

  window.AdminDataStore = { mountTabs, fetchJsonCached, invalidateCache, requestJson, inferTrackNameFromUrl, deriveDurationFromUrl };
})();
