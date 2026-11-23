import {getGameAudioController} from "../../lib/audio-player.js";
import {normalizeV39EquipmentItem} from "../../lib/v39-equipment-rules.js";
import {resolveV39NamedUnitArtwork} from "../../lib/v39-named-unit-artwork.js";
import {resolveUnitArtwork} from "../../lib/map-entity-artwork.js";
import {renderV39EquipmentIcon} from "../ui/v39-equipment-display.js";
import "./v39-named-weapon-presentation.css";

const shownByPlayer = new Map();
const pending = [];
const REVEAL_MS = 2000;
let playing = null;

function renderUnitPortrait(icon, unit) {
  const art = resolveV39NamedUnitArtwork(unit,{normal:true}) || resolveUnitArtwork(unit);
  if (!art?.src) {
    icon.textContent = unit.icon || unit.glyph || "◆";
    return;
  }
  const portrait = document.createElement("span");
  portrait.className = "v39-named-reveal-portrait";
  portrait.style.backgroundImage = `url(${JSON.stringify(art.src)})`;
  const frame = art.sheetFrame;
  if (frame) {
    portrait.style.backgroundSize = `${frame.columns * 100}% ${frame.rows * 100}%`;
    const x = frame.column / Math.max(1,frame.columns - 1) * 100;
    const y = frame.row / Math.max(1,frame.rows - 1) * 100;
    portrait.style.backgroundPosition = `${x}% ${y}%`;
  }
  icon.append(portrait);
}

function playNext(playerId) {
  if (playing && playing.playerId === playerId) return;
  if (playing) {
    playing.element.remove();
    playing = null;
  }
  const index = pending.findIndex(entry => entry.playerId === playerId);
  if (index < 0) return;
  const [entry] = pending.splice(index, 1);
  const {item, unit} = entry;
  const element = document.createElement("div");
  element.className = "v39-named-reveal";
  element.style.setProperty("--v39-named-reveal-time", `${REVEAL_MS}ms`);
  element.setAttribute("aria-hidden", "true");
  const stage = document.createElement("div");
  stage.className = "v39-named-reveal-stage";
  const light = document.createElement("span");
  light.className = "v39-named-reveal-light";
  const icon = document.createElement("div");
  icon.className = "v39-named-reveal-icon";
  if (unit) renderUnitPortrait(icon, unit);
  else icon.innerHTML = renderV39EquipmentIcon(item);
  stage.append(light, icon);
  const title = document.createElement("strong");
  title.textContent = unit?.namedUnit.name ?? item.namedWeapon.name;
  element.append(stage, title);
  const container = [...document.querySelectorAll("dialog:modal")].at(-1) ?? document.body;
  container.append(element);
  playing = {element, playerId};
  getGameAudioController().playSe("namedWeapon");
  window.setTimeout(() => {
    element.remove();
    if (playing?.element !== element) return;
    playing = null;
    playNext(window.getV39ActivePlayerId?.());
  }, REVEAL_MS);
}

export function previewV39NamedWeaponReveal(item) {
  const playerId = window.getV39ActivePlayerId?.();
  pending.push({item, playerId});
  playNext(playerId);
}

function showNewNamedWeapons() {
  const state = window.getV39EnemyTurnState?.();
  if (window.__v39BackgroundWorldTurn || state?.timeline?.phase !== "player") return;
  const player = state.players.find(row => row.id === state.activePlayerId);
  if (!player || !window.pushV39Notification) return;
  const receipts = player.factionState.namedWeaponReceipts || [];
  const currentReceipts = new Set(receipts.map(receipt => receipt.id));
  const shown = shownByPlayer.get(player.id) ?? new Set();
  for (const id of shown) if (!currentReceipts.has(id)) shown.delete(id);
  for (const receipt of receipts) {
    if (shown.has(receipt.id) || receipt.turn < state.timeline.turnNumber - 1) continue;
    shown.add(receipt.id);
    const item = normalizeV39EquipmentItem(receipt.item) ?? receipt.item;
    pending.push({item, playerId:player.id});
    window.pushV39Notification(`${receipt.settlementName || "拠点"}で${receipt.item.namedWeapon.name}が誕生しました`, {
      title:"ネームド武器", tone:"success", audiencePlayerId:player.id
    });
  }
  shownByPlayer.set(player.id, shown);
  playNext(player.id);
}

window.addEventListener("v39:game-state-changed", showNewNamedWeapons);
window.addEventListener("v39:named-unit-achieved", ({detail:{playerId,unit}}) => {
  const state = window.getV39EnemyTurnState?.();
  if (state?.players.find(player => player.id === playerId)?.isPlayer === false) return;
  pending.push({unit,playerId});
  queueMicrotask(() => {
    const current = window.getV39EnemyTurnState?.();
    if (!window.__v39BackgroundWorldTurn && current?.timeline?.phase === "player") playNext(current.activePlayerId);
  });
});
