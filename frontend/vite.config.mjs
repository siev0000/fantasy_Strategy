import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => {
  const isTestOnMode = mode === "teston" || process.env.TEST_ON === "1";
  return {
    root: "frontend",
    plugins: [vue()],
    server: {
      host: true,
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
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return null;
            if (id.includes("phaser")) return "vendor-phaser";
            if (id.includes("socket.io-client") || id.includes("engine.io-client")) return "vendor-socket";
            return "vendor-misc";
          }
        },
        plugins: [
          isTestOnMode
            ? visualizer({
                filename: "stats.html",
                template: "treemap",
                gzipSize: true,
                brotliSize: true,
                open: false
              })
            : null
        ].filter(Boolean)
      }
    }
  };
});
