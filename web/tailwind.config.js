/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        paper: "#F7F6F2",
        accent: { 50: "#EEF2FC", 100: "#DCE4F8", 200: "#B9C8F1", 300: "#8AA3E6", 500: "#3A63D6", 600: "#2952CC", 700: "#1F3FA0" },
        ok: "#1F9D6B",
        warn: "#C98200",
        bad: "#D64545",
      },
    },
  },
  plugins: [],
};
