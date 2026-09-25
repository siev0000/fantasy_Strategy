// Core UI, state, field, settings, save, and turn systems.
// Install the shared notification/chat rail before feedback and performance reporting.
import "../ui/v39-notification-rail.js";
// Install performance listeners first so turn-stage event boundaries are measured before handlers run.
import "../dev/v39-performance-monitor.js";
import "../ui/v39-operation-ui.js";
import "../ui/v39-feedback.js";
import "../core/v39-game-state-bridge.js";
import "../world/v39-economy-ui.js";
import "../world/v39-settlement-ui.js";
import "../ui/v39-legacy-ui.js";
import "../map/v39-field-runtime-final.js";
import "../map/v39-map-controls-layout.js";
import "../ui/v39-display-settings.js";
import "../dev/v39-test-tools.js";
import "../map/v39-camera-zoom-controller.js";
import "../map/v39-field-settings-entry.js";
import "../core/v39-play-mode-select.js";
import "../map/v39-field-settings-final.js";
import "../map/v39-field-settings-stabilizer.js";
import "../core/v39-initial-sovereign-ui.js";
import "../core/v39-multiplayer-lobby.js";
import "../core/v39-save-system.js";
import "../world/v39-nation-diplomacy-ui.js";
import "../core/v39-turn-system.js";
import "../core/v39-runtime-clock.js";
