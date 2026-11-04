/** @type {import('tailwindcss').Config} */
// Colour remaps (docs/DESIGN.md › Ruler glass pass): the slate, red, amber and emerald steps the components already use are
// pointed at the Ruler greys and the design system's feedback colours, so every existing screen follows the new look
// without touching its class names. Text steps keep at least 4.5:1 on glass; grey 50 (#7c7c7a) is never a text colour.
const colors = require('tailwindcss/colors');
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
        slate: { ...colors.slate, 50: '#f2f2f0', 100: '#e8e8e6', 200: '#d8d8d6', 300: '#a1a19f', 400: '#575756', 500: '#575756', 600: '#333332', 700: '#333332', 800: '#1f1f1e', 900: '#0e0e0e' },
        red: { ...colors.red, 50: '#f7e6e5', 100: '#f0d2d0', 200: '#e4aca8', 400: '#c22a26', 500: '#a80100', 600: '#a80100', 700: '#a80100', 800: '#7d0100' },
        amber: { ...colors.amber, 50: '#f6eedd', 100: '#efe1c2', 200: '#e2c890', 400: '#c08a1d', 500: '#9a6a00', 700: '#7d5200', 800: '#6a4600', 900: '#4f3400' },
        emerald: { ...colors.emerald, 50: '#e3efe6', 200: '#b9d6c1', 400: '#3f9a5f', 500: '#2e7d4b', 600: '#166534', 700: '#166534', 800: '#114d28' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Manrope', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['var(--font-sans)', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        tile: '24px',
        pop: '16px',
      },
    },
  },
  plugins: [],
};
