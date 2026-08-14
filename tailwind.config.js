/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // Fleur brand, taken from the brand kit's visual grammar. Bone is the
        // canonical backdrop — the brand deliberately avoids pure white.
        fleur: {
          bone: '#E4E0D9',
          bonedeep: '#DCD7CC',
          ink: '#323C40',
          oxblood: '#812221',
          copper: '#E97100',
          gold: '#FFEFCC',
        },
      },
    },
  },
  plugins: [],
}