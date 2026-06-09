/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      backgroundColor: {
        canvas: '#f5f5f5',
      },
      colors: {
        canvas: '#f5f5f5',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-6px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bounceOnce: {
          '0%':   { transform: 'scale(1)' },
          '35%':  { transform: 'scale(1.09)' },
          '70%':  { transform: 'scale(0.96)' },
          '100%': { transform: 'scale(1)' },
        },
        slideInUp: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in':      'fadeIn      150ms ease both',
        'slide-down':   'slideDown   160ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-up':     'slideUp     220ms cubic-bezier(0.16,1,0.3,1) both',
        'scale-in':     'scaleIn     220ms cubic-bezier(0.16,1,0.3,1) both',
        'bounce-once':  'bounceOnce  300ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-in-up':  'slideInUp   180ms cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
}
