import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        crm: {
          orange: '#DA7756',
          'orange-light': '#E8956B',
          'orange-dark': '#C45E3E',
          'orange-glow': 'rgba(218,119,86,0.25)',
          bg: '#0F0E17',
          'bg-2': '#141220',
          card: '#1A1825',
          'card-2': '#221F30',
          border: 'rgba(218,119,86,0.15)',
          text: '#F5F1EB',
          muted: '#9B9AAF',
          'muted-2': '#6B6A7F',
        },
      },
      fontFamily: {
        heebo: ['Heebo', 'sans-serif'],
      },
      borderColor: {
        DEFAULT: 'rgba(218,119,86,0.15)',
      },
    },
  },
  plugins: [require('tailwindcss-rtl')],
}

export default config
