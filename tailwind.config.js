/** @type {import('tailwindcss').Config} */
module.exports = {
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
      },
      animation: {
        'fade-in':    'fadeIn    150ms ease both',
        'slide-down': 'slideDown 160ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-up':   'slideUp   220ms cubic-bezier(0.16,1,0.3,1) both',
        'scale-in':   'scaleIn   220ms cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
}
