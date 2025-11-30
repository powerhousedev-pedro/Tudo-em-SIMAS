/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        simas: {
          dark: '#13335a',    /* Navy */
          cyan: '#42b9eb',    /* Cyan */
          blue: '#2a688f',    /* Blue */
          cloud: '#f0f2f5',   /* Cloud - Slightly brighter */
          surface: '#ffffff', /* Branco */
          danger: '#ef4444',
          warning: '#f59e0b',
          success: '#10b981',
          light: '#e2e8f0',   /* Light Slate for borders/bg */
          medium: '#64748b',  /* Medium Slate for text */
          accent: '#0ea5e9'   /* Sky Blue for highlights */
        }
      },
      fontFamily: {
        sans: ['"Cera Pro"', 'var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Cera Pro"', 'var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        brand: '-0.03em', // 30 milésimos de M para títulos grandes
        tighter: '-0.05em',
        tight: '-0.025em',
        normal: '0em',
        wide: '0.025em',
        wider: '0.05em',
        widest: '0.1em',
      },
      boxShadow: {
        'minimal': '0 4px 20px -2px rgba(19, 51, 90, 0.05)',
        'soft': '0 10px 40px -10px rgba(19, 51, 90, 0.08)',
        'glow': '0 0 20px rgba(66, 185, 235, 0.3)',
      },
      borderRadius: {
        '4xl': '2.5rem',
      },
      animation: {
        'slide-in': 'slideIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    }
  },
  plugins: [],
}