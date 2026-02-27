/** @type {import('tailwindcss').Config} */
const withOpacity = (cssVariable) => `rgb(var(${cssVariable}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f3f5f7",
          100: "#e6ebf0",
          200: "#ced9e3",
          300: "#acbdce",
          400: "#839db7",
          500: "#647f9f",
          600: "#4f6786",
          700: "#42556e",
          800: "#39485b",
          900: "#333e4d",
        },
        brand: {
          50: withOpacity("--brand-50-rgb"),
          100: withOpacity("--brand-100-rgb"),
          200: withOpacity("--brand-200-rgb"),
          300: withOpacity("--brand-300-rgb"),
          400: withOpacity("--brand-400-rgb"),
          500: withOpacity("--brand-500-rgb"),
          600: withOpacity("--brand-600-rgb"),
          700: withOpacity("--brand-700-rgb"),
          800: withOpacity("--brand-800-rgb"),
          900: withOpacity("--brand-900-rgb"),
        },
        accent: {
          50: withOpacity("--accent-50-rgb"),
          100: withOpacity("--accent-100-rgb"),
          200: withOpacity("--accent-200-rgb"),
          300: withOpacity("--accent-300-rgb"),
          400: withOpacity("--accent-400-rgb"),
          500: withOpacity("--accent-500-rgb"),
          600: withOpacity("--accent-600-rgb"),
          700: withOpacity("--accent-700-rgb"),
          800: withOpacity("--accent-800-rgb"),
          900: withOpacity("--accent-900-rgb"),
        },
        danger: {
          50: "#fff2f1",
          100: "#ffe1dd",
          500: "#e85d4f",
          600: "#d44a3d",
          700: "#ad362d",
        },
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui"],
        display: ["Space Grotesk", "Manrope", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 12px 40px -24px rgba(18, 37, 63, 0.45)",
        panel: "0 18px 44px -24px rgba(13, 34, 65, 0.38)",
      },
      borderRadius: {
        "2xl": "1.1rem",
        "3xl": "1.6rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "stagger-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(-6px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 360ms ease-out both",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
        "stagger-in": "stagger-in 240ms ease-out both",
        "slide-in": "slide-in 200ms ease-out both",
        "scale-in": "scale-in 180ms ease-out both",
      },
    },
  },
  plugins: [],
};
