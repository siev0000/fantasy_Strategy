import { createApp } from "vue";
import App from "./App.vue";
import { installResponsivePhaserRuntime } from "./responsive-phaser-runtime.js";
import "@fontsource/noto-sans-symbols-2/400.css";
import "@fontsource/noto-sans-symbols/400.css";
import "@fontsource/noto-color-emoji/400.css";
import "./styles.css";
import "./v39-field-theme.css";
import "./fullscreen-game-shell.css";

installResponsivePhaserRuntime();
createApp(App).mount("#app");
