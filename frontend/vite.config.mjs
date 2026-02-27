import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  root: "frontend",
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true
      },
      "/health": "http://localhost:3000",
      "/assets": "http://localhost:3000",
      "/config": "http://localhost:3000",
      "/data": "http://localhost:3000"
    }
  },
  build: {
    outDir: "../web-vue-dist",
    emptyOutDir: false
  }
});
