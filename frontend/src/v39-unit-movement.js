import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";
import { showV39Feedback } from "./v39-feedback.js";
import { getHexDistance, getHexNeighborCoords } from "./lib/hex-grid.js";

const UNIT_ACTION_POINT_MAX = 100;
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

function resolveUnitAp(unit) {
  const raw = Number.isFinite(Number(unit?.ap))
    ? Number(unit.ap)
    : Number.isFinite(Number(unit?.currentAp))
      ? Number(unit.currentAp)
      : Number.isFinite(Number(unit?.actionPoint))
        ? Number(unit.actionPoint)
        : 0;
  return Math.max(0, Math.floor(raw));
}

function resolveUnitMoveValue(unit) {
  const candidates = [
    unit?.status?.移動,
    unit?.移動,
    unit?.movement,
    unit?.moveRange,
    unit?.move
  ];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(1, Math.floor(parsed));
  }
  return 1;
}

function resolveUnitFlightValue(unit) {
  if (!unit || typeof unit !== "object") return 0;
  const candidates = [unit?.status?.飛行, unit?.飛行, unit?.skillLevels?.飛行];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

function tileHeightLevel(data, x, y) {
  const raw = data?.heightLevelMap?.[y]?.[x];
  return Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : null;
}

function isPassableTerrain(terrain) {
  return terrain !== "海" && terrain !== "湖";
}

function canCrossLava(unit) {
  const fireResistance = Number(unit?.status?.炎耐性 ?? unit?.resistances?.炎耐性) || 0;
  const abilities = [unit?.acquiredSkillNames, unit?.abilities, unit?.traits].flat().map(value => String(value || ""));
  return fireResistance >= 100 || abilities.some(value => value.includes("耐熱"));
}

function isPassableTile(data, x, y, unit = null) {
  if (!isPassableTerrain(data?.grid?.[y]?.[x])) return false;
  return !data?.lavaMap?.[y]?.[x] || canCrossLava(unit);
}

// Kept in sync with the active legacy PhaserMapGeneratorPanel movement rule.
function movementStepCost(data, fromX, fromY, toX, toY, moveUnit = null) {
  const terrain = data?.grid?.[toY]?.[toX];
  if (!isPassableTile(data, toX, toY, moveUnit)) return Number.POSITIVE_INFINITY;

  const fromLevel = tileHeightLevel(data, fromX, fromY);
  const toLevel = tileHeightLevel(data, toX, toY);
  const absDiff = Number.isFinite(fromLevel) && Number.isFinite(toLevel)
    ? Math.abs(toLevel - fromLevel)
    : 0;
  const climbDiff = Number.isFinite(fromLevel) && Number.isFinite(toLevel)
    ? Math.max(0, toLevel - fromLevel)
    : 0;
  const flightValue = resolveUnitFlightValue(moveUnit);
  const hasFlight = flightValue > 0;

  if (absDiff > 1 && !hasFlight) return Number.POSITIVE_INFINITY;

  let terrainCost = 1 + (climbDiff * 2);
  const flightReduction = Math.floor(flightValue / 30);
  terrainCost = Math.max(0, terrainCost - flightReduction);
  const moveStat = resolveUnitMoveValue(moveUnit);
  const baseApCost = UNIT_ACTION_POINT_MAX / moveStat;
  return Math.max(0, Math.ceil(terrainCost * baseApCost));
}

const getHexNeighborCoordsBySize = getHexNeighborCoords;

function isWorldWrapEnabled(data) {
  if (typeof data?.worldWrapEnabled === "boolean") return data.worldWrapEnabled;
  return window.__v39FieldRuntime?.settings?.islandCustomSettings?.worldWrapEnabled !== false;
}

function occupiedTileKeys(excludedUnitId = "") {
  const state = window.getV39GameState?.();
  const units = [
    ...(state?.players || []).flatMap(player => player?.factionState?.units || []),
    ...(state?.enemies || [])
  ];
  return new Set(units
    .filter(unit => unitId(unit) !== excludedUnitId && unit?.state !== "死亡" && number(unit?.hp, unit?.currentHp) > 0)
    .map(unit => coordKey(unit?.x, unit?.y)));
}

const hexDistance = getHexDistance;

function closestReachableTarget(plan, start, desired) {
  const candidates = [];
  for (const [key, cost] of plan.costs) {
    if (key === coordKey(start.x, start.y)) continue;
    const [x, y] = key.split(",").map(Number);
    candidates.push({ x, y, cost, distance:hexDistance({ x, y }, desired) });
  }
  candidates.sort((a, b) => a.distance - b.distance || b.cost - a.cost || a.y - b.y || a.x - b.x);
  return candidates[0] || null;
}

function buildReachablePlan(data, unit, apBudget) {
  const w = Math.max(0, integer(data?.w));
  const h = Math.max(0, integer(data?.h));
  const sx = integer(unit?.x, -1);
  const sy = integer(unit?.y, -1);
  const budget = Math.max(0, Math.floor(number(apBudget, 0)));
  const costs = new Map();
  const parents = new Map();
  if (!w || !h || sx < 0 || sy < 0 || sx >= w || sy >= h) return { costs, parents };

  const startKey = coordKey(sx, sy);
  costs.set(startKey, 0);
  const queue = [{ x:sx, y:sy, cost:0 }];
  const worldWrapEnabled = isWorldWrapEnabled(data);
  const occupied = occupiedTileKeys(unitId(unit));

  while (queue.length) {
    let minIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].cost < queue[minIndex].cost) minIndex = i;
    }
    const [current] = queue.splice(minIndex, 1);
    if (!current || current.cost > budget) continue;
    const currentKey = coordKey(current.x, current.y);
    if (current.cost !== costs.get(currentKey)) continue;

    for (const next of getHexNeighborCoordsBySize(w, h, current.x, current.y, worldWrapEnabled)) {
      if (!isPassableTile(data, next.x, next.y, unit)) continue;
      if (occupied.has(coordKey(next.x, next.y))) continue;
      const stepCost = movementStepCost(data, current.x, current.y, next.x, next.y, unit);
      if (!Number.isFinite(stepCost) || stepCost < 0) continue;
      const nextCost = current.cost + stepCost;
      if (nextCost > budget) continue;
      const key = coordKey(next.x, next.y);
      const best = costs.get(key);
      if (Number.isFinite(best) && best <= nextCost) continue;
      costs.set(key, nextCost);
      parents.set(key, currentKey);
      queue.push({ x:next.x, y:next.y, cost:nextCost });
    }
  }

  return { costs, parents };
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

