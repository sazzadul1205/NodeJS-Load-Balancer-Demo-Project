export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0a0e14",
        panel: "#121820",
        "panel-deep": "#0f141b",
        "panel-hover": "#1b2330",
        edge: "#232c3a",
        edge2: "#2f3a4d",
        fg: "#c9d1d9",
        muted: "#7d8590",
        ok: "#3fb950",
        warn: "#d29922",
        err: "#f85149",
        info: "#58a6ff",
        accent: "#bc8cff",
        brand: "#39c5cf",
      },
      fontFamily: {
        mono: [
          '"SF Mono"',
          "Monaco",
          '"Cascadia Code"',
          "Consolas",
          "monospace",
        ],
      },
      keyframes: {
        "pulse-ok": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        fade: {
          from: { opacity: "0", transform: "translateY(-2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-ok": "pulse-ok 1.4s ease-in-out infinite",
        fade: "fade 0.4s ease-out",
      },
    },
  },
  plugins: [],
};
