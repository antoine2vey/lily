import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5f0',
          100: '#d9e8d9',
          200: '#b3d1b3',
          300: '#8cba8c',
          400: '#6fa36f',
          500: '#5B8C5A',
          600: '#497048',
          700: '#375436',
          800: '#243824',
          900: '#121c12',
        },
        coral: {
          50: '#fdf4f0',
          100: '#fbe5dc',
          200: '#f5cbb9',
          300: '#eeb096',
          400: '#E8997E',
          500: '#d4795c',
          600: '#b8604a',
          700: '#8c4938',
          800: '#603226',
          900: '#341b14',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
