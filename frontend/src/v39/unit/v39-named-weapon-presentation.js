import {getGameAudioController} from "../../lib/audio-player.js";
import {normalizeV39EquipmentItem} from "../../lib/v39-equipment-rules.js";
import {renderV39EquipmentIcon} from "../ui/v39-equipment-display.js";
import "./v39-named-weapon-presentation.css";

const shownByPlayer = new Map();
const pending = [];
let playing = null;

function playNext(playerId) {
  if (playing && playing.playerId === playerId) return;
  if (playing) {
    playing.element.remove();
    playing = null;
  }
  const index = pending.findIndex(entry => entry.playerId === playerId);
  if (index < 0) return;
  const [entry] = pending.splice(index, 1);
  const {item} = entry;
  const element = document.createElement("div");
  element.className = "v39-named-weapon-reveal";
  element.setAttribute("aria-hidden", "true");
  const icon = document.createElement("div");
  icon.className = "v39-named-weapon-reveal-icon";
  icon.innerHTML = renderV39EquipmentIcon(item);
  const title = document.createElement("strong");
  title.textContent = item.namedWeapon.name;
  element.append(icon, title);
  const container = [...document.querySelectorAll("dialog:modal")].at(-1) ?? document.body;
  container.append(element);
  playing = {element, playerId};
  getGameAudioController().playSe("confirm");
  window.setTimeout(() => {
    element.remove();
    if (playing?.element !== element) return;
    playing = null;
    playNext(window.getV39ActivePlayerId?.());
  }, 1800);
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
