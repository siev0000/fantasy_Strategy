import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

function unpackEmbeddedV39(sourceHtml) {
  if (!sourceHtml.includes("const gzipBase64=")) return sourceHtml;
  const match = sourceHtml.match(/const\s+gzipBase64\s*=\s*"([A-Za-z0-9+/=]+)"\s*;/);
  if (!match?.[1]) {
    throw new Error("Embedded v39 HTML was not found in frontend/index.html");
  }
  return gunzipSync(Buffer.from(match[1], "base64")).toString("utf-8");
}

function installStableManageEntries(sourceHtml) {
  let html = sourceHtml;
  const anchor = '<button class="manage-tile" data-toast="音量 / 表示設定"><b>⚙</b><span>設定</span></button>';
  if (!html.includes(anchor)) {
    throw new Error("v39 management panel anchor was not found");
  }

  const additions = [];
  if (!html.includes('id="v39-manage-field-settings"')) {
    additions.push('<button class="manage-tile" id="v39-manage-field-settings"><b>⬢</b><span>フィールド設定</span></button>');
  }
  if (!html.includes('id="v39-manage-design-docs"')) {
    additions.push('<button class="manage-tile" id="v39-manage-design-docs"><b>書</b><span>設計書</span></button>');
  }
  if (!additions.length) return html;
  return html.replace(anchor, `${anchor}\n        ${additions.join("\n        ")}`);
}

export default defineConfig(({ mode }) => {
  const isTestOnMode = mode === "teston" || process.env.TEST_ON === "1";
  const isWatchMode = mode === "watch";
  const base = String(process.env.VITE_BASE_PATH || "/").trim() || "/";
  const v39StaticUiPlugin = {
    name: "v39-static-ui",
    transformIndexHtml(sourceHtml) {
      const html = installStableManageEntries(unpackEmbeddedV39(sourceHtml));
      return {
        html,
        tags: [
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
          },
          {
            tag: "script",
            attrs: { type: "module", src: `${base}assets/v39-design-docs-viewer.js` },
            injectTo: "body"
          }
        ]
      };
    }
  };
  return {
    root: "frontend",
    base,
    plugins: [vue(), v39StaticUiPlugin],
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
          "v39-research-ui": resolve("frontend/src/v39-research-ui.js"),
          "v39-design-docs-viewer": resolve("frontend/src/v39-design-docs-viewer.js")
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
