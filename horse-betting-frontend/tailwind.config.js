/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Baloo 2"', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['Nunito', 'ui-rounded', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        cream: '#FFF8EE',
        grape: {
          50: '#F5F0FF', 100: '#EDE4FF', 200: '#DACBFF', 300: '#BFA4FF', 400: '#9F75FF',
          500: '#8247F5', 600: '#6D2EE0', 700: '#5A22BD', 800: '#481D95', 900: '#3A1A75',
        },
        sunny: { 100: '#FFF3C4', 200: '#FFE58A', 300: '#FFD54A', 400: '#FFC21A', 500: '#F5A700', 600: '#C98400' },
        coral: { 100: '#FFE1E1', 200: '#FFC2C4', 300: '#FF9A9F', 400: '#FF6B74', 500: '#F2475A', 600: '#D12F45' },
        mint: { 100: '#D7F8EA', 200: '#AEF0D4', 300: '#6FE0B3', 400: '#33C98F', 500: '#16A974', 600: '#0E8A5E' },
        sky2: { 100: '#DDF3FF', 200: '#B5E5FF', 300: '#7CD0FF', 400: '#3DB4F5', 500: '#1694D9' },
      },
      boxShadow: {
        chunky: '0 4px 0 0 rgba(58, 26, 117, 0.18)',
        'chunky-lg': '0 6px 0 0 rgba(58, 26, 117, 0.18)',
        pop: '0 10px 30px -10px rgba(58, 26, 117, 0.35)',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(0.85)' }, '60%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)' } },
        wiggle: { '0%, 100%': { transform: 'rotate(-6deg)' }, '50%': { transform: 'rotate(6deg)' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        gallop: { '0%': { transform: 'translateX(-10%)' }, '100%': { transform: 'translateX(110%)' } },
        'slide-up': { '0%': { transform: 'translateY(16px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
        shake: { '0%, 100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-6px)' }, '75%': { transform: 'translateX(6px)' } },
      },
      animation: {
        pop: 'pop 0.35s ease-out',
        wiggle: 'wiggle 0.6s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        gallop: 'gallop 2.4s linear infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        shake: 'shake 0.3s ease-in-out 2',
      },
    },
  },
  plugins: [],
}
