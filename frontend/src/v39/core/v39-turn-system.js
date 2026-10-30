import {usesV39OperationPhases,isV39TerritoryPhase,normalizeV39OperationTimeline,advanceV39OperationCycle,finishV39TerritoryPlanning} from '../../lib/v39-operation-phases.js';
import {resolveV39TurnPhaseDisplay} from '../ui/v39-turn-phase-display.js';
import { getV39DiscoveredFeature } from "../../lib/v39-exploration-rules.js";
import {v39HazardRecoveryFromState} from '../../lib/v39-hazard-zones.js';
import { advanceV39PersonalDefenses } from "../../lib/v39-defense-rules.js";
import {pruneV39DefenseStructures} from '../../lib/v39-wall-edges.js';
import {resolveV39GroundCollapses} from '../world/v39-terrain-destruction.js';
import { advanceV39NaturalFog, advanceV39Fog } from "../../lib/v39-fog-rules.js";
import { resolveV39FacilityEffectsAtTile } from "../../lib/v39-economy-rules.js";
import { getSettlementForTerritory } from "../../lib/settlement-state.js";
import {resolveV39CitySpecializationModifiers} from '../../lib/v39-city-specialization-rules.js';
import { V39_TURN_PHASE } from "../../lib/v39-turn-timing.js";
import { restoreV39SquadMovementForTurn } from "../../lib/v39-squad-movement-rules.js";
import { normalizeV39PlayerTurnTimeline } from "../../lib/v39-local-multiplayer-session.js";
import { isV39UnitUnacted } from "../../lib/v39-unit-action-rules.js";
import {finishV39RecoveryWait} from '../../lib/v39-recovery-wait.js';
import { focusV39MapTile } from '../map/v39-map-focus.js';
import { advanceV39AutomaticTransport } from "../../lib/v39-transport-rules.js";
import {advanceV39TradeLogistics} from '../../lib/v39-trade-logistics.js';
import { showV39TurnLoading, paintV39TurnLoading } from "../ui/v39-turn-loading.js";
import { showV39SideNotice } from "../ui/v39-notification-rail.js";
import { withV39WorldContext, v39TurnWorldIds } from "./v39-world-context.js";
import {advanceV39RecruitTraining} from "../../lib/v39-recruit-training.js";
import {advanceV39RecruitInstructorMovement} from "../../lib/v39-recruit-instructor.js";
import { advanceV39ExpeditionTools, advanceV39ToolSites } from "../../lib/v39-expedition-tools.js";
import {advanceV39ToolProduction} from "../../lib/v39-consumables.js";
import {advanceV39SquadRallies} from '../../lib/v39-squad-coordination.js';
import {advanceV39Teleports} from '../../lib/v39-teleport-rules.js';

const DEFAULT_TIMELINE = Object.freeze({
  turnNumber: 1,
  phase: V39_TURN_PHASE.PLAYER,
  paused: false,
  lastResolvedTurn: 0,
  lastStageSequence: [],
  playerTurnOrder: [],
  activeTurnPlayerId: "",
  endedPlayerIds: []
});

let advancing = false;
let latestTurnPerformance = null;
let displayedPlanningKey='';
let displayedPhase='',phaseBannerTimer;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isDead(unit) {
  return number(unit?.hp ?? unit?.currentHp, 0) <= 0 || String(unit?.state || unit?.statusName || "") === "死亡";
}

function normalizeTimeline(value = {}, players = [], fallbackActivePlayerId = "") {
  // NPC勢力はターン操作の担当者ではなく、解決フェーズの勢力AIで動かす。
  const turnPlayers = (Array.isArray(players) ? players : []).filter(player => player?.isPlayer !== false);
  return {
    turnNumber: Math.max(1, Math.floor(number(value.turnNumber, DEFAULT_TIMELINE.turnNumber))),
    phase:Object.values(V39_TURN_PHASE).includes(value.phase) ? value.phase : V39_TURN_PHASE.PLAYER,
    paused: value.paused === true,
    lastResolvedTurn:Math.max(0, Math.floor(number(value.lastResolvedTurn, 0))),
    lastStageSequence:Array.isArray(value.lastStageSequence) ? value.lastStageSequence.map(String) : [],
    ...normalizeV39OperationTimeline(value),
    ...normalizeV39PlayerTurnTimeline(value, turnPlayers, fallbackActivePlayerId)
  };
}

