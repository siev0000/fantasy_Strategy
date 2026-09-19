import { getV39DiscoveredFeature } from "./lib/v39-exploration-rules.js";
import { resolveV39FacilityEffectsAtTile } from "./lib/v39-economy-rules.js";
import { getSettlementForTerritory } from "./lib/settlement-state.js";
import { V39_TURN_PHASE } from "./lib/v39-turn-timing.js";
import { restoreV39SquadMovementForTurn } from "./lib/v39-squad-movement-rules.js";

const DEFAULT_TIMELINE = Object.freeze({
  turnNumber: 1,
  phase: V39_TURN_PHASE.PLAYER,
  paused: false,
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
    phase:Object.values(V39_TURN_PHASE).includes(value.phase) ? value.phase : V39_TURN_PHASE.PLAYER,
    paused: value.paused === true,
    lastResolvedTurn:Math.max(0, Math.floor(number(value.lastResolvedTurn, 0))),
    lastStageSequence:Array.isArray(value.lastStageSequence) ? value.lastStageSequence.map(String) : []
  };
}

function restoreUnitForTurn(unit) {
  if (!unit || isDead(unit)) return { ...unit };
  const configuredMaxAp = Math.max(0, Math.floor(number(unit.maxAp ?? unit.maxActionPoint, 100)));
  const starvationCap = Math.max(0, Math.floor(number(unit?.starvationApCap)));
  const maxAp = starvationCap > 0 ? Math.min(configuredMaxAp, starvationCap) : configuredMaxAp;
  return {
    ...unit,
    ap: maxAp,
    currentAp: maxAp,
    actionPoint: maxAp
  };
}

function clearExpiredGuard(unit, turnNumber) {
  if (number(unit?.guard) <= 0 || number(unit?.guardExpiresAtTurn) > turnNumber) return { ...unit };
  return { ...unit, guard:0, guardExpiresAtTurn:0 };
}

