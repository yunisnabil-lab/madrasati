/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        ar: ['"Plex Arabic"', 'Tahoma', 'sans-serif'],
        en: ['Inter', 'sans-serif'],
      },
      colors: {
        navy: { DEFAULT: '#0F172A', soft: '#1E293B' },
        pearl: { DEFAULT: '#F8FAFC', soft: '#F1F5F9' },
        royal: { DEFAULT: '#2563EB', light: '#60A5FA', glow: '#93C5FD' },
        gold: { DEFAULT: '#D97706', light: '#F59E0B' },
        slate: {
          650: '#475569',
        },
      },
      borderRadius: {
        '2xl': '1rem',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(6px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease both',
      },
    },
  },
  plugins: [],
}
