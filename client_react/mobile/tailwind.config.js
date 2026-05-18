/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0f1a',
          card: '#111c2b',
          elevated: '#162035',
          hover: '#1a2540',
        },
        accent: '#38aaff',
        green: '#22d369',
        yellow: '#f5a623',
        red: '#f44b4b',
        orange: '#ff7043',
        purple: '#a855f7',
        text: {
          primary: '#e6eef8',
          muted: '#607b99',
          dim: '#3a506b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}

