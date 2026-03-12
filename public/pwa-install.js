/**
 * Smart PWA install prompt.
 * - Chrome Android : triggers native beforeinstallprompt; falls back to ⋮ menu hint.
 * - Samsung Browser: explains the Play Protect warning and deep-links to Chrome.
 * - iOS Safari     : shows the Share → Add to Home Screen instruction.
 * - Already installed (standalone mode): silent.
 * Admin toggle: pwaInstallPrompt site setting.
 */
(function () {
  'use strict';

  // Already running as installed PWA — nothing to do.
  if (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  ) return;

  const DISMISS_KEY = 'pwa-install-dismissed-v1';
  const ua = navigator.userAgent || '';
  const isSamsung   = /SamsungBrowser/i.test(ua);
  const isIOS       = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isIOSSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua);
  // Chrome on Android — exclude Samsung, Edge, Opera
  const isChrome    = /Chrome\//.test(ua) && /Android/.test(ua) && !isSamsung && !/EdgA|OPR\//.test(ua);

  if (!isChrome && !isSamsung && !isIOSSafari) return;

  let deferredPrompt = null;

  // Capture Chrome's install event as early as possible.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // If the button is already rendered but hidden, reveal it now.
    const btn = document.getElementById('pwa-install-btn');
    if (btn) { btn.style.display = ''; btn.textContent = 'Install'; }
  });

  // ── Styles ─────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #pwa-install-banner {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 2000;
      padding: 0 12px 12px;
      pointer-events: none;
      box-sizing: border-box;
    }
    .np-bar-visible #pwa-install-banner {
      bottom: var(--now-playing-height, 72px);
    }
    #pwa-install-card {
      background: var(--panel-surface, rgba(18,15,25,0.97));
      border: 1px solid var(--border, rgba(255,255,255,0.12));
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.42);
      padding: 14px 14px 12px;
      pointer-events: all;
      animation: pwa-slide-up 0.28s cubic-bezier(0.34,1.2,0.64,1) both;
      max-width: 480px;
      margin: 0 auto;
    }
    @keyframes pwa-slide-up {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    #pwa-install-top {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    #pwa-install-icon {
      width: 36px; height: 36px;
      border-radius: 8px;
      object-fit: cover;
      flex-shrink: 0;
      background: var(--control-surface, rgba(255,255,255,0.08));
    }
    #pwa-install-title {
      flex: 1;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--ink, #f5f2fb);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--font-body, system-ui, sans-serif);
    }
    #pwa-dismiss-btn {
      background: transparent;
      border: none;
      color: var(--muted, #bfb6d3);
      font-size: 1rem;
      line-height: 1;
      padding: 4px 6px;
      cursor: pointer;
      flex-shrink: 0;
      border-radius: 6px;
    }
    #pwa-install-body {
      font-size: 0.78rem;
      color: var(--muted, #bfb6d3);
      margin: 0 0 10px;
      font-family: var(--font-body, system-ui, sans-serif);
      line-height: 1.45;
    }
    #pwa-install-bottom {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .pwa-btn-primary {
      font-size: 0.8rem;
      font-weight: 600;
      padding: 8px 18px;
      border-radius: 20px;
      border: none;
      cursor: pointer;
      background: var(--accent, #9a6bff);
      color: #fff;
      font-family: var(--font-body, system-ui, sans-serif);
      text-decoration: none;
      display: inline-block;
      line-height: 1;
    }
  `;
  document.head.appendChild(style);

  // ── Build banner ───────────────────────────────────────────────────────────
  function buildBanner(settings) {
    const appName = settings.pwaName || settings.brandName || settings.siteTitle || 'This app';
    const iconSrc = settings.pwaIcon192 || settings.pwaIcon512 || '/sigil.png';

    let body, actionHtml;

    if (isChrome) {
      body = `Install <strong>${appName}</strong> as an app for the best experience — no browser chrome, works offline.`;
      // Show the button; it may be hidden below if deferredPrompt is null.
      actionHtml = `<button class="pwa-btn-primary" id="pwa-install-btn">Install</button>`;
    } else if (isSamsung) {
      body = `Samsung Browser shows a Google Play Protect warning for all web apps. Open this page in Chrome to install without any warning.`;
      const intentUrl = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=${location.protocol.replace(':','')};package=com.android.chrome;end`;
      actionHtml = `<a class="pwa-btn-primary" href="${intentUrl}">Open in Chrome</a>`;
    } else if (isIOSSafari) {
      body = `To install <strong>${appName}</strong>, tap the Share button (the box with the arrow), then choose <strong>Add to Home Screen</strong>.`;
      actionHtml = ``;
    }

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'App install prompt');
    banner.innerHTML = `
      <div id="pwa-install-card">
        <div id="pwa-install-top">
          <img id="pwa-install-icon" src="${iconSrc}" alt="" aria-hidden="true" />
          <p id="pwa-install-title">${appName}</p>
          <button id="pwa-dismiss-btn" aria-label="Dismiss">✕</button>
        </div>
        <p id="pwa-install-body">${body}</p>
        ${actionHtml ? `<div id="pwa-install-bottom">${actionHtml}</div>` : ''}
      </div>
    `;
    document.body.appendChild(banner);

    // Dismiss button
    document.getElementById('pwa-dismiss-btn').addEventListener('click', dismiss);

    // Chrome install logic
    if (isChrome) {
      const btn = document.getElementById('pwa-install-btn');
      if (!deferredPrompt) {
        // beforeinstallprompt hasn't fired (Chrome cooldown after uninstall, or
        // criteria not yet met) — show browser-menu fallback immediately.
        showMenuFallback();
      } else {
        btn.addEventListener('click', handleInstallClick);
      }
    }
  }

  async function handleInstallClick() {
    const btn = document.getElementById('pwa-install-btn');
    if (!deferredPrompt) { showMenuFallback(); return; }
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === 'accepted') {
        dismiss();
      } else {
        // User cancelled the native dialog — offer the browser menu as fallback.
        showMenuFallback();
      }
    } catch (_) {
      deferredPrompt = null;
      showMenuFallback();
    }
  }

  function showMenuFallback() {
    const body = document.getElementById('pwa-install-body');
    const btn  = document.getElementById('pwa-install-btn');
    if (body) body.innerHTML = `Tap the browser menu <strong>⋮</strong> (top right), then choose <strong>Add to Home Screen</strong>.`;
    if (btn)  btn.style.display = 'none';
  }

  function dismiss() {
    document.getElementById('pwa-install-banner')?.remove();
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
  }

  // ── Entry ──────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async () => {
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch (_) {}
    try {
      const s = typeof window.SiteSettings?.loadSiteSettings === 'function'
        ? await window.SiteSettings.loadSiteSettings()
        : {};
      if (s.pwaInstallPrompt === false) return;
      buildBanner(s);
    } catch (_) {}
  });
})();
