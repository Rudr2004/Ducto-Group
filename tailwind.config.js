/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', sunken: 'var(--sunken)', line: 'var(--line)',
        ink: 'var(--ink)', muted: 'var(--muted)', faint: 'var(--faint)',
        navy: 'var(--navy)', teal: 'var(--teal)', tealsoft: 'var(--teal-soft)',
        ok: 'var(--ok)', late: 'var(--late)', soon: 'var(--soon)', over: 'var(--over)', up: 'var(--up)',
      },
      borderRadius: { card: '12px' },
    },
  },
  plugins: [],
};
