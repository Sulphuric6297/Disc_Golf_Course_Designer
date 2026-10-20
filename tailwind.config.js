/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // `touch:` styles apply where a finger is the main pointer (bigger targets, no key hints)
      screens: { touch: { raw: "(pointer: coarse)" } }
    }
  },
  plugins: []
};
