(function () {
  async function loadSiteSettings() {
    try {
      const response = await fetch(`/.netlify/functions/siteSettings?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load');
      return await response.json();
    } catch (_error) {
      return {};
    }
  }

  function text(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  window.SiteSettings = { loadSiteSettings, text };
})();
