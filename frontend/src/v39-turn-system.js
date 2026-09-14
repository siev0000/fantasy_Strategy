import { getV39DiscoveredFeature } from "./lib/v39-exploration-rules.js";
import { resolveV39FacilityEffectsAtTile } from "./lib/v39-economy-rules.js";
import { getSettlementForTerritory } from "./lib/settlement-state.js";

const DEFAULT_TIMELINE = Object.freeze({
  turnNumber: 1,
  paused: false,
  elapsedMs: 0,
  lastTurnAdvancedAtMs: 0,
  lastResolvedTurn: 0,
  lastStageSequence: []
});

let advancing = false;
let bannerTimer = 0;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isDead(unit) {
  return number(unit?.hp ?? unit?.currentHp, 0) <= 0 || String(unit?.state || unit?.statusName || "") === "死亡";
}

function normalizeTimeline(value = {}) {
  return {
    turnNumber: Math.max(1, Math.floor(number(value.turnNumber, DEFAULT_TIMELINE.turnNumber))),
    paused: value.paused === true,
    elapsedMs: Math.max(0, number(value.elapsedMs, 0)),
    lastTurnAdvancedAtMs: Math.max(0, number(value.lastTurnAdvancedAtMs, 0)),
    lastResolvedTurn:Math.max(0, Math.floor(number(value.lastResolvedTurn, 0))),
    lastStageSequence:Array.isArray(value.lastStageSequence) ? value.lastStageSequence.map(String) : []
  };
}

function restoreUnitForTurn(unit) {
  if (!unit || isDead(unit)) return { ...unit };
  const maxAp = Math.max(0, Math.floor(number(unit.maxAp ?? unit.maxActionPoint, 100)));
  return {
    ...unit,
    ap: maxAp,
    currentAp: maxAp,
    actionPoint: maxAp
  };
}

function recoverUnitHp(unit, faction, playerId, state, activityTurn, enemySide = false) {
  if (!unit || isDead(unit)) return { ...unit };
  const maxHp = Math.max(1, Math.floor(number(unit.maxHp ?? unit?.status?.HP, 1)));
  const hp = Math.max(0, Math.min(maxHp, Math.floor(number(unit.hp ?? unit.currentHp, maxHp))));
  if (hp >= maxHp) return { ...unit, hp, currentHp:hp };
  if (number(unit?.lastMovedTurn) >= activityTurn || number(unit?.lastCombatTurn) >= activityTurn) {
    return { ...unit, hp, currentHp:hp };
  }
  const key = Number.isFinite(Number(unit?.x)) && Number.isFinite(Number(unit?.y))
    ? `${Math.floor(Number(unit.x))},${Math.floor(Number(unit.y))}`
    : "";
  const featureRecovery = getV39DiscoveredFeature(faction, key)?.definition?.recoveryPercent || 0;
  const owned = key && String(state?.territoryOwnerByTile?.[key] || "") === String(playerId || "");
  const settlement = getSettlementForTerritory(faction, state?.territoryStateByTile?.[key]);
  const facilityRecovery = owned ? number(resolveV39FacilityEffectsAtTile(settlement, key)?.回復) : 0;
  const nest = enemySide && key
    ? (state?.enemyNests || []).find(row => String(row?.id || "") === String(unit?.nestId || "")
      && `${Math.floor(number(row?.x))},${Math.floor(number(row?.y))}` === key)
    : null;
  const nestRecovery = number(nest?.recoveryPercent ?? nest?.回復補正 ?? nest?.回復);
  const recovered = Math.max(1, Math.floor(maxHp * ((5 + featureRecovery + facilityRecovery + nestRecovery) / 100)));
  const nextHp = Math.min(maxHp, hp + recovered);
  return { ...unit, hp:nextHp, currentHp:nextHp };
}

function dispatchTurnStage(stage, turnNumber) {
  window.dispatchEvent(new CustomEvent(`v39:turn-stage-${stage}`, { detail:{ stage, turnNumber } }));
}

function showBanner(message, persistent = false) {
  const banner = document.getElementById("v39-turn-banner");
  if (!(banner instanceof HTMLElement)) return;
  window.clearTimeout(bannerTimer);
  banner.textContent = String(message || "");
  banner.classList.add("show");
  banner.classList.toggle("persistent", persistent);
  if (!persistent) bannerTimer = window.setTimeout(() => {
    if (window.getV39GameState?.()?.timeline?.paused === true) showBanner("時間停止", true);
    else banner.classList.remove("show");
  }, 2200);
}

function renderControls() {
  const state = window.getV39GameState?.();
  const timeline = normalizeTimeline(state?.timeline);
  const label = document.getElementById("v39-turn-label");
  const pause = document.getElementById("v39-time-pause");
  if (label) label.textContent = `T${timeline.turnNumber}`;
  if (pause) {
    pause.textContent = timeline.paused ? "再開" : "停止";
    pause.setAttribute("aria-pressed", String(timeline.paused));
  }
}

