import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { isV39UnitWaiting } from "../../lib/v39-unit-action-rules.js";
import { showV39Feedback } from "../ui/v39-feedback.js";
import { getHexDistance, getHexNeighborCoords, getHexOffsetNeighbors, normalizeWrappedCoordinate } from "../../lib/hex-grid.js";
import { canUnitEnterV39Tile, resolveV39UnitMovementStepCost } from "../../lib/v39-terrain-traversal.js";
import { advanceV39CaveFormation, applyV39SquadMovement, resolveV39SquadMovementGroup } from "../../lib/v39-squad-movement-rules.js";
import { V39_MOVEMENT_PRESENTATION_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { collectV39MovementOccupancy } from "../../lib/v39-movement-occupancy-rules.js";
import { isV39UnitInWorld } from "../../lib/v39-cave-spatial-rules.js";
import { V39_TURN_PHASE } from "../../lib/v39-turn-timing.js";

const RANGE_DEPTH = 9;
const PATH_DEPTH = 11;

let moveSession = null;
let rangeGraphics = null;
let pathGraphics = null;

function text(value, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function number(value, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

function integer(value, fallback = 0) {
  return Math.floor(number(value, fallback));
}

function coordKey(x, y) {
  return `${integer(x)},${integer(y)}`;
}

function tileMetrics() {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return { width, height, rowStep, oddRowOffsetX };
}

function hexPoints(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  const halfW = width / 2;
  const upperY = height - rowStep;
  const lowerY = rowStep;
  const left = (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0);
  const top = y * rowStep;
  return [
    { x:left + halfW, y:top },
    { x:left + width, y:top + upperY },
    { x:left + width, y:top + lowerY },
    { x:left + halfW, y:top + height },
    { x:left, y:top + lowerY },
    { x:left, y:top + upperY }
  ];
}

function tileCenter(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  return {
    x: (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y: (y * rowStep) + height / 2
  };
}

function activeRuntime() {
  const runtime = window.__v39FieldRuntime;
  const scene = runtime?.game?.scene?.getScenes?.(true)?.[0] || null;
  const data = runtime?.mapData || null;
  return scene && data ? { runtime, scene, data } : null;
}

function activeFaction() {
  try {
    return typeof window.getV39ActiveFactionState === "function"
      ? window.getV39ActiveFactionState()
      : null;
  } catch {
    return null;
  }
}

function unitId(unit) {
  return text(unit?.id ?? unit?.unitId ?? unit?.characterId);
}

function selectedUnitFromFaction(faction = activeFaction()) {
  const id = text(faction?.selectedUnitId);
  const units = Array.isArray(faction?.units) ? faction.units : [];
  return units.find(unit => unitId(unit) === id) || null;
}

function isPassableTile(data, x, y, unit = null) {
  return canUnitEnterV39Tile(data, x, y, unit);
}

function movementStepCost(data, fromX, fromY, toX, toY, moveUnit = null) {
  return resolveV39UnitMovementStepCost(data, fromX, fromY, toX, toY, moveUnit);
}

const getHexNeighborCoordsBySize = getHexNeighborCoords;

function isWorldWrapEnabled(data) {
  if (typeof data?.worldWrapEnabled === "boolean") return data.worldWrapEnabled;
  return window.__v39FieldRuntime?.settings?.islandCustomSettings?.worldWrapEnabled !== false;
}

const hexDistance = getHexDistance;

function closestReachableTarget(plan, start, desired) {
  const candidates = [];
  for (const [key, cost] of plan.costs) {
    if(!plan.stops.has(key))continue;
    if (key === coordKey(start.x, start.y)) continue;
    const [x, y] = key.split(",").map(Number);
    candidates.push({ x, y, cost, distance:hexDistance({ x, y }, desired) });
  }
  candidates.sort((a, b) => a.distance - b.distance || b.cost - a.cost || a.y - b.y || a.x - b.x);
  return candidates[0] || null;
}

function moveFormationOneStep(data, formation, from, to, worldWrapEnabled, group, occupied) {
  if (data.isUnderground) return advanceV39CaveFormation(data, formation, to, group, occupied);
  const w = Math.max(0, integer(data?.w));
  const h = Math.max(0, integer(data?.h));
  const directionIndex = getHexOffsetNeighbors(from.x, from.y).findIndex(raw => {
    const x = worldWrapEnabled ? normalizeWrappedCoordinate(raw.x, w) : raw.x;
    const y = worldWrapEnabled ? normalizeWrappedCoordinate(raw.y, h) : raw.y;
    return x === to.x && y === to.y;
  });
  if (directionIndex < 0) return null;
  const membersById = new Map((group?.participants || []).map(member => [unitId(member), member]));
  const nextFormation = formation.map(position => {
    const raw = getHexOffsetNeighbors(position.x, position.y)[directionIndex];
    return {
      id:position.id,
      x:worldWrapEnabled ? normalizeWrappedCoordinate(raw.x, w) : raw.x,
      y:worldWrapEnabled ? normalizeWrappedCoordinate(raw.y, h) : raw.y
    };
  });
  const destinationKeys = new Set();
  for (const position of nextFormation) {
    const key = coordKey(position.x, position.y);
    const member = membersById.get(position.id);
    if (position.x < 0 || position.y < 0 || position.x >= w || position.y >= h) return null;
    if (destinationKeys.has(key) || occupied.has(key) || !isPassableTile(data, position.x, position.y, member)) return null;
    destinationKeys.add(key);
  }
  return nextFormation;
}

function movementStepCostForGroup(data, formation, nextFormation, group, occupied) {
  const membersById = new Map((Array.isArray(group?.participants) ? group.participants : []).map(member => [unitId(member), member]));
  if (!formation.length || formation.length !== nextFormation.length) return Number.POSITIVE_INFINITY;
  let cost = 0, previous=formation;
  for(const frame of nextFormation.transitionFrames||[nextFormation]) {
    let frameCost=0;
    for (let index = 0; index < previous.length; index += 1) {
      const current = previous[index];
      const next = frame[index];
      const member = membersById.get(current.id);
      if (!member || occupied.has(coordKey(next.x, next.y))) return Number.POSITIVE_INFINITY;
      const memberCost = movementStepCost(data, current.x, current.y, next.x, next.y, member);
      if (!Number.isFinite(memberCost)) return Number.POSITIVE_INFINITY;
      frameCost = Math.max(frameCost, memberCost);
    }
    cost+=frameCost;previous=frame;
  }
  return cost;
}

function buildReachablePlan(data, group, apBudget) {
  const w = Math.max(0, integer(data?.w));
  const h = Math.max(0, integer(data?.h));
  const sx = integer(group?.x, -1);
  const sy = integer(group?.y, -1);
  const budget = Math.max(0, Math.floor(number(apBudget, 0)));
  const costs = new Map();
  const parents = new Map();
  const formations = new Map();
  const stops = new Set();
  if (!w || !h || sx < 0 || sy < 0 || sx >= w || sy >= h) return { costs, parents, formations, stops };

  const startKey = coordKey(sx, sy);
  costs.set(startKey, 0);
  formations.set(startKey, (group?.positions || []).map(row => ({ ...row })));
  const queue = [{ x:sx, y:sy, cost:0 }];
  const worldWrapEnabled = isWorldWrapEnabled(data);
  const {blocked:occupied,stopBlocked}=collectV39MovementOccupancy(window.getV39GameState?.(),group?.participantIds,data);

  while (queue.length) {
    let minIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].cost < queue[minIndex].cost) minIndex = i;
    }
    const [current] = queue.splice(minIndex, 1);
    if (!current || current.cost > budget) continue;
    const currentKey = coordKey(current.x, current.y);
    if (current.cost !== costs.get(currentKey)) continue;
    const currentFormation = formations.get(currentKey) || [];

    for (const next of getHexNeighborCoordsBySize(w, h, current.x, current.y, worldWrapEnabled)) {
      let nextFormation = moveFormationOneStep(data, currentFormation, current, next, worldWrapEnabled, group, occupied);
      if (!nextFormation) continue;
      let stepCost = movementStepCostForGroup(data, currentFormation, nextFormation, group, occupied);
      // 前2人への展開で追加APが足りない場合も、通常の1歩は進める。
      if(current.cost+stepCost>budget&&nextFormation.transitionFrames){
        nextFormation=nextFormation.transitionFrames[0];
        stepCost=movementStepCostForGroup(data,currentFormation,nextFormation,group,occupied);
      }
      if (!Number.isFinite(stepCost) || stepCost < 0) continue;
      const nextCost = current.cost + stepCost;
      if (nextCost > budget) continue;
      const key = coordKey(next.x, next.y);
      const best = costs.get(key);
      if (Number.isFinite(best) && best <= nextCost) continue;
      costs.set(key, nextCost);
      parents.set(key, currentKey);
      formations.set(key, nextFormation);
      queue.push({ x:next.x, y:next.y, cost:nextCost });
    }
  }

  for(const [key,formation] of formations)if(formation.every(tile=>!stopBlocked.has(coordKey(tile.x,tile.y))))stops.add(key);
  return { costs, parents, formations, stops };
}

function pathTo(plan, start, target) {
  const startKey = coordKey(start.x, start.y);
  const targetKey = coordKey(target.x, target.y);
  if (!plan?.costs?.has(targetKey)) return [];
  const path = [{ x:integer(target.x), y:integer(target.y) }];
  let cursor = targetKey;
  const guard = plan.costs.size + 1;
  while (cursor !== startKey && path.length <= guard) {
    cursor = plan.parents.get(cursor);
    if (!cursor) return [];
    const [x, y] = cursor.split(",").map(Number);
    path.push({ x, y });
  }
  path.reverse();
  return path;
}

function destroyGraphics() {
  if (rangeGraphics?.destroy) rangeGraphics.destroy();
  if (pathGraphics?.destroy) pathGraphics.destroy();
  rangeGraphics = null;
  pathGraphics = null;
}

function drawReachable(plan, start) {
  const ctx = activeRuntime();
  if (!ctx) return;
  if (rangeGraphics?.destroy) rangeGraphics.destroy();
  rangeGraphics = ctx.scene.add.graphics().setDepth(RANGE_DEPTH);
  for (const key of plan.costs.keys()) {
    if(!plan.stops.has(key))continue;
    if (key === coordKey(start.x, start.y)) continue;
    const [x, y] = key.split(",").map(Number);
    const points = hexPoints(x, y);
    rangeGraphics.fillStyle(0x69d0df, 0.10);
    rangeGraphics.fillPoints(points, true);
    rangeGraphics.lineStyle(2, 0x69d0df, 0.95);
    rangeGraphics.strokePoints(points, true);
  }
}

function drawPath(path) {
  const ctx = activeRuntime();
  if (!ctx) return;
  if (pathGraphics?.destroy) pathGraphics.destroy();
  pathGraphics = ctx.scene.add.graphics().setDepth(PATH_DEPTH);
  if (!Array.isArray(path) || path.length < 2) return;

  const { width, rowStep } = tileMetrics();
  const maxAdjacentDistance = Math.max(width, rowStep) * 2.2;
  pathGraphics.lineStyle(4, 0xbcecf3, 0.98);
  for (let i = 1; i < path.length; i += 1) {
    const a = tileCenter(path[i - 1].x, path[i - 1].y);
    const b = tileCenter(path[i].x, path[i].y);
    if (Math.hypot(b.x - a.x, b.y - a.y) <= maxAdjacentDistance) {
      pathGraphics.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
  for (const node of path) {
    const c = tileCenter(node.x, node.y);
    pathGraphics.fillStyle(0xe9f9fc, 1);
    pathGraphics.fillCircle(c.x, c.y, 2.5);
  }
}

function setBanner(message = "") {
  const banner = document.getElementById("modeBanner");
  if (!(banner instanceof HTMLElement)) return;
  banner.textContent = message;
  banner.classList.toggle("show", !!message);
}

function showToast(message) {
  showV39Feedback(message);
}

function setMoveConfirm(visible, message = "") {
  const confirm = document.getElementById("moveConfirm");
  const label = document.getElementById("moveText");
  if (label && message) label.textContent = message;
  confirm?.classList.toggle("show", !!visible);
}

function persistMoveCommand(unitIdValue, reason, playerId) {
  if (typeof window.updateV39ActiveFactionState !== "function") return;
  const state=window.getV39GameState({includeWorlds:false}),ownerId=playerId||state.activePlayerId;
  const faction=state.players.find(player=>player.id===ownerId)?.factionState;
  const nextId = text(unitIdValue);
  if (text(faction?.moveCommandUnitId) === nextId) return;
  if(ownerId===state.activePlayerId)window.updateV39ActiveFactionState({moveCommandUnitId:nextId},{reason});
  else window.setV39GameState({players:state.players.map(player=>player.id!==ownerId?player:
    {...player,factionState:{...player.factionState,moveCommandUnitId:nextId}})},{reason});
}

function clearMoveMode(options = {}) {
  const previousUnitId = moveSession?.unitId || "";
  const previousPlayerId=moveSession?.playerId;
  moveSession = null;
  destroyGraphics();
  setMoveConfirm(false);
  setBanner("");
  document.getElementById("mobileBattleMove")?.classList.remove("active");
  if (options.clearCommand !== false) {
    const state=window.getV39GameState({includeWorlds:false});
    const faction=state.players.find(player=>player.id===(previousPlayerId||state.activePlayerId))?.factionState;
    if (text(faction?.moveCommandUnitId) && (!previousUnitId || text(faction.moveCommandUnitId) === previousUnitId)) {
      persistMoveCommand("", options.reason || "move-command-cancelled",previousPlayerId);
    }
  }
}

function startMove() {
  if (window.isV39MapInputLocked?.()) return;
  if (moveSession) {
    clearMoveMode({ reason:"move-command-cancelled" });
    return false;
  }
  window.cancelV39SelectedUnitAttack?.("move-command-started");
  clearMoveMode({ clearCommand:false });
  const ctx = activeRuntime();
  if (!ctx) {
    showToast("フィールドを生成してから移動してください");
    return false;
  }
  const faction = activeFaction();
  const unit = selectedUnitFromFaction(faction);
  if (!unit) {
    showToast("移動するキャラクターを選択してください");
    return false;
  }
  const state=window.getV39GameState?.({includeWorlds:false});
  if(!isV39UnitInWorld(unit,state.activeWorldId)){
    showToast("このキャラクターは別のマップにいます");return false;
  }
  if(state.timeline.phase!==V39_TURN_PHASE.PLAYER)return false;
  const moveGroup = resolveV39SquadMovementGroup(faction, unitId(unit), { caveFormation:ctx.data.isUnderground });
  if (moveGroup.participants?.some(member => isV39UnitWaiting(member, window.getV39GameState?.()?.timeline?.turnNumber))) {
    showToast("部隊にこのターン待機済みのキャラクターがいます");
    return false;
  }
  if (!moveGroup.ok) {
    showToast(moveGroup.reason || "移動部隊を確定できません");
    return false;
  }

  const x = moveGroup.x;
  const y = moveGroup.y;
  if (x < 0 || y < 0 || x >= ctx.data.w || y >= ctx.data.h) {
    showToast("部隊の位置が未確定です");
    return false;
  }

  const ap = moveGroup.moveAp;
  if (ap <= 0) {
    showToast(moveGroup?.apLimitedBy?.name ? `${moveGroup.apLimitedBy.name}のAPが0です` : "APがありません。ターン経過で回復します");
    return false;
  }

  const plan = buildReachablePlan(ctx.data, moveGroup, ap);
  if (plan.stops.size <= 1) {
    showToast(`現在のAPでは移動可能なマスがありません（残AP ${ap}）`);
    return false;
  }

  moveSession = {
    playerId:state.activePlayerId,
    worldId:state.activeWorldId,
    turnNumber:state.timeline.turnNumber,
    unitId:unitId(unit),
    unit,
    squadId:moveGroup.squadId,
    participantIds:[...moveGroup.participantIds],
    moveGroup,
    start:{ x, y },
    availableAp:ap,
    plan,
    target:null,
    path:[]
  };
  persistMoveCommand(moveSession.unitId, "move-command-armed");
  document.getElementById("mobileBattleMove")?.classList.add("active");
  drawReachable(plan, moveSession.start);
  setMoveConfirm(false);
  const label = moveGroup.isSquad ? text(moveGroup.squad?.label || moveGroup.squad?.name, "部隊") : text(unit.name, "キャラクター");
  setBanner(`${label}：青枠から移動先を選択`);
  return true;
}

function previewTarget(tile) {
  if (!moveSession) return;
  let x = integer(tile?.x, Number.NaN);
  let y = integer(tile?.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  let key = coordKey(x, y);
  const startKey = coordKey(moveSession.start.x, moveSession.start.y);

  if (key === startKey) {
    moveSession.target = null;
    moveSession.path = [];
    if (pathGraphics?.destroy) pathGraphics.destroy();
    pathGraphics = null;
    setMoveConfirm(false);
    setBanner("同じマスです。青枠から移動先を選択してください");
    return;
  }

  if (!moveSession.plan.stops.has(key)) {
    const fallback = closestReachableTarget(moveSession.plan, moveSession.start, { x, y });
    if (!fallback) {
      setMoveConfirm(false);
      showToast("現在のAPでは移動可能なマスがありません");
      return;
    }
    x = fallback.x;
    y = fallback.y;
    key = coordKey(x, y);
    showToast("目的地へ到達できないため、手前で停止します");
  }

  const path = pathTo(moveSession.plan, moveSession.start, { x, y });
  if (path.length <= 1) return;
  const cost = moveSession.plan.costs.get(key) || 0;
  const remaining = Math.max(0, moveSession.availableAp - cost);
  moveSession.target = { x, y, cost };
  moveSession.path = path;
  drawPath(path);
  setMoveConfirm(true, `距離 ${path.length - 1} / 消費AP ${cost} / 残AP ${remaining}`);
  setBanner(key === coordKey(tile?.x, tile?.y)
    ? "経路を確認し、「移動確定」を押してください"
    : "目的地へ到達できないため、表示位置で停止します");
}

export async function playV39UnitMovementPath(scene, formations, data) {
  const duration = Math.min(V39_MOVEMENT_PRESENTATION_BALANCE.stepMs,
    V39_MOVEMENT_PRESENTATION_BALANCE.maxDurationMs / Math.max(1, formations.length - 1));
  for (let i = 1; i < formations.length; i += 1) {
    const usedMarkers = new Set();
    await Promise.all(formations[i].map(position => {
      const marker = window.getV39MapEntityMarker?.(position.id);
      if (!marker?.scene || !scene?.tweens || usedMarkers.has(marker)) return;
      usedMarkers.add(marker);
      const previous = formations[i - 1].find(row => row.id === position.id);
      const center = tileCenter(position.x, position.y);
      // ワールド端をまたぐ1歩は画面全体を横切らせない。
      if (previous && (Math.abs(position.x - previous.x) > data.w / 2 || Math.abs(position.y - previous.y) > data.h / 2)) {
        marker.setPosition(center.x, center.y);
        return;
      }
      return new Promise(resolve => {
        scene.tweens.add({ targets:marker, x:center.x, y:center.y, duration, ease:"Linear", onComplete:resolve, onStop:resolve });
        // シーン破棄時にも操作ロックが残らない。
        window.setTimeout(resolve, duration + 100);
      });
    }));
  }
}

async function applyMovement() {
  if (window.isV39MapInputLocked?.()) return;
  if (!moveSession?.target) return;
  const ctx = activeRuntime();
  const faction = activeFaction();
  const session = moveSession;
  const units = Array.isArray(faction?.units) ? faction.units : [];
  const unit = units.find(row => unitId(row) === session.unitId) || null;
  if (!ctx || !unit) {
    showToast("移動対象を再取得できませんでした");
    clearMoveMode();
    return;
  }

  if (text(faction?.selectedUnitId) !== session.unitId) {
    showToast("選択キャラクターが変わったため移動を解除しました");
    clearMoveMode();
    return;
  }

  const currentGroup = resolveV39SquadMovementGroup(faction, session.unitId, { caveFormation:ctx.data.isUnderground });
  if (!currentGroup.ok) {
    showToast(currentGroup.reason || "移動部隊を再取得できませんでした");
    clearMoveMode();
    return;
  }
  const currentStart = { x:currentGroup.x, y:currentGroup.y };
  if (currentStart.x !== session.start.x || currentStart.y !== session.start.y) {
    showToast("キャラクター位置が変わったため移動を再指定してください");
    clearMoveMode();
    return;
  }

  const currentAp = currentGroup.moveAp;
  const freshPlan = buildReachablePlan(ctx.data, currentGroup, currentAp);
  const targetKey = coordKey(session.target.x, session.target.y);
  const freshCost = freshPlan.costs.get(targetKey);
  if (!Number.isFinite(freshCost)||!freshPlan.stops.has(targetKey)) {
    showToast("現在の状態ではそのマスへ移動できません");
    clearMoveMode();
    return;
  }

  const path = pathTo(freshPlan, currentStart, session.target);
  const nextAp = Math.max(0, currentAp - freshCost);
  const targetPositions = freshPlan.formations.get(targetKey) || [];
  const movement = applyV39SquadMovement(faction, currentGroup, { ...session.target, positions:targetPositions }, freshCost);
  if (!movement.ok) {
    showToast(movement.reason || "部隊移動を反映できませんでした");
    clearMoveMode();
    return;
  }

  if (typeof window.updateV39ActiveFactionState !== "function") {
    showToast("ゲーム状態の更新関数が見つかりません");
    return;
  }

  moveSession = null;
  destroyGraphics();
  setMoveConfirm(false);
  setBanner("");
  const inputToken = window.beginV39MapInputLock?.("unit-movement");
  const app = document.getElementById("app");
  const wasInert = app?.inert;
  if (app) app.inert = true;
  let batchToken = null;
  try {
    // 移動モード開始時に予約された再描画を済ませ、破棄前のマーカーへTweenを付けない。
    await window.waitForV39MapRenderSettled?.();
    window.refreshV39MapEntities?.();
    batchToken = window.beginV39MapRenderBatch?.("unit-movement");
    drawPath(path);
    await playV39UnitMovementPath(activeRuntime()?.scene, path.flatMap(node => {
      const formation=freshPlan.formations.get(coordKey(node.x,node.y))||[];
      return formation.transitionFrames||[formation];
    }), ctx.data);
    window.updateV39ActiveFactionState({
      units:movement.faction.units.map(member => currentGroup.participantIds.includes(unitId(member))
        ? { ...member, lastActionTurn:window.getV39GameState?.()?.timeline?.turnNumber } : member),
      squads:movement.faction.squads,
      selectedUnitId:session.unitId,
      moveCommandUnitId:""
    }, { reason:"unit-moved" });

    window.dispatchEvent(new CustomEvent("v39:unit-moved", {
      detail:{
        unitId:session.unitId,
        squadId:currentGroup.squadId,
        unitIds:[...currentGroup.participantIds],
        from:{ ...currentStart },
        to:{ x:session.target.x, y:session.target.y },
        positions:targetPositions.map(row => ({ ...row })),
        path,
        distance:Math.max(0, path.length - 1),
        apCost:freshCost,
        apRemaining:nextAp,
        moveApRemaining:nextAp
      }
    }));
    const movedLabel = currentGroup.isSquad
      ? text(currentGroup.squad?.label || currentGroup.squad?.name, "部隊")
      : text(unit.name, "キャラクター");
    showToast(`${movedLabel}：移動完了 / 残AP ${nextAp}`);
  } finally {
    destroyGraphics();
    window.endV39MapRenderBatch?.(batchToken, { force:true, reason:"unit-movement-complete" });
    await window.waitForV39MapRenderSettled?.();
    window.endV39MapInputLock?.(inputToken, "unit-movement-complete");
    if (app) app.inert = wasInert;
  }
}

function bindCapturedClick(id, handler) {
  const button = document.getElementById(id);
  if (!(button instanceof HTMLElement) || button.dataset.v39MoveBound === "1") return false;
  button.dataset.v39MoveBound = "1";
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    handler(event);
  }, true);
  return true;
}

function bindButtons() {
  bindCapturedClick("panelMove", startMove);
  bindCapturedClick("mobileBattleMove", startMove);
  bindCapturedClick("moveCancel", () => clearMoveMode({ reason:"move-command-cancelled" }));
  bindCapturedClick("moveOk", applyMovement);
  // 取消・確定だけ先に存在しても、操作UIの移動ボタンができるまでは完了にしない。
  return ["mobileBattleMove", "moveCancel", "moveOk"].every(id => document.getElementById(id));
}

function install() {
  if (!bindButtons()) {
    window.setTimeout(install, 50);
    return;
  }

  window.addEventListener("v39:tile-selected", event => {
    if (moveSession) previewTarget(event.detail);
  });
  window.addEventListener("v39:field-generated", () => clearMoveMode({ reason:"field-regenerated" }));
  window.addEventListener("v39:unit-selected", event => {
    if (moveSession && text(event?.detail?.unitId) !== moveSession.unitId) {
      clearMoveMode({ reason:"move-unit-changed" });
    }
  });
  window.addEventListener("v39:game-state-changed", event => {
    if(!moveSession)return;
    const state=window.getV39GameState({includeWorlds:false});
    if(state.activePlayerId!==moveSession.playerId||state.activeWorldId!==moveSession.worldId
      ||state.timeline.turnNumber!==moveSession.turnNumber||state.timeline.phase!==V39_TURN_PHASE.PLAYER)
      clearMoveMode({ reason:"move-context-changed" });
  });
  window.addEventListener("v39:save-loaded",()=>clearMoveMode({reason:"move-save-loaded"}));
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && moveSession) clearMoveMode({ reason:"move-command-cancelled" });
  }, true);

  window.startV39SelectedUnitMove = startMove;
  window.cancelV39SelectedUnitMove = () => clearMoveMode({ reason:"move-command-cancelled" });
  window.getV39UnitMovePreview = () => moveSession ? {
    unitId:moveSession.unitId,
    squadId:moveSession.squadId,
    unitIds:[...moveSession.participantIds],
    start:{ ...moveSession.start },
    target:moveSession.target ? { ...moveSession.target } : null,
    reachable:[...moveSession.plan.costs.entries()].filter(([key])=>moveSession.plan.stops.has(key)).map(([key, cost]) => ({ key, cost }))
  } : null;
}

window.addEventListener("v39:operation-ui-ready", bindButtons);
install();
