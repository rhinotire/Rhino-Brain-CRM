import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf9e9",
          100: "#faf0c8",
          500: "#e5a50a",
          600: "#c78a06",
          700: "#9a6a07",
        },
        ink: {
          900: "#101826",
          800: "#1b2637",
          700: "#2a3850",
        },
      },
    },
  },
  plugins: [],
};
export default config;
