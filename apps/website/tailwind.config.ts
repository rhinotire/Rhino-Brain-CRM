import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Rhino gold
        // dark variant is text-safe on white (≥4.5:1 contrast)
        brand: { DEFAULT: "#F0A500", dark: "#8F6400", light: "#FFC93C" },
        // deep navy — primary dark surface
        navy: {
          DEFAULT: "#0C1B33",
          950: "#060D1A",
          900: "#0C1B33",
          800: "#122746",
          700: "#1B3560",
        },
        // metallic silver range
        steel: {
          100: "#EEF1F5",
          200: "#DDE2E9",
          300: "#C3CAD5",
          400: "#9AA4B2",
          500: "#6B7686",
        },
        ink: "#0C1B33", // back-compat alias for existing bg-ink/text-ink classes
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Arial Narrow", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(12,27,51,.08), 0 8px 24px -12px rgba(12,27,51,.18)",
        lift: "0 4px 6px rgba(12,27,51,.06), 0 16px 32px -12px rgba(12,27,51,.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;
