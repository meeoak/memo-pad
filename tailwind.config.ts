import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#262626",
        paper: "#fbfaf7",
        calm: "#ebe4d8",
        moss: "#65735f",
        clay: "#a76f55",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(38, 38, 38, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
