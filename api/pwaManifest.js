const { loadSiteSettings } = require('./lib/siteSettingsStore');

exports.handler = async () => {
  try {
    const s = await loadSiteSettings();

    const name = s.pwaName || s.brandName || s.siteTitle || 'Music Player';
    const shortName = s.pwaShortName || s.brandName || s.siteTitle || 'Music';
    const description = s.pwaDescription || s.metaDescription || 'Listen to tracks and albums.';
    const themeColor = s.pwaThemeColor || s.themeTopbarSurface || s.themeBackground || '#0f0c14';
    const backgroundColor = s.pwaBackgroundColor || s.themeBackground || '#0f0c14';

    const icons = [
      { src: '/icon_192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon_512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon_512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ];

    // Admin-provided screenshots (helps Chrome show the richer install UI
    // without the "unverified publisher" warning style banner).
    const screenshots = [];
    if (s.pwaScreenshot1) {
      screenshots.push({
        src: s.pwaScreenshot1,
        sizes: s.pwaScreenshot1Sizes || '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
        label: name
      });
    }
    if (s.pwaScreenshot2) {
      screenshots.push({
        src: s.pwaScreenshot2,
        sizes: s.pwaScreenshot2Sizes || '1280x800',
        type: 'image/png',
        form_factor: 'wide',
        label: name
      });
    }

    const manifest = {
      id: '/',
      name,
      short_name: shortName,
      description,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      display_override: ['window-controls-overlay', 'standalone'],
      background_color: backgroundColor,
      theme_color: themeColor,
      categories: ['music', 'entertainment'],
      icons,
      ...(screenshots.length ? { screenshots } : {})
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/manifest+json',
        // Short cache so the manifest is fresh but doesn't hammer the function.
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
      },
      body: JSON.stringify(manifest)
    };
  } catch (err) {
    console.error('pwaManifest error', err);
    return { statusCode: 500, body: 'Internal error generating manifest' };
  }
};
