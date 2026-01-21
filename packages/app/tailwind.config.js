/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary (updated to align with reference screens)
        primary: '#80ac53',
        'primary-dark': '#6a9145',
        'primary-light': '#9bc76d',
        'primary-tint': '#dceccb',

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
        success: '#80ac53',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',

        // Semantic
        'water-blue': '#60A5FA',
        'achievement-gold': '#FCD34D',

        // Utility
        border: '#E5E7EB',

        // Slate scale (from reference screens)
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },

        // Forest/sage greens (from profile reference)
        'forest-green': '#2D5A3D',
        'sage-green': '#78A55A',

        // Card colors for dark mode
        'card-light': '#ffffff',
        'card-dark': '#23291d',

        // Amber scale (achievements/warnings)
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          400: '#fbbf24',
          700: '#b45309',
        },

        // Blue scale (water indicators)
        blue: {
          50: '#eff6ff',
          100: '#dbeafe',
          400: '#60a5fa',
          500: '#3b82f6',
          900: '#1e3a8a',
        },

        // Orange scale (attention states)
        orange: {
          100: '#ffedd5',
          400: '#fb923c',
          900: '#7c2d12',
        },

        // Teal scale (humidity/mist)
        teal: {
          50: '#f0fdfa',
          400: '#2dd4bf',
          500: '#14b8a6',
          900: '#134e4a',
        },

        // Purple scale (spa/wellness)
        purple: {
          50: '#faf5ff',
          500: '#a855f7',
          900: '#581c87',
        },
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
        '3xl': '40px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 6px rgba(0,0,0,0.07)',
        lg: '0 10px 25px rgba(0,0,0,0.1)',
        soft: '0 10px 40px -10px rgba(0,0,0,0.06)',
        nav: '0 -4px 20px rgba(0,0,0,0.04)',
        sheet: '0 -10px 40px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
}
