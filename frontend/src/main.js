import { createApp } from "vue";
import App from "./App.vue";
import { installResponsivePhaserRuntime } from "./responsive-phaser-runtime.js";
import "./styles.css";
import "./mobile-responsive-ui.css";
import "./v39-field-theme.css";

installResponsivePhaserRuntime();
createApp(App).mount("#app");
