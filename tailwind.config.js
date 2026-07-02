/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // ── Design system: border radius ────────────────────────────────────────
      // controls → rounded (4px), menus → rounded-menu (6px), modals → rounded-lg (8px)
      borderRadius: {
        menu: '6px',
      },
      // ── Design system: box shadows ───────────────────────────────────────────
      // floating (dropdowns/popovers): shadow-floating
      // modal: shadow-modal (use with ring-1 ring-black/5)
      boxShadow: {
        floating: '0 4px 16px -2px rgba(0,0,0,0.10), 0 2px 4px -1px rgba(0,0,0,0.06)',
        modal:    '0 16px 48px -8px rgba(0,0,0,0.20), 0 4px 12px -2px rgba(0,0,0,0.10)',
      },
      backgroundColor: {
        canvas: '#f5f5f5',
      },
      colors: {
        canvas: '#f5f5f5',
        // Override default gray (blue-tinted) with zinc (neutral) values
        gray: {
          50:  '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        accent: {
          50:  '#fbf3f3',
          100: '#f5e0e0',
          200: '#ebc1c1',
          300: '#de9b9b',
          400: '#d07171',
          500: '#c44a4a',
          600: '#af3939',
          700: '#832b2b',
          800: '#642121',
          900: '#451717',
          950: '#2a0e0e',
        },
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
        slideUpFull: {
          '0%':   { transform: 'translateY(102%)', opacity: '0.6' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        slideDownFull: {
          '0%':   { transform: 'translateY(0)',    opacity: '1' },
          '100%': { transform: 'translateY(102%)', opacity: '0.4' },
        },
        scaleOut: {
          '0%':   { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.97)' },
        },
        fadeOut: {
          '0%':   { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'fade-in':      'fadeIn      150ms ease both',
        'fade-out':     'fadeOut     150ms ease both',
        'slide-down':   'slideDown   160ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-up':     'slideUp     220ms cubic-bezier(0.16,1,0.3,1) both',
        'scale-in':     'scaleIn     220ms cubic-bezier(0.16,1,0.3,1) both',
        'scale-out':    'scaleOut    160ms cubic-bezier(0.4,0,1,1) both',
        'bounce-once':  'bounceOnce  300ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-in-up':    'slideInUp     180ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-up-full':  'slideUpFull   420ms cubic-bezier(0.32,0.72,0,1) both',
        'slide-down-full':'slideDownFull 280ms cubic-bezier(0.55,0,1,0.45) both',
      },
    },
  },
  plugins: [],
}
