// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/oddsapi": {
        target: "https://api.odds-api.io",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/oddsapi/, ""),
      },
    },
  },
});
