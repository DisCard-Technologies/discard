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
        // 2035 Vision - Ambient Finance Theme
        // Primary emerald/teal - oklch(0.75 0.18 165) ≈ #10B981
        primary: {
          DEFAULT: '#10B981',
          foreground: '#0A0F14',
        },
        // Dark backgrounds - oklch(0.08 0.01 260)
        background: '#0A0F14',
        // Card - oklch(0.12 0.015 260)
        card: {
          DEFAULT: '#141A24',
          foreground: '#F0F0F0',
        },
        // Surface for glass effects - oklch(0.1 0.01 260)
        surface: '#0F1419',
        // Foreground text - oklch(0.95 0 0)
        foreground: '#F0F0F0',
        // Muted - oklch(0.15 0.015 260) / oklch(0.6 0 0)
        muted: {
          DEFAULT: '#1C242E',
          foreground: '#8B9299',
        },
        // Secondary - oklch(0.18 0.02 260)
        secondary: {
          DEFAULT: '#212B38',
          foreground: '#C9CDD2',
        },
        // Accent purple - oklch(0.65 0.2 280)
        accent: {
          DEFAULT: '#8B5CF6',
          foreground: '#F0F0F0',
        },
        // Border - oklch(0.22 0.02 260)
        border: '#2A3544',
        // Input - oklch(0.15 0.015 260)
        input: '#1C242E',
        // Ring/focus - same as primary
        ring: '#10B981',
        // Destructive - oklch(0.55 0.22 25)
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#F0F0F0',
        },
        // Chart colors for data visualization
        chart: {
          1: '#10B981', // primary
          2: '#8B5CF6', // accent purple
          3: '#F59E0B', // amber
          4: '#3B82F6', // blue
          5: '#EF4444', // red
        },
      },
      fontFamily: {
        sans: ['System'],
        mono: ['Courier'],
      },
      fontSize: {
        '6xl': ['60px', { lineHeight: '1', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        'sm': '12px',
        'md': '14px',
        'lg': '16px',
        'xl': '20px',
        '2xl': '24px',
      },
      opacity: {
        '3': '0.03',
        '5': '0.05',
        '8': '0.08',
        '10': '0.1',
        '30': '0.3',
        '40': '0.4',
        '50': '0.5',
        '60': '0.6',
        '80': '0.8',
      },
    },
  },
  plugins: [],
};
