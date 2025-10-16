/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'night-sky': '#1a1a1d',   // Very dark background
        'dirt': '#6F5E53',       // Earthy brown for primary elements
        'moss': '#4a5743',       // Dark green for secondary elements
        'blood-red': '#950740',   // Menacing red for accents and danger
        'bone-white': '#f2f2f2',  // Off-white for primary text
        'ash-gray': '#c5c6c7',    // Lighter gray for secondary text
      },
      fontFamily: {
        'display': ['"Special Elite"', 'monospace'], // For headings
        'body': ['"Lato"', 'sans-serif'],           // For body text
      },
    },
  },
  plugins: [],
}