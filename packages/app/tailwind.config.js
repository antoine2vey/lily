/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary
        primary: '#5B8C5A',
        'primary-dark': '#4A7A49',
        'primary-light': '#6B9C6A',
        'primary-tint': '#E8F5E8',

        // Secondary (Coral)
        coral: '#E8997E',
        'coral-dark': '#D88A6F',

        // Backgrounds
        background: '#F8FAF8',
        'background-dark': '#1A1A1A',
        surface: '#FFFFFF',
        'surface-dark': '#252A1F',
        'surface-tinted': '#F0F5F0',
        'input-bg': '#E8F0E8',

        // Text
        'text-primary': '#1A1A1A',
        'text-secondary': '#4A5568',
        'text-muted': '#9CA3AF',

        // Legacy aliases
        'background-light': '#F8FAF8',
        'surface-light': '#FFFFFF',
        'text-main': '#1A1A1A',

        // Status
        success: '#5B8C5A',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',

        // Semantic
        'water-blue': '#60A5FA',
        'achievement-gold': '#FCD34D',

        // Utility
        border: '#E5E7EB',
      },
      fontFamily: {
        regular: ['PlusJakartaSans_400Regular'],
        medium: ['PlusJakartaSans_500Medium'],
        semibold: ['PlusJakartaSans_600SemiBold'],
        bold: ['PlusJakartaSans_700Bold'],
        extrabold: ['PlusJakartaSans_800ExtraBold'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 6px rgba(0,0,0,0.07)',
        lg: '0 10px 25px rgba(0,0,0,0.1)',
        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
}