function restoreUnitForTurn(unit) {
  unit = finishV39RecoveryWait(unit);
  if (!unit || isDead(unit)) return { ...unit };
  const configuredMaxAp = Math.max(0, Math.floor(number(unit.maxAp ?? unit.maxActionPoint, 100)));
  const starvationCap = Math.max(0, Math.floor(number(unit?.starvationApCap)));
  const maxAp = starvationCap > 0 ? Math.min(configuredMaxAp, starvationCap) : configuredMaxAp;
  return {
    ...unit,
    waitTurnNumber:0,
    ap: maxAp,
    currentAp: maxAp,
    actionPoint: maxAp
  };
}

function clearExpiredGuard(unit, turnNumber) {
  unit = advanceV39PersonalDefenses(unit, turnNumber);
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
  const settlement = getSettlementForTerritory(faction||state?.players?.find(player=>player.id===playerId)?.factionState, state?.territoryStateByTile?.[key]);
  const facilityRecovery = owned ? number(resolveV39FacilityEffectsAtTile(settlement, key)?.回復)+resolveV39CitySpecializationModifiers(settlement,{tileKey:key,worldId:unit.worldId||'surface'}).recoveryPercent : 0;
  const nest = enemySide && key
    ? (state?.enemyNests || []).find(row => String(row?.id || "") === String(unit?.nestId || "")
      && `${Math.floor(number(row?.x))},${Math.floor(number(row?.y))}` === key)
    : null;
  const nestRecovery = number(nest?.recoveryPercent ?? nest?.回復補正 ?? nest?.回復);
  const recovered = Math.floor(Math.max(1, Math.floor(maxHp * ((5 + featureRecovery + facilityRecovery + nestRecovery) / 100)))*v39HazardRecoveryFromState(state,unit));
  const nextHp = Math.min(maxHp, hp + recovered);
  return { ...unit, hp:nextHp, currentHp:nextHp };
}

function dispatchTurnStage(stage, turnNumber) {
  window.dispatchEvent(new CustomEvent(`v39:turn-stage-${stage}`, { detail:{ stage, turnNumber } }));
}

function setTurnPhase(state, timeline, phase, reason) {
  const nextTimeline = { ...timeline, phase };
  window.setV39GameState?.({ ...state, timeline:nextTimeline }, { reason,returnState:false });
  window.dispatchEvent(new CustomEvent("v39:turn-phase-changed", {
    detail:{ phase, turnNumber:nextTimeline.turnNumber }
  }));
  return nextTimeline;
}

function showBanner(message, persistent = false) {
  // 停止状態はターン操作ボタンに保持。通知自体は他の新着と同じく期限で消す。
  return showV39SideNotice(message,{title:"ターン",tone:persistent ? "warn" : "info",durationMs:2200});
}

