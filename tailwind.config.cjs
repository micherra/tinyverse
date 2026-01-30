/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./examples/**/*.{js,ts,jsx,tsx,html}",
    "./packages/**/*.{js,ts,jsx,tsx}",
    "./templates/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter"', "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
