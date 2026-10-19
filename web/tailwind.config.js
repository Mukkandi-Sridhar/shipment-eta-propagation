/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        ink: { 950: "#04060c", 900: "#070b14", 850: "#0a0f1c", 800: "#0e1526", 700: "#18213a" },
        cyan: { 300: "#67e8f9", 400: "#22d3ee", 500: "#06b6d4" },
        ok: "#34d399",
        warn: "#fbbf24",
        bad: "#fb7185",
        violet: { 300: "#c4b5fd", 400: "#a78bfa", 500: "#8b5cf6" },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(103,232,249,.15), 0 0 40px -8px rgba(34,211,238,.35)",
      },
    },
  },
  plugins: [],
};
