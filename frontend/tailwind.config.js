/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Cairo", "sans-serif"] },
      colors: {
        brand: { cyan: "#22d3ee", green: "#10b981" },
        dark:  { 900: "#070d1a", 800: "#0d1f35", 700: "#0f2032", 600: "#1e3a5f" }
      }
    }
  },
  plugins: [],
}