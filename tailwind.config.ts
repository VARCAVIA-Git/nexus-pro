import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: "#0c1222",
          card: "#162032",
          border: "#243248",
          text: "#c1ccdb",
          dim: "#5a6a80",
          accent: "#22d3ee",
          green: "#34d399",
          red: "#f43f5e",
          yellow: "#fbbf24",
          blue: "#60a5fa",
        },
      },
      fontFamily: {
        mono: ["IBM Plex Mono", "Fira Code", "monospace"],
        display: ["Instrument Sans", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
