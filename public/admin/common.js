(function () {
  const CACHE_PREFIX = 'admin-cache-v1';
  const DEFAULT_TTL_MS = 5 * 60 * 1000;
  const TOKEN_KEY = 'admin-token';
  const LOGIN_PAGE = '/admin-login.html';

  const tabs = [
    { href: 'admin-settings.html', label: 'Site Settings' },
    { href: 'insert.html', label: 'Add Tracks' },
    { href: 'edit.html', label: 'Track Directory' },
    { href: 'edit-albums.html', label: 'Edit Releases' },
    { href: 'admin-pseudo-albums.html', label: 'Pseudo Albums' }
  ];

  function normalizePage(pathname) {
    return pathname.split('/').pop() || 'edit.html';
  }

  /* ── Token helpers ────────────────────────────────────────── */
  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function redirectToLogin() {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `${LOGIN_PAGE}?return=${returnTo}`;
  }

  /* ── Auth guard ───────────────────────────────────────────── */
  function requireAuth() {
    if (!getToken()) {
      redirectToLogin();
    }
  }

  /* ── Admin header ─────────────────────────────────────────── */
  function mountHeader() {
    requireAuth();
    const host = document.querySelector('[data-admin-header]');
    if (!host) return;
    const header = document.createElement('header');
    header.className = 'admin-header';

    const brand = document.createElement('div');
    brand.className = 'admin-header__brand';
    brand.innerHTML = 'Music Admin <span>Admin</span>';

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:16px;';

    const back = document.createElement('a');
    back.className = 'admin-header__back';
    back.href = '/player.html';
    back.innerHTML = '&#8592; Back to site';

    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Sign out';
    logoutBtn.style.cssText = 'background:none;border:1px solid rgba(0,0,0,0.15);color:#555;padding:5px 12px;font-size:0.82rem;font-weight:600;border-radius:6px;cursor:pointer;box-shadow:none;';
    logoutBtn.addEventListener('click', () => { clearToken(); redirectToLogin(); });
    right.appendChild(logoutBtn);

    right.appendChild(back);
    header.appendChild(brand);
    header.appendChild(right);
    host.appendChild(header);
  }

  /* ── Tab navigation ───────────────────────────────────────── */
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

  /* ── Cache ────────────────────────────────────────────────── */
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

    const token = getToken();
    const headers = token ? { 'X-Admin-Token': token } : {};
    const response = await fetch(url, {
      headers,
      ...(options.bypassCache ? { cache: 'reload' } : {}),
      ...(options.fetchOptions || {}),
    });

    if (response.status === 401) {
      redirectToLogin();
      throw new Error('Unauthorized');
    }
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

  /* ── Fetch wrapper with auth ──────────────────────────────── */
  async function requestJson(url, options = {}) {
    const token = getToken();
    const authHeader = token ? { 'X-Admin-Token': token } : {};
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...authHeader, ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      redirectToLogin();
      throw new Error('Unauthorized');
    }
    if (!response.ok) {
      throw new Error(payload?.message || `Request failed: ${response.status}`);
    }
    return payload;
  }

  /* ── Utilities ────────────────────────────────────────────── */
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

  window.AdminDataStore = {
    mountHeader,
    mountTabs,
    requireAuth,
    fetchJsonCached,
    invalidateCache,
    requestJson,
    inferTrackNameFromUrl,
    deriveDurationFromUrl,
    getToken,
    setToken,
    clearToken,
  };
})();
