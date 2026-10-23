/** @type {import('tailwindcss').Config} */
// The app's colors, from the painted maps (Woodland glass): greys with a little of the woods in
// them, fern green for what's picked and what to do next (in place of orange), pond blue for
// focus and information, clay for danger, leaf green for what's live or done.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // `touch:` styles apply where a finger is the main pointer (bigger targets, no key hints)
      screens: { touch: { raw: "(pointer: coarse)" } },
      colors: {
        zinc: { 50: "#f5f7f2", 100: "#eceee6", 200: "#d9ddd2", 300: "#bec4b7", 400: "#9aa294", 500: "#737b6d", 600: "#545b50", 700: "#3a4038", 800: "#282e27", 900: "#1b201b", 950: "#111511" },
        orange: { 50: "#f5faec", 100: "#e9f4d6", 200: "#d4e9ae", 300: "#bfdd8a", 400: "#afd477", 500: "#a2cf6a", 600: "#86b252", 700: "#6a8f40", 800: "#526f33", 900: "#3d5228", 950: "#1f2c12" },
        sky: { 50: "#f0f8fb", 100: "#dcf0f6", 200: "#bde2ee", 300: "#9ccfe0", 400: "#78bad0", 500: "#5aa3bb", 600: "#44869c", 700: "#386c7e", 800: "#2f5767", 900: "#284856", 950: "#162c35" },
        red: { 50: "#fdf3ef", 100: "#fbe5dd", 200: "#f6c9bb", 300: "#f0a48f", 400: "#e5856c", 500: "#d66b50", 600: "#bb553c", 700: "#974532", 800: "#74372a", 900: "#5a2d24", 950: "#321711" },
        emerald: { 50: "#f4faee", 100: "#e8f5db", 200: "#d2ebb8", 300: "#b4dc8f", 400: "#98cc6e", 500: "#7db455", 600: "#649443", 700: "#4f7436", 800: "#3e5a2c", 900: "#314824", 950: "#1a2913" }
      },
      fontFamily: { sans: ["Inter", "-apple-system", "'SF Pro Text'", "system-ui", "sans-serif"] }
    }
  },
  plugins: []
};
