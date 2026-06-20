/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,vue,html}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbf7',
          100: '#d5f5ea',
          200: '#adead8',
          300: '#7fd9c2',
          400: '#4ebda3',
          500: '#28907d',
          600: '#1f7366',
          700: '#1c5c53',
          800: '#194a44',
          900: '#173d39',
        },
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
