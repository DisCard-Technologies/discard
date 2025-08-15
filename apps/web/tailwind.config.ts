import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'gray': {
          100: '#000510',
          200: 'rgba(255, 255, 255, 0.4)',
          300: 'rgba(255, 255, 255, 0.2)',
          400: 'rgba(255, 255, 255, 0.6)',
          500: 'rgba(255, 255, 255, 0.05)',
          600: 'rgba(255, 255, 255, 0.8)',
          700: 'rgba(255, 255, 255, 0.1)',
        },
        'lightgreen': {
          100: '#99e39e',
          200: 'rgba(153, 227, 158, 0.1)',
        },
        'royalblue': '#627eea',
        'tomato': '#ff6961',
        'crypto-dark': '#000510',
        'crypto-bg': '#0a0b0d',
      },
      fontFamily: {
        'sans': ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        'mono': ['var(--font-dm-mono)', 'monospace'],
      },
      fontSize: {
        '12': '12px',
        '14': '14px',
        '16': '16px',
        '18': '18px',
        '20': '20px',
        '28': '28px',
        '32': '32px',
        '40': '40px',
        '72': '72px',
      },
      spacing: {
        '2': '2px',
        '3': '3px',
        '4': '4px',
        '8': '8px',
        '10': '10px',
        '12': '12px',
        '16': '16px',
        '20': '20px',
        '24': '24px',
        '32': '32px',
        '40': '40px',
        '72': '72px',
      },
      borderRadius: {
        '12': '12px',
        '16': '16px',
        '999': '999px',
      },
      boxShadow: {
        'crypto': '0px 12px 28px rgba(10, 9, 9, 0.32)',
        'crypto-sm': '0px 8.034420013427734px 18.75px rgba(10, 9, 9, 0.32)',
        'crypto-lg': '0px 5.678168773651123px 23.52px rgba(153, 227, 158, 0.2)',
      },
      backdropBlur: {
        '6': '6px',
        '20': '20.2px',
        '32': '32px',
        '40': '40px',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        }
      }
    },
  },
} satisfies Config;