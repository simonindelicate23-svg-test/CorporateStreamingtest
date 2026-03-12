/**
 * Smart PWA install prompt.
 * - Chrome Android : intercepts beforeinstallprompt and shows a native-trigger button.
 * - Samsung Browser: explains the Play Protect warning and redirects to Chrome.
 * - iOS Safari     : shows the Share → Add to Home Screen instruction.
 * - Already installed (standalone mode): does nothing.
 * Controlled by the pwaInstallPrompt site setting (admin can disable it).
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
  const isSamsung  = /SamsungBrowser/i.test(ua);
  const isIOS      = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isIOSSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua);
  // Chrome Android — exclude Samsung, Edge, Opera which also include "Chrome/"
  const isChrome   = /Chrome\//.test(ua) && /Android/.test(ua) && !isSamsung && !/EdgA|OPR\//.test(ua);

  if (!isChrome && !isSamsung && !isIOSSafari) return;

  let deferredPrompt = null;
  let bannerShown    = false;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #pwa-install-banner {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 2000;
      padding: 0 16px 16px;
      pointer-events: none;
    }
    /* Push banner above the now-playing bar when it's visible */
    .np-bar-visible #pwa-install-banner {
      bottom: var(--now-playing-height, 72px);
    }
    #pwa-install-card {
      background: var(--panel-surface, rgba(18,15,25,0.97));
      border: 1px solid var(--border, rgba(255,255,255,0.1));
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.38);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: all;
      animation: pwa-slide-up 0.28s cubic-bezier(0.34,1.2,0.64,1) both;
    }
    @keyframes pwa-slide-up {
      from { transform: translateY(24px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    #pwa-install-icon {
      width: 44px; height: 44px;
      border-radius: 10px;
      object-fit: cover;
      flex-shrink: 0;
      background: var(--control-surface, rgba(255,255,255,0.08));
    }
    #pwa-install-text {
      flex: 1;
      min-width: 0;
    }
    #pwa-install-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--ink, #f5f2fb);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin: 0 0 2px;
      font-family: var(--font-body, system-ui, sans-serif);
    }
    #pwa-install-body {
      font-size: 0.75rem;
      color: var(--muted, #bfb6d3);
      margin: 0;
      font-family: var(--font-body, system-ui, sans-serif);
      line-height: 1.4;
    }
    #pwa-install-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      align-items: center;
    }
    .pwa-btn {
      font-size: 0.78rem;
      font-weight: 600;
      padding: 7px 14px;
      border-radius: 20px;
      border: none;
      cursor: pointer;
      white-space: nowrap;
      font-family: var(--font-body, system-ui, sans-serif);
    }
    .pwa-btn-primary {
      background: var(--accent, #9a6bff);
      color: #fff;
    }
    .pwa-btn-dismiss {
      background: transparent;
      color: var(--muted, #bfb6d3);
      padding: 7px 8px;
      font-size: 1rem;
      line-height: 1;
    }
  `;
  document.head.appendChild(style);

  // ── DOM builder ───────────────────────────────────────────────────────────
  function buildBanner(settings) {
    const appName = settings.pwaName || settings.brandName || settings.siteTitle || 'This app';
    const iconSrc = settings.pwaIcon192 || settings.pwaIcon512 || '/sigil.png';

    let title, body, actionHtml;

    if (isChrome) {
      title = 'Add to your home screen';
      body  = `Install ${appName} for the full app experience.`;
      actionHtml = `<button class="pwa-btn pwa-btn-primary" id="pwa-install-btn">Install</button>`;
    } else if (isSamsung) {
      title = 'Install without the warning';
      body  = 'Samsung Browser shows a Play Protect alert for all web apps. Open in Chrome to install warning-free.';
      const currentUrl = encodeURIComponent(location.href);
      actionHtml = `<a class="pwa-btn pwa-btn-primary" href="intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end">Open in Chrome</a>`;
    } else if (isIOSSafari) {
      title = 'Add to your home screen';
      body  = `Tap the Share button below, then "Add to Home Screen" to install ${appName}.`;
      actionHtml = `<span style="font-size:1.2rem;padding:4px 2px;" aria-hidden="true">⬆️</span>`;
    }

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'App install prompt');
    banner.innerHTML = `
      <div id="pwa-install-card">
        <img id="pwa-install-icon" src="${iconSrc}" alt="" aria-hidden="true" />
        <div id="pwa-install-text">
          <p id="pwa-install-title">${title}</p>
          <p id="pwa-install-body">${body}</p>
        </div>
        <div id="pwa-install-actions">
          ${actionHtml}
          <button class="pwa-btn pwa-btn-dismiss" id="pwa-dismiss-btn" aria-label="Dismiss install prompt">✕</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);

    // Chrome install button
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn && deferredPrompt) {
      installBtn.addEventListener('click', async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        dismiss();
      });
    } else if (installBtn) {
      // beforeinstallprompt hasn't fired yet — hide button until it does
      installBtn.style.display = 'none';
      window.addEventListener('beforeinstallprompt', () => {
        installBtn.style.display = '';
      }, { once: true });
    }

    document.getElementById('pwa-dismiss-btn').addEventListener('click', dismiss);
    bannerShown = true;
  }

  function dismiss() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  // Intercept Chrome's native prompt early (before DOMContentLoaded).
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // If the banner is already showing, reveal the install button now.
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = '';
  });

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      // Already dismissed this session
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch (_) {}

    try {
      const s = (typeof window.SiteSettings?.loadSiteSettings === 'function')
        ? await window.SiteSettings.loadSiteSettings()
        : {};

      // Admin can disable the prompt entirely
      if (s.pwaInstallPrompt === false) return;

      buildBanner(s);
    } catch (_) {}
  });
})();
