import type { Config } from "tailwindcss";

const rgb = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: rgb("brand"),
        ink: rgb("ink"),
        surface: rgb("surface"),
        slate: {
          50: rgb("slate-50"),
          100: rgb("slate-100"),
          200: rgb("slate-200"),
          300: rgb("slate-300"),
          400: rgb("slate-400"),
          500: rgb("slate-500"),
          600: rgb("slate-600"),
          700: rgb("slate-700"),
          800: rgb("slate-800"),
          900: rgb("slate-900"),
        },
        neutral: { 200: rgb("neutral-200") },
        indigo: {
          50: rgb("indigo-50"),
          100: rgb("indigo-100"),
          600: rgb("indigo-600"),
        },
        violet: { 100: rgb("violet-100") },
        amber: { 50: rgb("amber-50"), 600: rgb("amber-600") },
        emerald: {
          50: rgb("emerald-50"),
          600: rgb("emerald-600"),
          700: rgb("emerald-700"),
        },
        red: { 50: rgb("red-50"), 600: rgb("red-600") },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 4px 16px -4px rgba(15,23,42,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
