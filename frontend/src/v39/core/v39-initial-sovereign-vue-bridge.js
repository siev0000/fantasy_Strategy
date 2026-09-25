import { createApp } from "vue";
import V39InitialSovereignFlow from "../ui/V39InitialSovereignFlow.vue";

function mountInitialSovereignFlow() {
  if (document.getElementById("v39-initial-sovereign-vue-root")) return;
  const root = document.createElement("div");
  root.id = "v39-initial-sovereign-vue-root";
  document.body.appendChild(root);
  createApp(V39InitialSovereignFlow).mount(root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountInitialSovereignFlow, { once:true });
} else {
  mountInitialSovereignFlow();
}