function installUi() {
  const playfield = document.querySelector(".playfield");
  if (!(playfield instanceof HTMLElement) || document.getElementById("v39-turn-controls")) return;
  const style = document.createElement("style");
  style.id = "v39-turn-system-style";
  style.textContent = `
    #v39-turn-controls{position:absolute;right:8px;top:8px;z-index:31;display:flex;align-items:center;gap:4px;padding:4px;border:1px solid #52646b;border-radius:8px;background:rgba(8,17,21,.9);box-shadow:0 3px 12px rgba(0,0,0,.28)}
    #v39-turn-controls button,#v39-turn-label{min-height:30px;border:1px solid #455b63;border-radius:6px;background:#142329;color:#e7eeee;padding:4px 9px;font-size:13px;font-weight:700}
    #v39-turn-label{display:grid;place-items:center;color:#8ee2ad;min-width:42px}
    #v39-turn-controls button{cursor:pointer}
    #v39-turn-controls button[aria-pressed="true"]{border-color:#dcba61;background:#382f18;color:#ffe7a2}
    #v39-turn-next{border-color:#6b8e72!important;background:#193024!important}
    #v39-turn-banner{position:absolute;left:50%;top:8px;z-index:32;min-width:180px;max-width:60%;transform:translate(-50%,-140%);opacity:0;padding:8px 20px;border:1px solid #74c7d6;border-radius:6px;background:rgba(7,22,27,.95);color:#edf7f5;text-align:center;font-size:16px;font-weight:800;pointer-events:none;transition:transform .2s ease,opacity .2s ease}
    #v39-turn-banner.show{transform:translate(-50%,0);opacity:1}
    #v39-turn-banner.persistent{border-color:#d8b65b;color:#ffe69a}
    @media(max-width:620px){#v39-turn-controls{top:42px}#v39-turn-banner{top:6px;max-width:72%;font-size:14px;padding:6px 12px}}
  `;
  document.head.appendChild(style);
  const controls = document.createElement("div");
  controls.id = "v39-turn-controls";
  controls.innerHTML = `<span id="v39-turn-label">T1</span><button type="button" id="v39-time-pause">停止</button><button type="button" id="v39-turn-next">ターン終了</button>`;
  const banner = document.createElement("div");
  banner.id = "v39-turn-banner";
  banner.setAttribute("role", "status");
  playfield.append(controls, banner);
  controls.querySelector("#v39-time-pause")?.addEventListener("click", () => setTimePaused(!normalizeTimeline(window.getV39GameState?.()?.timeline).paused));
  controls.querySelector("#v39-turn-next")?.addEventListener("click", () => advanceTurn());
  renderControls();
}

export function setTimePaused(paused) {
  const state = window.getV39GameState?.();
  if (!state) return false;
  const timeline = { ...normalizeTimeline(state.timeline), paused:paused === true };
  window.setV39GameState?.({ timeline }, { reason:"time-pause" });
  renderControls();
  showBanner(timeline.paused ? "時間停止" : "時間再開", timeline.paused);
  window.dispatchEvent(new CustomEvent("v39:time-pause-changed", { detail:{ paused:timeline.paused, timeline } }));
  return timeline.paused;
}

export function advanceTurn() {
  if (advancing) return false;
  const state = window.getV39GameState?.();
  if (!state) return false;
  advancing = true;
  try {
    const before = normalizeTimeline(state.timeline);
    const timeline = {
      ...before,
      turnNumber: before.turnNumber + 1,
      lastTurnAdvancedAtMs: before.elapsedMs
    };
    const players = (Array.isArray(state.players) ? state.players : []).map(player => ({
      ...player,
      factionState: {
        ...player.factionState,
        units: (Array.isArray(player?.factionState?.units) ? player.factionState.units : []).map(restoreUnitForTurn)
      }
    }));
    const enemies = (Array.isArray(state.enemies) ? state.enemies : []).map(restoreUnitForTurn);
    window.setV39GameState?.({ players, enemies, timeline }, { reason:"turn-start" });
    const stages = ["terrain", "ai", "exploration", "world", "economy", "research", "diplomacy"];
    for (const stage of stages) dispatchTurnStage(stage, timeline.turnNumber);
    const resolved = window.getV39GameState?.();
    const recoveredPlayers = (resolved?.players || []).map(player => ({
      ...player,
        factionState:{ ...player.factionState, units:(player?.factionState?.units || []).map(unit => recoverUnitHp(unit, player.factionState, player.id, resolved, before.turnNumber)) }
      }));
    const recoveredEnemies = (resolved?.enemies || []).map(unit => recoverUnitHp(unit, null, "", resolved, before.turnNumber, true));
    const completedTimeline = {
      ...normalizeTimeline(resolved?.timeline),
      lastResolvedTurn:timeline.turnNumber,
      lastStageSequence:["turn-start", ...stages, "recovery", "turn-complete"]
    };
    window.setV39GameState?.({ players:recoveredPlayers, enemies:recoveredEnemies, timeline:completedTimeline }, { reason:"turn-complete" });
    renderControls();
    showBanner(`ターン ${timeline.turnNumber} 開始`);
    window.dispatchEvent(new CustomEvent("v39:turn-advanced", { detail:{ previousTurn:before.turnNumber, turnNumber:timeline.turnNumber, stages:completedTimeline.lastStageSequence } }));
    return true;
  } finally {
    advancing = false;
  }
}

window.advanceV39Turn = advanceTurn;
window.setV39TimePaused = setTimePaused;
window.getV39Timeline = () => normalizeTimeline(window.getV39GameState?.()?.timeline);
window.showV39TurnBanner = showBanner;

window.addEventListener("v39:operation-ui-ready", installUi, { once:true });
window.addEventListener("v39:game-state-changed", renderControls);
installUi();