function renderControls() {
  const timeline = window.getV39TimelineState?.() || normalizeTimeline();
  const label = document.getElementById("v39-turn-label");
  const pause = document.getElementById("v39-time-pause");
  const testNext = document.getElementById("v39-turn-test-next");
  if (testNext) testNext.hidden = window.isV39TestMode?.() !== true;
  const current={gameSettings:window.getV39GameSettings?.()||{},timeline};
  const nation=isV39TerritoryPhase(current),phased=usesV39OperationPhases(current);
  const display=resolveV39TurnPhaseDisplay(current.gameSettings,timeline);
  if(label)label.textContent=display.turn;
  const counter=document.getElementById('v39-turn-phase-count');
  if(counter){counter.hidden=!phased;counter.textContent=String(display.count);}
  const planningKey=nation?`${timeline.turnNumber}:${timeline.activeTurnPlayerId||window.getV39ActivePlayerId?.()}`:'';
  if(planningKey&&planningKey!==displayedPlanningKey)queueMicrotask(()=>window.openV39TerritoryManagement?.());
  displayedPlanningKey=planningKey;
  const next=document.getElementById('v39-turn-next');
  if(next)next.textContent=nation?'拠点フェーズを終了':'ターン終了';
  const toggle=document.getElementById('v39-turn-toggle');
  if(toggle){toggle.title=display.title;toggle.dataset.operationPhase=display.phase;toggle.setAttribute('aria-label',`${display.turn} ${display.title}`);}
  const phase=document.getElementById('v39-operation-phase-banner');
  if(phase&&displayedPhase!==display.phase){
    clearTimeout(phaseBannerTimer);phase.hidden=!phased;phase.dataset.operationPhase=display.phase;
    phase.textContent=display.announcement;
    phase.classList.remove('is-entering');
    if(phased){void phase.offsetWidth;phase.classList.add('is-entering');phaseBannerTimer=setTimeout(()=>{phase.hidden=true;},3000);}
    displayedPhase=display.phase;
  }
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
    #v39-turn-label{position:relative;z-index:1;font-size:var(--font-size-11);font-weight:900;line-height:1;letter-spacing:-.2px}
    #v39-turn-toggle[data-operation-phase]:not([data-operation-phase="standard"]){display:flex;flex-direction:column;justify-content:center;gap:2px}
    #v39-turn-phase-count{position:relative;z-index:1;border-top:1px solid currentColor;padding-top:2px;width:22px;text-align:center;font-size:10px;font-weight:900;line-height:1;color:#82dced}
    #v39-turn-phase-count[hidden]{display:none}
    #v39-turn-toggle[data-operation-phase="territory"]{color:#efd17b;border-color:#d9b965}
    #v39-turn-toggle[data-operation-phase="territory"] #v39-turn-phase-count{color:#efd17b}
    #v39-turn-toggle[data-operation-phase="expedition"]{color:#82dced;border-color:#70becf}
    #v39-operation-phase-banner{position:absolute;top:3px;left:10px;right:10px;z-index:35;background:#10242df2;color:#82dced;border:1px solid #70becf;border-radius:5px;padding:5px 6px;font-size:var(--font-body);font-weight:700;text-align:center;pointer-events:none}
    #v39-operation-phase-banner[data-operation-phase="territory"]{color:#efd17b;border-color:#d9b965}
    #v39-operation-phase-banner[hidden]{display:none}
    #v39-operation-phase-banner.is-entering{animation:v39-phase-enter 3s ease both}
    @keyframes v39-phase-enter{0%{opacity:0;transform:translateY(-8px)}10%,85%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-3px)}}
    @media(prefers-reduced-motion:reduce){#v39-operation-phase-banner.is-entering{animation:none}}
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
      background:rgba(20,35,41,.9);color:#e7eeee;padding:4px 7px;font-size:var(--font-size-11);font-weight:800;
      white-space:nowrap;cursor:pointer
    }
    #v39-turn-menu button[aria-pressed="true"]{border-color:#dcba61;background:#382f18;color:#ffe7a2}
    #v39-turn-next{border-color:#6b8e72!important;background:#193024!important}
    #v39-turn-test-next{grid-column:1/-1;border-color:#b69b56;background:#352d18;color:#ffe5a0}
    #v39-turn-test-next[hidden]{display:none!important}
    #v39-turn-test-next:disabled{opacity:.5;cursor:wait}
    @media(max-width:700px){
      .topbar{padding-right:50px!important}
      #v39-turn-controls{right:5px;top:4px;width:38px;height:38px}
      #v39-turn-toggle{width:38px;height:38px;min-width:38px;min-height:38px}
      #v39-turn-label{font-size:var(--font-size-10)}
      #v39-turn-menu{right:44px;width:140px;min-height:38px;padding:3px}
      #v39-turn-menu button{min-height:30px;padding:3px 5px;font-size:var(--font-size-10)}
    }
  `;
  document.head.appendChild(style);
  const controls = document.createElement("div");
  controls.id = "v39-turn-controls";
  controls.innerHTML = `<button type="button" id="v39-turn-toggle" aria-label="ターン操作" aria-expanded="false"><span id="v39-turn-label">T1</span><span id="v39-turn-phase-count" hidden></span></button><div id="v39-turn-menu" aria-hidden="true"><button type="button" id="v39-time-pause">停止</button><button type="button" id="v39-turn-next">ターン終了</button><button type="button" id="v39-turn-test-next" title="未行動確認を省略して1ターン経過（テスト用）" hidden>1T経過</button></div>`;
  header.appendChild(controls);
  const phaseBanner=document.createElement('div');phaseBanner.id='v39-operation-phase-banner';phaseBanner.setAttribute('role','status');
  phaseBanner.hidden=true;
  playfield.appendChild(phaseBanner);
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
    setTimePaused(!normalizeTimeline(window.getV39TimelineState?.()).paused);
    setMenuOpen(false);
  });
  controls.querySelector("#v39-turn-next")?.addEventListener("click", event => {
    event.stopPropagation();
    setMenuOpen(false);
    advanceTurn();
  });
  controls.querySelector("#v39-turn-test-next")?.addEventListener("click", async event => {
    event.stopPropagation();
    if (window.isV39TestMode?.() !== true || event.currentTarget.disabled) return;
    const button = event.currentTarget;
    button.disabled = true;
    setMenuOpen(false);
    try {
      await window.advanceV39TestTurns?.(1);
    } finally {
      button.disabled = false;
    }
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
  const state = window.getV39GameState?.({includeWorlds:false});
  if (!state) return false;
  const timeline = { ...normalizeTimeline(state.timeline), paused:paused === true };
  window.setV39GameState?.({ timeline }, { reason:"time-pause",returnState:false });
  renderControls();
  showBanner(timeline.paused ? "時間停止" : "時間再開", timeline.paused);
  window.dispatchEvent(new CustomEvent("v39:time-pause-changed", { detail:{ paused:timeline.paused, timeline } }));
  return timeline.paused;
}

function focusUnactedUnit(state, playerId, turnNumber) {
  const player = state.players.find(row => row.id === playerId);
  const unit = player?.factionState?.units?.find(row => isV39UnitUnacted(row, turnNumber, player.factionState)
    && (!player.factionState.combatRuntime?.pendingActionsByUnitId?.[row.id] || player.factionState.combatRuntime.pendingActionsByUnitId[row.id].aimAfterCast&&Number(player.factionState.combatRuntime.pendingActionsByUnitId[row.id].resolvesAtTurn)<=turnNumber));
  if (!unit) return false;
  window.cancelV39SelectedUnitMove?.("unacted-focus");
  window.cancelV39SelectedUnitAttack?.("unacted-focus");
  window.setV39GameState?.({ activePlayerId:playerId, players:state.players.map(row => row.id !== playerId ? row : ({
    ...row, factionState:{ ...row.factionState, selectedUnitId:unit.id }
  })) }, { reason:"unacted-unit-focus",returnState:false });
  window.dispatchEvent(new CustomEvent("v39:unit-selected", { detail:{ unitId:unit.id, unit } }));
  window.activateV39FooterTab?.("squad");
  focusV39MapTile(unit,{worldId:unit.worldId||'surface'});
  showBanner(`${unit.name || "キャラクター"}は未行動です。行動または待機を選んでください`);
  return true;
}

export async function advanceTurn(options = {}) {
  if (advancing || window.isV39MapInputLocked?.()) return false;
  let state = window.getV39GameState?.();
  if (!state) return false;
  if (state?.victory?.completed === true) {
    showBanner("勝利済みです", true);
    return false;
  }
  advancing = true;
  const presentation=options.presentation!==false||window.isV39TestMode?.()!==true;
  let inputToken = null;
  let batchToken = null;
  const timings = {};
  try {
    const before = normalizeTimeline(state.timeline, state.players, state.activePlayerId);
    if (before.phase !== V39_TURN_PHASE.PLAYER) return false;
    if(isV39TerritoryPhase(state)){
      const approved=window.confirmV39TerritoryPhaseEnd?await window.confirmV39TerritoryPhaseEnd(state):window.confirm?.('拠点フェーズを終了しますか？')===true;
      if(!approved)return false;
      const fresh=window.getV39GameState();
      if(!isV39TerritoryPhase(fresh)||fresh.activePlayerId!==state.activePlayerId||fresh.timeline.turnNumber!==state.timeline.turnNumber)return false;
      state=fresh;
      const next=finishV39TerritoryPlanning(state);
      if(!next.ok)return false;
      window.setV39GameState({activePlayerId:next.state.activePlayerId,timeline:next.state.timeline},{reason:'territory-planning-finished',returnState:false});
      if(!isV39TerritoryPhase(next.state))window.activateV39FooterTab?.('squad');
      showBanner(isV39TerritoryPhase(next.state)?'この勢力の拠点フェーズ終了。次の勢力へ移ります':'拠点フェーズ終了。戦闘・探索を開始します');
      renderControls();return true;
    }
    const playerTimeline = normalizeV39PlayerTurnTimeline(
      before,
      (state.players || []).filter(player => player?.isPlayer !== false),
      state.activePlayerId
    );
    const currentPlayerId = playerTimeline.activeTurnPlayerId || state.activePlayerId;
    if (options.skipUnactedFocus !== true && window.getV39DisplaySettings?.()?.focusUnactedUnits !== false
      && focusUnactedUnit(state, currentPlayerId, before.turnNumber)) return false;
    const rallyWorlds=new Set((state.players.find(player=>player.id===currentPlayerId)?.factionState.units||[])
      .filter(unit=>unit.squadMoveMode==='gather'&&Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡').map(unit=>unit.worldId||'surface'));
    if(rallyWorlds.size)for(const worldId of v39TurnWorldIds().filter(id=>rallyWorlds.has(id)))await withV39WorldContext(worldId,()=>{
        const scoped=window.getV39GameState({includeWorlds:false});
        const result=advanceV39SquadRallies(scoped,currentPlayerId,window.__v39FieldRuntime?.mapData,before.turnNumber);
        if(result.state!==scoped)window.setV39GameState({players:result.state.players},{reason:'squad-rally',returnState:false});
      });
    const transportWorld=v39TurnWorldIds().includes("surface")?"surface":state.activeWorldId;
    await withV39WorldContext(transportWorld,()=>{
      const scoped=window.getV39GameState({includeWorlds:false});
      const instructors=advanceV39RecruitInstructorMovement(scoped,currentPlayerId,window.__v39FieldRuntime?.mapData,before.turnNumber);
      const transport=advanceV39AutomaticTransport(instructors.state,currentPlayerId,window.__v39FieldRuntime?.mapData,
        before.turnNumber,window.__v39FieldRuntime?.mapData?.worldWrapEnabled!==false);
      if(transport.state!==scoped){
        window.setV39GameState({players:transport.state.players},{reason:"automatic-transport",returnState:false});
        for(const report of transport.reports)window.appendV39ActivityLog?.(currentPlayerId,"物資",`${report.action}: ${report.resource} ${report.amount}`,report);
      }
      const trade=advanceV39TradeLogistics(transport.state,currentPlayerId,window.__v39FieldRuntime?.mapData,before.turnNumber);
      if(trade.state!==transport.state){window.setV39GameState({players:trade.state.players,neutralVillages:trade.state.neutralVillages,settlements:trade.state.settlements},{reason:'trade-transport',returnState:false});
        for(const report of trade.reports)window.appendV39ActivityLog?.(currentPlayerId,'取引',report.message,report);}
    });
    window.advanceV39MineDuties?.(currentPlayerId,before.turnNumber);
    window.advanceV39LogisticsRoutes?.(currentPlayerId,before.turnNumber);
    state=window.getV39GameState();
    const endedPlayerIds = [...new Set([...playerTimeline.endedPlayerIds, currentPlayerId])];
    const nextPlayerId = playerTimeline.playerTurnOrder.find(playerId => !endedPlayerIds.includes(playerId));
    if (nextPlayerId) {
      const nextTimeline = {
        ...before,
        ...playerTimeline,
        activeTurnPlayerId:nextPlayerId,
        endedPlayerIds
      };
      window.setV39GameState?.({ activePlayerId:nextPlayerId, timeline:nextTimeline }, { reason:"player-turn-switched",returnState:false });
      const nextPlayer = window.getV39GameState?.({includeWorlds:false})?.players?.find(player => player.id === nextPlayerId);
      showBanner(`${nextPlayer?.label || nextPlayerId}のターン ${before.turnNumber}`);
      renderControls();
      window.dispatchEvent(new CustomEvent("v39:player-turn-switched", {
        detail:{ turnNumber:before.turnNumber, previousPlayerId:currentPlayerId, activePlayerId:nextPlayerId, endedPlayerIds }
      }));
      return true;
    }
    const activeTurn = before.turnNumber;
    inputToken = window.beginV39MapInputLock?.("turn-resolution");
    showV39TurnLoading("敵AI処理中…");
    await paintV39TurnLoading();
    const enemyTimeline = setTurnPhase({
      ...state,
      enemies:(Array.isArray(state.enemies) ? state.enemies : [])
        .map(unit => clearExpiredGuard(unit, activeTurn))
        .map(restoreUnitForTurn)
    }, before, V39_TURN_PHASE.ENEMY, "enemy-turn-start");
    showBanner(`エネミーターン ${activeTurn}`);
    const worldIds=v39TurnWorldIds(),visibleWorldId=state.activeWorldId||"surface";
    timings.enemy={};
    const mineOperations=!!window.__v39FieldRuntime?.mapData?.caveMine||Object.values(state.explorationWorlds||{}).some(world=>world.map?.caveMine);
    if(mineOperations)for(const worldId of worldIds.length?worldIds:[visibleWorldId]){
      await withV39WorldContext(worldId,()=>{
        const current=window.getV39GameState({includeWorlds:false});
        window.setV39GameState({enemies:current.enemies.map(unit=>clearExpiredGuard(unit,activeTurn)).map(restoreUnitForTurn)},{returnState:false});
      });
    }
    if(mineOperations)window.advanceV39CaveIntrusions?.(activeTurn);
    for(const worldId of worldIds.length?worldIds:[visibleWorldId]){
      await withV39WorldContext(worldId,async()=>{
        if(!mineOperations){const current=window.getV39GameState({includeWorlds:false});window.setV39GameState({enemies:current.enemies.map(unit=>clearExpiredGuard(unit,activeTurn)).map(restoreUnitForTurn)},{returnState:false});}
        timings.enemy[worldId]=await window.runV39EnemyTurn?.(activeTurn,{presentation:presentation&&worldId===visibleWorldId});
      });
    }
    const afterEnemy = window.getV39GameState?.({includeWorlds:false}) || state;
    const nextTurn = activeTurn + 1;
    const resolvingTimeline = setTurnPhase(afterEnemy, enemyTimeline, V39_TURN_PHASE.RESOLUTION, "turn-resolution-start");
    const stages = ["terrain", "ai", "exploration", "world", "economy", "research", "diplomacy"];
    const stageNames = { terrain:"地形", ai:"勢力AI", exploration:"調査", world:"住民", economy:"経済・建設", research:"研究", diplomacy:"外交" };
    batchToken = window.beginV39MapRenderBatch?.("turn-resolution");
    for (const stage of stages) {
      showV39TurnLoading(`${stageNames[stage]}処理中…`);
      await paintV39TurnLoading();
      const startedAt = performance.now();
      const targets=["exploration","world","ai"].includes(stage)?worldIds
        :[worldIds.includes("surface")?"surface":visibleWorldId];
      for(const worldId of targets.length?targets:[visibleWorldId]){
        // 地下に都市・天候はない。全体の研究・外交・消費は一度だけ進める。
        if(worldId!=='surface'&&stage==='terrain')continue;
        if(worldId!=='surface'&&stage==='ai'){
          const snapshot=window.getV39EnemyTurnState();
          if(!snapshot.explorationWorlds?.[worldId]?.map?.hegemonyInterior
            ||!snapshot.players.some(player=>player.isPlayer===false&&player.factionState.units.some(unit=>unit.worldId===worldId&&Number(unit.hp??unit.currentHp)>0)))continue;
        }
        await withV39WorldContext(worldId,()=>{
          if(stage==="terrain") advanceV39NaturalFog(window.__v39FieldRuntime?.mapData,nextTurn);
          dispatchTurnStage(stage,nextTurn);
          if (stage === "economy" && worldId === "surface") {
            const result = advanceV39RecruitTraining(window.getV39GameState({includeWorlds:false}), nextTurn);
            window.setV39GameState({players:result.state.players}, {reason:"recruit-training",returnState:false});
            for (const {playerId,unit} of result.completedUnits) {
              window.dispatchEvent(new CustomEvent("v39:units-created", {detail:{playerId,units:[unit]}}));
              if (playerId === window.getV39ActivePlayer?.()?.id) showBanner(`訓練完了: ${unit.name} Lv${unit.level}`);
            }
          }
        },{allUnits:["economy","research","diplomacy"].includes(stage)});
      }
      timings[stage] = performance.now() - startedAt;
    }
    showV39TurnLoading("予約行動・死亡判定・回復処理中…");
    await paintV39TurnLoading();
    const combatResolutionStartedAt = performance.now();
    for(const worldId of worldIds.length?worldIds:[visibleWorldId]){
      await withV39WorldContext(worldId,()=>{
        resolveV39GroundCollapses(nextTurn);
        const map = window.__v39FieldRuntime?.mapData;
        advanceV39Fog(map,nextTurn);
        if(map?.caveSites)map.caveSites=advanceV39ToolSites(map,nextTurn).caveSites;
        if (map?.defenseStructures) map.defenseStructures = pruneV39DefenseStructures(map.defenseStructures,nextTurn);
        const defenseState = window.getV39GameState({includeWorlds:false});
        window.setV39GameState({
          players:defenseState.players.map(player => ({ ...player, factionState:{ ...player.factionState,
            units:player.factionState.units.map(unit => advanceV39PersonalDefenses(unit, nextTurn)) } })),
          enemies:defenseState.enemies.map(unit => advanceV39PersonalDefenses(unit, nextTurn)),
          neutralVillages:(defenseState.neutralVillages || []).map(village => ({ ...village,
            defenseUnits:(village.defenseUnits || []).map(unit => advanceV39PersonalDefenses(unit, nextTurn)) }))
        },{returnState:false});
        window.resolveV39PendingCombatActions?.(nextTurn);
        window.runV39DeathLifecycle?.(nextTurn);
        window.resolveV39CorpseUndead?.(nextTurn);
        window.advanceV39CaveMine?.(nextTurn);
        const current=window.getV39GameState({includeWorlds:false});
        window.setV39GameState({enemies:current.enemies.map(unit=>recoverUnitHp(unit,null,"",current,activeTurn,true))},{returnState:false});
      });
    }
    timings.combatResolution = performance.now() - combatResolutionStartedAt;
    const resolved = advanceV39Teleports(window.getV39GameState(),nextTurn,window.__v39FieldRuntime?.mapData);
    const healed = advanceV39ToolProduction(advanceV39ExpeditionTools(resolved,nextTurn),nextTurn);
    const recoveredPlayers = (healed?.players || []).map(player => {
      const factionState = {
          ...player.factionState,
          units:(player?.factionState?.units || [])
            .map(unit => {
              const worldId=unit.worldId||"surface";
              const spatial=worldId===visibleWorldId?resolved:resolved.explorationWorlds?.[worldId]?.spatial;
              return recoverUnitHp(unit,worldId==="surface"?player.factionState:null,player.id,spatial||{},activeTurn);
            })
            .map(unit => clearExpiredGuard(unit, nextTurn))
            .map(restoreUnitForTurn)
      };
      return { ...player, factionState:restoreV39SquadMovementForTurn(factionState) };
    });
    const recoveredEnemies = resolved?.enemies || [];
    const completedTimeline = {
      ...normalizeTimeline(resolvingTimeline),
      turnNumber:nextTurn,
      phase:V39_TURN_PHASE.PLAYER,
      lastResolvedTurn:activeTurn,
      ...advanceV39OperationCycle(resolved),
      lastStageSequence:["player-turn", "enemy-turn", ...stages, "recovery", "turn-complete"],
      playerTurnOrder:playerTimeline.playerTurnOrder,
      activeTurnPlayerId:playerTimeline.playerTurnOrder[0] || "",
      endedPlayerIds:[]
    };
    window.setV39GameState?.({
      players:recoveredPlayers,
      enemies:recoveredEnemies,
      neutralVillages:resolved.neutralVillages,
      teleportGates:resolved.teleportGates,
      explorationWorlds:resolved.explorationWorlds,
      activePlayerId:completedTimeline.activeTurnPlayerId,
      timeline:completedTimeline
    }, { reason:"turn-complete",returnState:false });
    window.resolveV39PendingWorldExits?.();
    window.advanceV39NpcHegemonyTravel?.();
    renderControls();
    showBanner(`プレイヤーターン ${nextTurn}`);
    window.dispatchEvent(new CustomEvent("v39:turn-phase-changed", { detail:{ phase:V39_TURN_PHASE.PLAYER, turnNumber:nextTurn } }));
    window.dispatchEvent(new CustomEvent("v39:turn-advanced", { detail:{ previousTurn:activeTurn, turnNumber:nextTurn, pendingActionsResolved:true, worldLifecycleResolved:true, stages:completedTimeline.lastStageSequence } }));
    showV39TurnLoading("画面へ反映中…");
    const renderStartedAt = performance.now();
    window.endV39MapRenderBatch?.(batchToken, { force:true, reason:"turn-resolution-complete" });
    batchToken = null;
    if(presentation)await window.waitForV39MapRenderSettled?.();
    window.flushV39HazardFeedback?.();
    timings.renderMs = performance.now() - renderStartedAt;
    latestTurnPerformance = { turnNumber:nextTurn, ...timings };
    window.dispatchEvent(new CustomEvent("v39:turn-performance", { detail:{ turnNumber:nextTurn, ...timings } }));
    return true;
  } finally {
    if (batchToken) window.endV39MapRenderBatch?.(batchToken, { force:true, reason:"turn-resolution-aborted" });
    window.endV39MapInputLock?.(inputToken, "turn-resolution-complete");
    showV39TurnLoading("");
    advancing = false;
  }
}

window.advanceV39Turn = advanceTurn;
window.setV39TimePaused = setTimePaused;
window.getV39Timeline = () => normalizeTimeline(window.getV39TimelineState?.());
window.isV39TerritoryPlanning=()=>isV39TerritoryPhase(window.getV39GameState?.({includeWorlds:false}));
document.addEventListener('click',event=>{
  if(!event.target.closest?.('#detailBasicList [data-v39-technique-name],#detailBasicList [data-v39-system-use],#detailTechniqueRows [data-v39-technique-name],[data-squad-coordination]'))return;
  if(window.isV39TerritoryPlanning()){
    event.preventDefault();event.stopImmediatePropagation();showBanner('計画を確定して戦闘・探索へ進んでください');
  }
},true);
window.getV39LatestTurnPerformance = () => latestTurnPerformance;
window.showV39TurnBanner = showBanner;

window.addEventListener("v39:operation-ui-ready", installUi, { once:true });
window.addEventListener("v39:game-state-changed", renderControls);
window.addEventListener("v39:display-settings-changed", renderControls);
installUi();
