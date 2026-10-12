import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { MAP_ENTITY_SIZE_RULES, tileRelativePx } from "../../lib/map-entity-size-rules.js";
import { resolveV39EffectTransform } from "../../lib/v39-effect-transform.js";

const fighter = new URL("../../../../assets/images/units/只人/ファイター.webp", import.meta.url).href;
const knight = new URL("../../../../assets/images/units/只人/ホーリーナイト.webp", import.meta.url).href;
// 中央が偶数行のときの隣接マス。フィールドと同じ幅・行間隔を使う。
const cells = [
  ["self", 0, 0, "自身"], ["0", 1, 0, "右"], ["60", .5, 1, "右下"],
  ["120", -.5, 1, "左下"], ["180", -1, 0, "左"],
  ["240", -.5, -1, "左上"], ["300", .5, -1, "右上"]
];

function cellOffsetX(dx, dy) {
  return dy ? HEX_TILE_CONFIG.oddRowOffsetX - (dx < 0 ? HEX_TILE_CONFIG.width : 0) : dx * HEX_TILE_CONFIG.width;
}

export function effectPreviewGeometry(stage, setting = {}) {
  const { width, height, rowStep } = HEX_TILE_CONFIG;
  const zoom = Math.max(.1, Math.min((stage.clientWidth - 24) / (width * 3), (stage.clientHeight - 24) / (height + rowStep * 2)));
  const selected = document.getElementById("v39-effect-preview-direction")?.value || "0";
  const cell = cells.find(([id]) => id === selected) || cells[1];
  const attacker = { x:stage.clientWidth / 2, y:stage.clientHeight / 2 };
  const dx = cellOffsetX(cell[1], cell[2]), dy = cell[2] * rowStep;
  const target = { x:attacker.x + dx * zoom, y:attacker.y + dy * zoom };
  const transformed = resolveV39EffectTransform(setting, { x:dx, y:dy }, Math.atan2(dy, dx) * 180 / Math.PI);
  return { x:attacker.x + transformed.x * zoom, y:attacker.y + transformed.y * zoom,
    angleDeg:transformed.angleDeg, attacker, target, zoom, self:selected === "self" };
}

export function renderEffectPreviewCombatants(stage) {
  if (!stage) return;
  let layer = stage.querySelector(".v39-effect-preview-combatants");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "v39-effect-preview-combatants";
    layer.innerHTML = `${cells.map(([id,,, label]) => `<button type="button" data-preview-cell="${id}" aria-label="対象マス：${label}"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,0 100,25 100,75 50,100 0,75 0,25"/></svg></button>`).join("")}<div data-preview-attacker><img src="${fighter}" alt="攻撃キャラ"></div><div data-preview-target><img src="${knight}" alt="受けるキャラ"></div>`;
    layer.addEventListener("click", event => {
      const button = event.target.closest("[data-preview-cell]");
      if (!button) return;
      const select = document.getElementById("v39-effect-preview-direction");
      select.value = button.dataset.previewCell;
      select.dispatchEvent(new Event("change", { bubbles:true }));
    });
    stage.appendChild(layer);
  }
  const geometry = effectPreviewGeometry(stage);
  const selected = document.getElementById("v39-effect-preview-direction").value;
  for (const [id, dx, dy] of cells) {
    const node = layer.querySelector(`[data-preview-cell="${id}"]`);
    node.style.left = `${geometry.attacker.x + cellOffsetX(dx, dy) * geometry.zoom}px`;
    node.style.top = `${geometry.attacker.y + dy * HEX_TILE_CONFIG.rowStep * geometry.zoom}px`;
    node.style.width = `${HEX_TILE_CONFIG.width * geometry.zoom}px`;
    node.style.height = `${HEX_TILE_CONFIG.height * geometry.zoom}px`;
    const upper = (HEX_TILE_CONFIG.height - HEX_TILE_CONFIG.rowStep) / HEX_TILE_CONFIG.height * 100;
    const lower = HEX_TILE_CONFIG.rowStep / HEX_TILE_CONFIG.height * 100;
    node.querySelector("polygon").setAttribute("points", `50,0 100,${upper} 100,${lower} 50,100 0,${lower} 0,${upper}`);
    node.style.clipPath = `polygon(50% 0,100% ${upper}%,100% ${lower}%,50% 100%,0 ${lower}%,0 ${upper}%)`;
    node.setAttribute("aria-pressed", String(id === selected));
  }
  for (const [selector, point] of [["[data-preview-attacker]", geometry.attacker], ["[data-preview-target]", geometry.target]]) {
    const node = layer.querySelector(selector);
    node.style.left = `${point.x}px`; node.style.top = `${point.y}px`;
    const size = tileRelativePx(MAP_ENTITY_SIZE_RULES.unit.diameterTiles) * MAP_ENTITY_SIZE_RULES.unit.imageFill * geometry.zoom;
    node.style.width = `${size}px`; node.style.height = `${size}px`;
  }
  layer.querySelector("[data-preview-target]").hidden = geometry.self;
  stage.dataset.attackDirection = selected;
  stage.dataset.previewZoom = String(geometry.zoom);
}
