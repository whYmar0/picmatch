/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Фирменный пастельный оранжевый / Brand pastel orange
        primary: {
          50:  "#FFF8F0",
          100: "#FFEFD9",
          200: "#FFD9A8",
          300: "#FFC278",
          400: "#FFB347",  // Main brand color
          500: "#FDB347",
          600: "#F09020",
          700: "#C97010",
          800: "#A05010",
          900: "#7A3810",
        },
        // Нейтральные оттенки / Neutral tones
        surface: {
          light: "#FAFAF8",
          dark:  "#141412",
        },
        card: {
          light: "#FFFFFF",
          dark:  "#1E1C1A",
        },
        border: {
          light: "#F0EDE8",
          dark:  "#2A2825",
        },
      },
      fontFamily: {
        // Современный, чистый шрифт / Modern clean font
        sans: ["'Outfit'", "system-ui", "sans-serif"],
        display: ["'Fraunces'", "serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      animation: {
        "fade-up": "fadeUp 0.4s ease-out forwards",
        "fade-in": "fadeIn 0.3s ease-out forwards",
        "scale-in": "scaleIn 0.2s ease-out forwards",
        "slide-up": "slideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "winner-glow": "winnerGlow 2s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(32px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        winnerGlow: {
          "0%, 100%": { boxShadow: "0 0 20px 4px rgba(255,179,71,0.4)" },
          "50%": { boxShadow: "0 0 40px 8px rgba(255,179,71,0.7)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      boxShadow: {
        "card": "0 4px 24px -4px rgba(0,0,0,0.08), 0 1px 4px -1px rgba(0,0,0,0.04)",
        "card-hover": "0 12px 40px -8px rgba(0,0,0,0.14), 0 4px 12px -4px rgba(0,0,0,0.06)",
        "orange": "0 8px 32px -4px rgba(255,179,71,0.4)",
        "swipe": "0 24px 64px -12px rgba(0,0,0,0.28)",
      },
    },
  },
  plugins: [],
};
