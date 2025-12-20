/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Primary emerald/teal from screenshots
        primary: {
          DEFAULT: '#10B981',
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        // Dark backgrounds
        background: '#0A0A0A',
        surface: '#111827',
        card: '#1F2937',
        // Text colors
        foreground: '#FFFFFF',
        muted: {
          DEFAULT: '#6B7280',
          foreground: '#9CA3AF',
        },
        // Accent colors
        accent: {
          DEFAULT: '#3B82F6',
          foreground: '#FFFFFF',
        },
        // Border
        border: '#374151',
        // Status colors
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
      },
      fontFamily: {
        // Map to system fonts
        sans: ['System'],
        mono: ['Courier'],
      },
      fontSize: {
        '6xl': ['60px', { lineHeight: '1', letterSpacing: '-0.02em' }],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(16, 185, 129, 0.3)',
        'glow-accent': '0 0 20px rgba(59, 130, 246, 0.3)',
      },
    },
  },
  plugins: [],
}

