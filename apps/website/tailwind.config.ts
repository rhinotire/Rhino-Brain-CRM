import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#e5a50a", dark: "#b8850a" }, // Rhino gold
        ink: "#0f172a",
      },
    },
  },
  plugins: [],
} satisfies Config;
