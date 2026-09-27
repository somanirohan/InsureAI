/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fdf8ed',
          100: '#f7e9c4',
          200: '#f0d898',
          300: '#e8c97e',
          400: '#d8b060',
          500: '#c8a96e', // primary gold accent
          600: '#a07840',
          700: '#7a5a28',
          800: '#553e18',
          900: '#33250c',
        },
        surface: {
          DEFAULT: '#0a0a12',  // page bg
          card:    'rgba(12,12,24,0.85)',
          inset:   'rgba(255,255,255,0.03)',
          modal:   'rgba(10,10,22,0.97)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.04em' }],
        'xs':  ['11px', { lineHeight: '16px' }],
        'sm':  ['13px', { lineHeight: '20px' }],
        'base': ['15px', { lineHeight: '24px' }],
        'lg':  ['17px', { lineHeight: '26px' }],
        'xl':  ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '38px' }],
      },
      letterSpacing: {
        tight: '-0.02em',
        snug:  '-0.01em',
        wide:  '0.04em',
        wider: '0.08em',
      },
      borderRadius: {
        'sm': '8px',
        DEFAULT: '12px',
        'lg': '16px',
        'xl': '20px',
        '2xl': '24px',
        '3xl': '32px',
      },
      boxShadow: {
        'xs':   '0 1px 2px rgba(0,0,0,0.06)',
        'sm':   '0 2px 8px rgba(0,0,0,0.08)',
        DEFAULT: '0 4px 16px rgba(0,0,0,0.10)',
        'md':   '0 8px 24px rgba(0,0,0,0.12)',
        'lg':   '0 16px 48px rgba(0,0,0,0.15)',
        'accent': '0 0 0 3px rgba(26,137,23,0.12)',
      },
      spacing: {
        '4.5': '18px',
        '5.5': '22px',
        '13': '52px',
        '18': '72px',
        '68': '272px',
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease-out both',
        'slide-up':  'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.2' },
        },
      },
    },
  },
  plugins: [],
}