function recoverUnitHp(unit, faction, playerId, state, activityTurn, enemySide = false) {
  if (!unit || isDead(unit)) return { ...unit };
  if (number(unit?.starvationStage) >= 3) return { ...unit };
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

function setTurnPhase(state, timeline, phase, reason) {
  const nextTimeline = { ...timeline, phase };
  window.setV39GameState?.({ ...state, timeline:nextTimeline }, { reason });
  window.dispatchEvent(new CustomEvent("v39:turn-phase-changed", {
    detail:{ phase, turnNumber:nextTimeline.turnNumber }
  }));
  return nextTimeline;
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
  const header = document.querySelector(".topbar");
  const playfield = document.querySelector(".playfield");
  if (!(header instanceof HTMLElement) || !(playfield instanceof HTMLElement) || document.getElementById("v39-turn-controls")) return;
  const style = document.createElement("style");
  style.id = "v39-turn-system-style";
  style.textContent = `
    .topbar{
      position:relative!important;
      padding-right:56px!important;
    }
    #v39-turn-controls{
      position:absolute;right:6px;top:5px;z-index:34;
      width:42px;height:42px;overflow:visible
    }
    #v39-turn-toggle{
      position:relative;width:42px;height:42px;min-width:42px;min-height:42px;padding:0;
      display:grid;place-items:center;border:1px solid rgba(118,151,159,.9);border-radius:50%;
      background:radial-gradient(circle at 50% 50%,rgba(16,32,38,.96) 0 57%,rgba(9,19,23,.9) 59% 100%);
      color:#a9e8bd;box-shadow:0 3px 12px rgba(0,0,0,.28);cursor:pointer;backdrop-filter:blur(3px)
    }
    #v39-turn-toggle::before{
      content:"";position:absolute;inset:3px;border:1px solid rgba(116,199,214,.58);border-radius:50%;
      background:repeating-conic-gradient(from -2deg,rgba(154,211,218,.48) 0 1deg,transparent 1deg 30deg);
      pointer-events:none
    }
    #v39-turn-toggle::after{
      content:"";position:absolute;left:50%;top:3px;width:2px;height:5px;border-radius:999px;
      background:#d9c879;transform:translateX(-50%);pointer-events:none
    }
    #v39-turn-label{position:relative;z-index:1;font-size:11px;font-weight:900;line-height:1;letter-spacing:-.2px}
    #v39-turn-toggle[aria-expanded="true"]{border-color:#d9c879;box-shadow:0 0 0 2px rgba(217,200,121,.16),0 3px 12px rgba(0,0,0,.3)}
    #v39-turn-menu{
      position:absolute;right:48px;top:0;width:154px;min-height:42px;
      display:none;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:4px;padding:4px;
      border:1px solid rgba(82,100,107,.78);border-radius:8px;
      background:rgba(8,17,21,.76);box-shadow:0 5px 16px rgba(0,0,0,.26);backdrop-filter:blur(4px)
    }
    #v39-turn-controls.open #v39-turn-menu{display:grid}
    #v39-turn-menu button{
      min-width:0;min-height:32px;border:1px solid #455b63;border-radius:6px;
      background:rgba(20,35,41,.9);color:#e7eeee;padding:4px 7px;font-size:11px;font-weight:800;
      white-space:nowrap;cursor:pointer
    }
    #v39-turn-menu button[aria-pressed="true"]{border-color:#dcba61;background:#382f18;color:#ffe7a2}
    #v39-turn-next{border-color:#6b8e72!important;background:#193024!important}
    #v39-turn-banner{position:absolute;left:50%;top:8px;z-index:32;min-width:180px;max-width:60%;transform:translate(-50%,-140%);opacity:0;padding:8px 20px;border:1px solid #74c7d6;border-radius:6px;background:rgba(7,22,27,.95);color:#edf7f5;text-align:center;font-size:16px;font-weight:800;pointer-events:none;transition:transform .2s ease,opacity .2s ease}
    #v39-turn-banner.show{transform:translate(-50%,0);opacity:1}
    #v39-turn-banner.persistent{border-color:#d8b65b;color:#ffe69a}
    @media(max-width:700px){
      .topbar{padding-right:50px!important}
      #v39-turn-controls{right:5px;top:4px;width:38px;height:38px}
      #v39-turn-toggle{width:38px;height:38px;min-width:38px;min-height:38px}
      #v39-turn-label{font-size:10px}
      #v39-turn-menu{right:44px;width:140px;min-height:38px;padding:3px}
      #v39-turn-menu button{min-height:30px;padding:3px 5px;font-size:10px}
      #v39-turn-banner{top:6px;max-width:72%;font-size:14px;padding:6px 12px}
    }
  `;
  document.head.appendChild(style);
  const controls = document.createElement("div");
  controls.id = "v39-turn-controls";
  controls.innerHTML = `<button type="button" id="v39-turn-toggle" aria-label="ターン操作" aria-expanded="false"><span id="v39-turn-label">T1</span></button><div id="v39-turn-menu" aria-hidden="true"><button type="button" id="v39-time-pause">停止</button><button type="button" id="v39-turn-next">ターン終了</button></div>`;
  const banner = document.createElement("div");
  banner.id = "v39-turn-banner";
  banner.setAttribute("role", "status");
  header.appendChild(controls);
  playfield.appendChild(banner);
  const toggle = controls.querySelector("#v39-turn-toggle");
  const menu = controls.querySelector("#v39-turn-menu");
  const setMenuOpen = open => {
    const next = open === true;
    controls.classList.toggle("open", next);
    toggle?.setAttribute("aria-expanded", String(next));
    menu?.setAttribute("aria-hidden", String(!next));
  };
  toggle?.addEventListener("click", event => {
    event.stopPropagation();
    setMenuOpen(!controls.classList.contains("open"));
  });
  controls.querySelector("#v39-time-pause")?.addEventListener("click", event => {
    event.stopPropagation();
    setTimePaused(!normalizeTimeline(window.getV39GameState?.()?.timeline).paused);
    setMenuOpen(false);
  });
  controls.querySelector("#v39-turn-next")?.addEventListener("click", event => {
    event.stopPropagation();
    setMenuOpen(false);
    advanceTurn();
  });
  document.addEventListener("click", event => {
    if (!controls.contains(event.target)) setMenuOpen(false);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setMenuOpen(false);
  });
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

export async function advanceTurn() {
  if (advancing) return false;
  const state = window.getV39GameState?.();
  if (!state) return false;
  advancing = true;
  try {
    const before = normalizeTimeline(state.timeline);
    if (before.phase !== V39_TURN_PHASE.PLAYER) return false;
    const activeTurn = before.turnNumber;
    const enemyTimeline = setTurnPhase({
      ...state,
      enemies:(Array.isArray(state.enemies) ? state.enemies : [])
        .map(unit => clearExpiredGuard(unit, activeTurn))
        .map(restoreUnitForTurn)
    }, before, V39_TURN_PHASE.ENEMY, "enemy-turn-start");
    showBanner(`エネミーターン ${activeTurn}`);
    await window.runV39EnemyTurn?.(activeTurn);
    const afterEnemy = window.getV39GameState?.() || state;
    const nextTurn = activeTurn + 1;
    const resolvingTimeline = setTurnPhase(afterEnemy, enemyTimeline, V39_TURN_PHASE.RESOLUTION, "turn-resolution-start");
    const stages = ["terrain", "ai", "exploration", "world", "economy", "research", "diplomacy"];
    for (const stage of stages) dispatchTurnStage(stage, nextTurn);
    const resolved = window.getV39GameState?.();
    const recoveredPlayers = (resolved?.players || []).map(player => {
      const factionState = {
          ...player.factionState,
          units:(player?.factionState?.units || [])
            .map(unit => recoverUnitHp(unit, player.factionState, player.id, resolved, activeTurn))
            .map(unit => clearExpiredGuard(unit, nextTurn))
            .map(restoreUnitForTurn)
      };
      return { ...player, factionState:restoreV39SquadMovementForTurn(factionState) };
    });
    const recoveredEnemies = (resolved?.enemies || []).map(unit => recoverUnitHp(unit, null, "", resolved, activeTurn, true));
    const completedTimeline = {
      ...normalizeTimeline(resolvingTimeline),
      turnNumber:nextTurn,
      phase:V39_TURN_PHASE.PLAYER,
      lastResolvedTurn:activeTurn,
      lastStageSequence:["player-turn", "enemy-turn", ...stages, "recovery", "turn-complete"]
    };
    window.setV39GameState?.({ players:recoveredPlayers, enemies:recoveredEnemies, timeline:completedTimeline }, { reason:"turn-complete" });
    renderControls();
    showBanner(`プレイヤーターン ${nextTurn}`);
    window.dispatchEvent(new CustomEvent("v39:turn-phase-changed", { detail:{ phase:V39_TURN_PHASE.PLAYER, turnNumber:nextTurn } }));
    window.dispatchEvent(new CustomEvent("v39:turn-advanced", { detail:{ previousTurn:activeTurn, turnNumber:nextTurn, stages:completedTimeline.lastStageSequence } }));
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
