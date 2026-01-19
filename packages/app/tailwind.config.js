/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#80ac53',
        'primary-light': '#dceccb',
        'background-light': '#f7f7f6',
        'background-dark': '#191d15',
        'surface-light': '#ffffff',
        'surface-dark': '#23281f',
        'card-light': '#ffffff',
        'card-dark': '#23291d',
        'text-main': '#141712',
        'text-secondary': '#738363',
      },
      fontFamily: {
        display: ['PlusJakartaSans'],
        'display-medium': ['PlusJakartaSans-Medium'],
        'display-semibold': ['PlusJakartaSans-SemiBold'],
        'display-bold': ['PlusJakartaSans-Bold'],
        'display-extrabold': ['PlusJakartaSans-ExtraBold'],
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        glow: '0 0 15px rgba(128, 172, 83, 0.3)',
      },
    },
  },
  plugins: [],
}
