import '../dev/v39-hegemony-area-test.js';
// Final detail UI and terrain presentation modules.
import "../unit/v39-character-modal.js";
import "../unit/v39-summon-modal.js";
import '../dev/v39-call-test.js';
import '../dev/v39-fusion-test.js';
import '../dev/v39-animal-army-test.js';
import '../dev/v39-disaster-test.js';
import '../dev/v39-terrain-test.js';
import '../unit/v39-fusion-modal.js';
import "../unit/v39-squad-edit-ui.js";
import "../unit/v39-expedition-tools-ui.js";
import "../dev/v39-expedition-test.js";
import "../dev/v39-logistics-test.js";
import "../dev/v39-village-incident-test.js";
import '../world/v39-trade-ui.js';
import "../map/v39-land-detail.js";
import "../map/v39-height-boundaries.js";
import "../map/v39-terrain-icons.js";
import "../map/v39-disaster-icons.js";
import '../map/v39-weather-overlay.js';
import "../map/v39-victory-landmark-icons.js";
import "../core/v39-victory-system.js";
import "../map/v39-volcano-system.js";
import "../unit/v39-leadership-lifecycle.js";
import "../unit/v39-squad-card-vitals.js";
import "../unit/v39-squad-derived-binding.js";
import "../world/v39-research-ui.js";
import "../ui/v39-design-docs-viewer.js";
import "../combat/v39-effect-frame-timing.js";
import "../ui/v39-effect-settings.js";
import "../ui/v39-effect-category-settings.js";
import "../ui/v39-title-effect-settings.js";
import "../ui/v39-text-input-modal.js";

const V39_UI_BUILD_LABEL = "UI 2026.10.21-60";

function applyV39UiBuildLabel() {
  const label = document.getElementById("uiBuildLabel");
  if (label) label.textContent = V39_UI_BUILD_LABEL;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyV39UiBuildLabel, { once:true });
} else {
  applyV39UiBuildLabel();
}
