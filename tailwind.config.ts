import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f1523",
          card: "#161d2e",
          border: "#252d42",
        },
        brand: {
          DEFAULT: "#6366f1",
          hover: "#4f46e5",
        },
        gain: "#22c55e",
        loss: "#ef4444",
      },
    },
  },
  plugins: [],
};

export default config;
