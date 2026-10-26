/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [require('path').join(__dirname, 'src/**/*.{ts,tsx}').split('\\').join('/')],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: 'var(--brand)', soft: 'var(--brand-soft)' },
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)', muted: 'var(--ink-2)' },
        paper: 'var(--paper)',
        up: 'var(--up)',
        down: 'var(--down)',
        // accessibility remap (docs/DESIGN.md): the two slate steps the UI used for captions were 2.56:1 and 1.48:1 on white.
        // Mapping them here fixes every existing `text-slate-400` / `text-slate-300` at once (5.2:1 and 2.1:1 → decorative only).
        slate: { ...require('tailwindcss/colors').slate, 300: '#b8bfc9', 400: '#636d7c', 500: '#525b66', 600: '#3f4854' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
