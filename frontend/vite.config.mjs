import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const isTestOnMode = mode === "teston" || process.env.TEST_ON === "1";
  const isWatchMode = mode === "watch";
  const base = String(process.env.VITE_BASE_PATH || "/").trim() || "/";
  const v39FieldRuntimePlugin = {
    name: "v39-field-runtime-inject",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module", src: `${base}assets/v39-field-runtime.js` },
          injectTo: "body"
        },
        {
          tag: "script",
          attrs: { type: "module", src: `${base}assets/v39-field-settings-entry.js` },
          injectTo: "body"
        },
        {
          tag: "script",
          attrs: { type: "module", src: `${base}assets/v39-research-ui.js` },
          injectTo: "body"
        }
      ];
    }
  };
  return {
    root: "frontend",
    base,
    plugins: [vue(), v39FieldRuntimePlugin],
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
      emptyOutDir: !isWatchMode,
      rollupOptions: {
        input: {
          index: resolve("frontend/index.html"),
          "v39-field-runtime": resolve("frontend/src/v39-field-runtime.js"),
          "v39-field-settings-entry": resolve("frontend/src/v39-field-settings-entry.js"),
          "v39-research-ui": resolve("frontend/src/v39-research-ui.js")
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
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
