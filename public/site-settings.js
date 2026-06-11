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
    // ── Novelty / character ─────────────────────────────────────
    'exo2-inter': {
      label: 'Deep space — Exo 2 + Inter',
      body: "'Inter', system-ui, sans-serif",
      heading: "'Exo 2', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700&display=swap'
    },
    'orbitron-raleway': {
      label: 'Retro-future — Orbitron + Raleway',
      body: "'Raleway', system-ui, sans-serif",
      heading: "'Orbitron', system-ui, sans-serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&display=swap'
    },
    'eb-garamond-inter': {
      label: 'Noir letterpress — EB Garamond + Inter',
      body: "'Inter', system-ui, sans-serif",
      heading: "'EB Garamond', Georgia, serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400&display=swap'
    },
    'vt323-inter': {
      label: 'Analog horror — VT323 + Inter',
      body: "'Inter', system-ui, sans-serif",
      heading: "'VT323', 'Courier New', monospace",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=VT323&display=swap'
    },
    'metal-mania-cinzel': {
      label: 'Heavy metal — Metal Mania + Cinzel',
      body: "'Cinzel', Georgia, serif",
      heading: "'Metal Mania', Georgia, serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Metal+Mania&family=Cinzel:wght@400;600;700&display=swap'
    },
    'pacifico-lato': {
      label: 'Tropical exotica — Pacifico + Lato',
      body: "'Lato', system-ui, sans-serif",
      heading: "'Pacifico', cursive",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Pacifico&display=swap'
    },
    'im-fell-crimson': {
      label: 'Old cartography — IM Fell English + Crimson Pro',
      body: "'Crimson Pro', Georgia, serif",
      heading: "'IM Fell English', Georgia, serif",
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&display=swap'
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

  const TEXTURES = {
    none:      { label: 'None',      bgImage: 'none', bgSize: 'auto' },
    grain:     { label: 'Grain',     bgImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")", bgSize: '300px 300px' },
    scanlines: { label: 'Scanlines', bgImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 4px)', bgSize: 'auto' },
    grid:      { label: 'Grid',      bgImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', bgSize: '24px 24px' },
    dots:      { label: 'Dots',      bgImage: 'radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)', bgSize: '16px 16px' },
    linen:     { label: 'Linen',     bgImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.18) 3px, rgba(255,255,255,0.18) 4px), repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.18) 3px, rgba(255,255,255,0.18) 4px)', bgSize: 'auto' },
    diagonal:  { label: 'Diagonal',  bgImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.28) 6px, rgba(255,255,255,0.28) 7px)', bgSize: 'auto' },
  };

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

  function applyTexture(key) {
    const tx = TEXTURES[key] || TEXTURES.none;
    document.documentElement.style.setProperty('--bg-texture', tx.bgImage);
    document.documentElement.style.setProperty('--bg-texture-size', tx.bgSize);
  }

  function applyCustomCss(css) {
    const id = 'tmc-custom-css';
    let el = document.getElementById(id);
    if (!css) { if (el) el.textContent = ''; return; }
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = css.replace(/<\/style\b/gi, '');
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

  window.SiteSettings = { loadSiteSettings, text, applyFontPair, applyTexture, applyCustomCss, FONT_PAIRS, DEFAULT_FONT_PAIR, TEXTURES };
})();
