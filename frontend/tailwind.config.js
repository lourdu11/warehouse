/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#213261", // Navy Blue
          foreground: "#FFFFFF", // White
          light: "#172c4e", // Light Navy/Blue
          dark: "#1E293B", // Dark Navy
        },
        secondary: {
          DEFAULT: "#6B7280", // Gray
          foreground: "#FFFFFF", // White
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "#F3F4F6", // Light Gray
          foreground: "#6B7280", // Gray
        },
        accent: {
          DEFAULT: "#F9FAFB", // Off White
          foreground: "#1E3A8A", // Navy Blue
        },
        popover: {
          DEFAULT: "#FFFFFF",
          foreground: "#1E293B",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#1E293B",
        },
        sidebar: {
          DEFAULT: "#FFFFFF",
          foreground: "#1E293B",
          primary: "#1E3A8A",
          "primary-foreground": "#FFFFFF",
          accent: "#F3F4F6",
          "accent-foreground": "#1E3A8A",
          border: "#E5E7EB",
          ring: "#1E3A8A",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}