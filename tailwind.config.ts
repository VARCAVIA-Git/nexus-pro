import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        n: {
          bg: "var(--bg-primary)",
          "bg-s": "var(--bg-secondary)",
          card: "var(--bg-card)",
          "card-h": "var(--bg-card-hover)",
          input: "var(--bg-input)",
          border: "var(--border)",
          "border-b": "var(--border-bright)",
          accent: "var(--accent)",
          "accent-dim": "var(--accent-dim)",
          "accent-h": "var(--accent-hover)",
          text: "var(--text-primary)",
          "text-s": "var(--text-secondary)",
          dim: "var(--text-dim)",
          green: "var(--green)",
          red: "var(--red)",
          yellow: "var(--yellow)",
          blue: "var(--blue)",
        },
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
