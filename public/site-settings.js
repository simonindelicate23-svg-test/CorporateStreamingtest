(function () {
  const FONT_PAIRS = {
    // ── Sans-serif pairs ────────────────────────────────────────
    'inter-plus-jakarta-sans': {
      label: 'Clean modern — Inter + Plus Jakarta Sans',
      body: "'Inter', system-ui, sans-serif",
      heading: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"
    },
    'manrope-space-grotesk': {
      label: 'Geometric studio — Manrope + Space Grotesk',
      body: "'Manrope', system-ui, sans-serif",
      heading: "'Space Grotesk', 'Manrope', system-ui, sans-serif"
    },
    'dm-sans-outfit': {
      label: 'Contemporary UI — DM Sans + Outfit',
      body: "'DM Sans', system-ui, sans-serif",
      heading: "'Outfit', 'DM Sans', system-ui, sans-serif"
    },
    'work-sans-poppins': {
      label: 'Balanced product — Work Sans + Poppins',
      body: "'Work Sans', system-ui, sans-serif",
      heading: "'Poppins', 'Work Sans', system-ui, sans-serif"
    },
    'source-sans-3-rubik': {
      label: 'Friendly utility — Source Sans 3 + Rubik',
      body: "'Source Sans 3', system-ui, sans-serif",
      heading: "'Rubik', 'Source Sans 3', system-ui, sans-serif"
    },
    'nunito-montserrat': {
      label: 'Warm punchy — Nunito + Montserrat',
      body: "'Nunito', system-ui, sans-serif",
      heading: "'Montserrat', 'Nunito', system-ui, sans-serif"
    },
    'lato-raleway': {
      label: 'Classic web — Lato + Raleway',
      body: "'Lato', system-ui, sans-serif",
      heading: "'Raleway', 'Lato', system-ui, sans-serif"
    },
    'open-sans-oswald': {
      label: 'Editorial sans — Open Sans + Oswald',
      body: "'Open Sans', system-ui, sans-serif",
      heading: "'Oswald', 'Open Sans', system-ui, sans-serif"
    },
    'karla-cabin': {
      label: 'Indie neutral — Karla + Cabin',
      body: "'Karla', system-ui, sans-serif",
      heading: "'Cabin', 'Karla', system-ui, sans-serif"
    },
    'raleway-source-sans': {
      label: 'Airy editorial — Raleway + Source Sans 3',
      body: "'Source Sans 3', system-ui, sans-serif",
      heading: "'Raleway', system-ui, sans-serif"
    },
    // ── Serif / mixed pairs ─────────────────────────────────────
    'inter-merriweather': {
      label: 'Readable contrast — Inter + Merriweather',
      body: "'Inter', system-ui, sans-serif",
      heading: "'Merriweather', 'Inter', serif"
    },
    'playfair-source-sans': {
      label: 'Vinyl editorial — Playfair Display + Source Sans 3',
      body: "'Source Sans 3', system-ui, sans-serif",
      heading: "'Playfair Display', Georgia, serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&display=swap'
    },
    'crimson-karla': {
      label: 'Literary warmth — Crimson Pro + Karla',
      body: "'Crimson Pro', Georgia, serif",
      heading: "'Karla', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&display=swap'
    },
    'roboto-slab-lato': {
      label: 'Slab retro — Roboto Slab + Lato',
      body: "'Lato', system-ui, sans-serif",
      heading: "'Roboto Slab', Georgia, serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;500;700&display=swap'
    },
    'cormorant-nunito': {
      label: 'Elegant contrast — Cormorant Garamond + Nunito',
      body: "'Nunito', system-ui, sans-serif",
      heading: "'Cormorant Garamond', Georgia, serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap'
    },
    // ── Display / technical ─────────────────────────────────────
    'space-mono-dm-sans': {
      label: 'Monospace tech — Space Mono + DM Sans',
      body: "'DM Sans', system-ui, sans-serif",
      heading: "'Space Mono', 'Courier New', monospace",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap'
    },
    'barlow-condensed-inter': {
      label: 'Compressed editorial — Barlow Condensed + Inter',
      body: "'Inter', system-ui, sans-serif",
      heading: "'Barlow Condensed', 'Work Sans', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&display=swap'
    },
    'rajdhani-inter': {
      label: 'Futuristic display — Rajdhani + Inter',
      body: "'Inter', system-ui, sans-serif",
      heading: "'Rajdhani', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&display=swap'
    },
  };

  const DEFAULT_FONT_PAIR = 'inter-plus-jakarta-sans';

  async function loadSiteSettings() {
    try {
      const response = await fetch('/.netlify/functions/siteSettings', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Failed to load');
      return await response.json();
    } catch (_error) {
      return {};
    }
  }

  function text(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  function applyFontPair(fontPair) {
    const selectedPair = FONT_PAIRS[fontPair] || FONT_PAIRS[DEFAULT_FONT_PAIR];
    document.documentElement.style.setProperty('--font-body', selectedPair.body);
    document.documentElement.style.setProperty('--font-heading', selectedPair.heading);
    if (selectedPair.googleFontsUrl) {
      const id = 'gf-' + fontPair;
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = selectedPair.googleFontsUrl;
        document.head.appendChild(link);
      }
    }
  }

  window.SiteSettings = { loadSiteSettings, text, applyFontPair, FONT_PAIRS, DEFAULT_FONT_PAIR };
})();
