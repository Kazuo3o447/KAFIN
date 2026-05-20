import type { Config } from "tailwindcss";

// Farb- und Typo-Tokens 1:1 aus 1index.html portiert (Pilot-Vorbild).
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Primärblau aus Pilot (#0050B3) mit erweiterter Skala
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#0050B3",
          600: "#0040a0",
          700: "#003480",
          800: "#002a66",
          900: "#001f4d",
        },
        // Sekundärblau / Slate
        secondary: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        // Akzentfarbe für Dark-Mode-Active (siehe .audit-tab.active dark)
        accent: {
          400: "#38bdf8",
          500: "#0ea5e9",
        },
        // Score-Strips
        score: {
          green: "#22c55e",
          yellow: "#f59e0b",
          red: "#ef4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glass: "0 4px 30px rgba(0,0,0,0.08)",
        "glass-dark": "0 4px 30px rgba(0,0,0,0.40)",
      },
      backdropBlur: { xs: "2px" },
      keyframes: {
        toastIn: {
          from: { opacity: "0", transform: "translateX(40px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        toastOut: {
          from: { opacity: "1", transform: "translateX(0)" },
          to: { opacity: "0", transform: "translateX(40px)" },
        },
      },
      animation: {
        "toast-in": "toastIn 220ms ease-out",
        "toast-out": "toastOut 220ms ease-in forwards",
      },
    },
  },
  plugins: [],
};

export default config;
