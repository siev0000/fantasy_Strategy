// Build the data-driven UI before attaching legacy interactions and field modules.
import "./v39-operation-ui.js";
import "./v39-legacy-ui.js";
import "./v39-field-runtime-final.js";
import "./v39-map-controls-layout.js";
import "./v39-field-settings-entry.js";
import "./v39-field-settings-final.js";
import "./v39-field-settings-stabilizer.js";
import "./v39-game-state-bridge.js";
import "./v39-initial-placement.js";
import "./v39-map-entities.js";
import "./v39-unit-movement.js";
import "./v39-land-detail.js";
import "./v39-height-boundaries.js";
import "./v39-terrain-icons.js";
import "./v39-squad-card-vitals.js";
import "./v39-squad-derived-binding.js";
import "./v39-readable-fonts.js";
import "./v39-research-ui.js";
import "./v39-design-docs-viewer.js";
import "./v39-text-input-modal.js";

document.querySelector(".footer")?.setAttribute("data-v39-ready", "true");