function persistMoveCommand(unitIdValue, reason) {
  if (typeof window.updateV39ActiveFactionState !== "function") return;
  const faction = activeFaction();
  const nextId = text(unitIdValue);
  if (text(faction?.moveCommandUnitId) === nextId) return;
  window.updateV39ActiveFactionState({ moveCommandUnitId:nextId }, { reason });
}

function clearMoveMode(options = {}) {
  const previousUnitId = moveSession?.unitId || "";
  moveSession = null;
  destroyGraphics();
  setMoveConfirm(false);
  setBanner("");
  document.getElementById("mobileBattleMove")?.classList.remove("active");
  if (options.clearCommand !== false) {
    const faction = activeFaction();
    if (text(faction?.moveCommandUnitId) && (!previousUnitId || text(faction.moveCommandUnitId) === previousUnitId)) {
      persistMoveCommand("", options.reason || "move-command-cancelled");
    }
  }
}

function startMove() {
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
  if (unit?.state === "死亡" || number(unit?.hp, unit?.currentHp) <= 0) {
    showToast("死亡したキャラクターは移動できません");
    return false;
  }

  const x = integer(unit.x, -1);
  const y = integer(unit.y, -1);
  if (x < 0 || y < 0 || x >= ctx.data.w || y >= ctx.data.h) {
    showToast("選択キャラクターの位置が未確定です");
    return false;
  }

  const ap = resolveUnitAp(unit);
  if (ap <= 0) {
    showToast("APがありません。ターン経過で回復します");
    return false;
  }

  const plan = buildReachablePlan(ctx.data, unit, ap);
  if (plan.costs.size <= 1) {
    showToast("現在のAPでは移動可能なマスがありません");
    return false;
  }

  moveSession = {
    unitId:unitId(unit),
    unit,
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
  setBanner(`${text(unit.name, "キャラクター")}：青枠から移動先を選択`);
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

  if (!moveSession.plan.costs.has(key)) {
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

function applyMovement() {
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

  const currentStart = { x:integer(unit.x, -1), y:integer(unit.y, -1) };
  if (currentStart.x !== session.start.x || currentStart.y !== session.start.y) {
    showToast("キャラクター位置が変わったため移動を再指定してください");
    clearMoveMode();
    return;
  }

  const currentAp = resolveUnitAp(unit);
  const freshPlan = buildReachablePlan(ctx.data, unit, currentAp);
  const targetKey = coordKey(session.target.x, session.target.y);
  const freshCost = freshPlan.costs.get(targetKey);
  if (!Number.isFinite(freshCost)) {
    showToast("現在の状態ではそのマスへ移動できません");
    clearMoveMode();
    return;
  }

  const path = pathTo(freshPlan, currentStart, session.target);
  const nextAp = Math.max(0, currentAp - freshCost);
  const nextUnits = units.map(row => {
    if (unitId(row) !== session.unitId) return row;
    const next = {
      ...row,
      x:session.target.x,
      y:session.target.y,
      ap:nextAp
    };
    if (Object.prototype.hasOwnProperty.call(row, "currentAp")) next.currentAp = nextAp;
    if (Object.prototype.hasOwnProperty.call(row, "actionPoint")) next.actionPoint = nextAp;
    if (Object.prototype.hasOwnProperty.call(row, "moveRemaining")) next.moveRemaining = nextAp;
    return next;
  });

  if (typeof window.updateV39ActiveFactionState !== "function") {
    showToast("ゲーム状態の更新関数が見つかりません");
    return;
  }

  moveSession = null;
  destroyGraphics();
  setMoveConfirm(false);
  setBanner("");
  window.updateV39ActiveFactionState({
    units:nextUnits,
    selectedUnitId:session.unitId,
    moveCommandUnitId:""
  }, { reason:"unit-moved" });

  window.dispatchEvent(new CustomEvent("v39:unit-moved", {
    detail:{
      unitId:session.unitId,
      from:{ ...currentStart },
      to:{ x:session.target.x, y:session.target.y },
      path,
      distance:Math.max(0, path.length - 1),
      apCost:freshCost,
      apRemaining:nextAp
    }
  }));
  showToast(`${text(unit.name, "キャラクター")}：移動完了 / AP ${nextAp}`);
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
  const ids = ["panelMove", "mobileBattleMove", "moveCancel", "moveOk"];
  const found = ids.reduce((count, id) => count + (document.getElementById(id) ? 1 : 0), 0);
  bindCapturedClick("panelMove", startMove);
  bindCapturedClick("mobileBattleMove", startMove);
  bindCapturedClick("moveCancel", () => clearMoveMode({ reason:"move-command-cancelled" }));
  bindCapturedClick("moveOk", applyMovement);
  return found >= 2;
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
    if (moveSession && event?.detail?.reason === "active-player") {
      clearMoveMode({ reason:"active-player-changed" });
    }
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && moveSession) clearMoveMode({ reason:"move-command-cancelled" });
  }, true);

  window.startV39SelectedUnitMove = startMove;
  window.cancelV39SelectedUnitMove = () => clearMoveMode({ reason:"move-command-cancelled" });
  window.getV39UnitMovePreview = () => moveSession ? {
    unitId:moveSession.unitId,
    start:{ ...moveSession.start },
    target:moveSession.target ? { ...moveSession.target } : null,
    reachable:[...moveSession.plan.costs.entries()].map(([key, cost]) => ({ key, cost }))
  } : null;
}

install();
