import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0b0b0f',
          raised: '#131319',
          panel: '#17171f',
          border: '#26262f',
        },
        brand: {
          50: '#f1f0ff',
          100: '#e4e1fe',
          200: '#cbc5fd',
          300: '#a89dfa',
          400: '#8b7bf7',
          500: '#7c5cf5',
          600: '#6d3ff0',
          700: '#5c2fd4',
          800: '#4c27ab',
          900: '#402389',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(124 92 245 / 0.4), 0 8px 24px -8px rgb(124 92 245 / 0.5)',
      },
    },
  },
  plugins: [],
};

export default config;
