import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";
import {
  computeAttackDamage,
  applyV39GuardToDamage,
  applyV39ActiveCombatEffects,
  canTriggerMeleeCounter,
  isV39SupportSkill,
  resolveAreaType,
  resolveAttackApCost,
  resolveAttackPower,
  resolveAttackRange,
  resolveAttackRows,
  resolveCounterAttackRow,
  resolveSkillHealing,
  resolveSkillGuard,
  resolveSkillTimedModifiers,
  resolveSplashSpec,
  resolveV39RevivalSpec
} from "./lib/v39-combat-engine.js";
import { applyV39TerrainModifiers } from "./lib/v39-terrain-modifiers.js";
import { showV39Feedback } from "./v39-feedback.js";
import { getHexNeighborCoords } from "./lib/hex-grid.js";
import {
  DEFAULT_CORPSE_FIELD_TURNS,
  DEFAULT_MAGIC_CAST_TURNS,
  currentV39TurnNumber,
  parseV39TurnCount,
  remainingV39Turns,
  resolveV39DeadlineTurn
} from "./lib/v39-turn-timing.js";

const RANGE_DEPTH = 10;
const AREA_DEPTH = 12;
let selectedSkillName = "";
let attackSession = null;
let rangeGraphics = null;
let areaGraphics = null;
let hoverFrame = 0;

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const coordKey = (x, y) => `${integer(x)},${integer(y)}`;

function activeRuntime() {
  const runtime = window.__v39FieldRuntime;
  const scene = runtime?.game?.scene?.getScenes?.(true)?.[0] || null;
  return scene && runtime?.mapData ? { scene, data:runtime.mapData } : null;
}

function activeFaction() {
  return window.getV39ActiveFactionState?.() || null;
}

function terrainAdjusted(unit) {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => row?.factionState?.units?.some(item => text(item?.id) === text(unit?.id)));
  const effects = player?.factionState?.combatRuntime?.activeEffectsByUnitId?.[text(unit?.id)]
    || state?.enemyCombatRuntime?.activeEffectsByEnemyId?.[text(unit?.id)]
    || [];
  const active = applyV39ActiveCombatEffects(unit, effects);
  const penaltyRate = Math.max(0, Math.min(1, number(active?.starvationPenaltyRate)));
  const starvationAdjusted = penaltyRate > 0 ? {
    ...active,
    status:Object.fromEntries(Object.entries(active?.status || {}).map(([key, value]) => [
      key,
      key === "HP" ? value : Math.floor(number(value) * (1 - penaltyRate))
    ])),
    skillLevels:Object.fromEntries(Object.entries(active?.skillLevels || {}).map(([key, value]) => [key, Math.floor(number(value) * (1 - penaltyRate))]))
  } : active;
  return applyV39TerrainModifiers(starvationAdjusted, window.__v39FieldRuntime?.mapData);
}

function selectedUnit(faction = activeFaction()) {
  const units = Array.isArray(faction?.units) ? faction.units : [];
  return units.find((unit) => text(unit?.id) === text(faction?.selectedUnitId)) || units[0] || null;
}

function currentAp(unit) {
  return Math.max(0, integer(unit?.ap, integer(unit?.currentAp, 0)));
}

function guardStatePatch(unit, damage, grantedGuard = 0, turnNumber = currentV39TurnNumber()) {
  const remaining = Math.max(0, integer(damage?.guardRemaining, integer(unit?.guard, 0)));
  const granted = Math.max(0, integer(grantedGuard, 0));
  const guard = remaining + granted;
  return guard > 0
    ? { guard, guardExpiresAtTurn:granted > 0 ? resolveV39DeadlineTurn(turnNumber, 1) : integer(unit?.guardExpiresAtTurn, turnNumber) }
    : { guard:0, guardExpiresAtTurn:0 };
}

function castDurationTurns(skillRow) {
  const configured = parseV39TurnCount(skillRow?.待機, 0);
  return text(skillRow?.攻撃手段) === "魔法" ? Math.max(DEFAULT_MAGIC_CAST_TURNS, configured) : configured;
}

const cooldownDurationTurns = skillRow => parseV39TurnCount(skillRow?.CT, 0);
const effectDurationTurns = skillRow => parseV39TurnCount(skillRow?.効果時間, 0);

function unitRuntimeState(faction, unit, skillRow = null) {
  const unitKey = text(unit?.id);
  const runtime = faction?.combatRuntime || {};
  const cooldowns = runtime?.cooldownsByUnitId?.[unitKey] || {};
  const pending = runtime?.pendingActionsByUnitId?.[unitKey] || null;
  const cooldownRemainingTurns = remainingV39Turns(cooldowns?.[text(skillRow?.名前)], currentV39TurnNumber());
  return { pending, cooldownRemainingTurns };
}

function tileMetrics() {
  const width = number(HEX_TILE_CONFIG?.width, 40);
  const height = number(HEX_TILE_CONFIG?.height, 48);
  const rowStep = number(HEX_TILE_CONFIG?.rowStep, 36);
  const oddRowOffsetX = number(HEX_TILE_CONFIG?.oddRowOffsetX, width / 2);
  return { width, height, rowStep, oddRowOffsetX };
}

function hexPoints(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  const left = x * width + (y % 2 ? oddRowOffsetX : 0);
  const top = y * rowStep;
  return [
    { x:left + width / 2, y:top }, { x:left + width, y:top + height - rowStep },
    { x:left + width, y:top + rowStep }, { x:left + width / 2, y:top + height },
    { x:left, y:top + rowStep }, { x:left, y:top + height - rowStep }
  ];
}

function tileCenter(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  return {
    x:x * width + (y % 2 ? oddRowOffsetX : 0) + width / 2,
    y:y * rowStep + height / 2
  };
}

function neighbors(data, x, y) {
  const wrap = window.__v39FieldRuntime?.settings?.islandCustomSettings?.worldWrapEnabled !== false;
  return getHexNeighborCoords(data.w, data.h, x, y, wrap);
}

function tilesWithin(data, origin, radius) {
  const found = new Map([[coordKey(origin.x, origin.y), { x:origin.x, y:origin.y, distance:0 }]]);
  let frontier = [{ x:origin.x, y:origin.y }];
  for (let distance = 1; distance <= radius; distance += 1) {
    const next = [];
    for (const tile of frontier) {
      for (const neighbor of neighbors(data, tile.x, tile.y)) {
        if (found.has(neighbor.key)) continue;
        const value = { x:neighbor.x, y:neighbor.y, distance };
        found.set(neighbor.key, value);
        next.push(value);
      }
    }
    frontier = next;
  }
  return found;
}

function directionLine(data, from, target, length) {
  const adjacent = neighbors(data, from.x, from.y);
  let current = adjacent.reduce((best, item) => {
    const score = Math.hypot(item.x - target.x, item.y - target.y);
    return !best || score < best.score ? { ...item, score } : best;
  }, null);
  if (!current) return [];
  const out = [current];
  let previous = from;
  while (out.length < length) {
    const options = neighbors(data, current.x, current.y).filter((item) => item.key !== coordKey(previous.x, previous.y));
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const next = options.reduce((best, item) => {
      const score = Math.abs((item.x - current.x) - dx) + Math.abs((item.y - current.y) - dy);
      return !best || score < best.score ? { ...item, score } : best;
    }, null);
    if (!next) break;
    previous = current;
    current = next;
    out.push(current);
  }
  return out;
}

function buildAreaScaleMap(data, attacker, target, skillRow) {
  const type = resolveAreaType(skillRow);
  const result = new Map([[coordKey(target.x, target.y), 1]]);
  if (type === "circle") {
    for (const [key] of tilesWithin(data, target, 1)) result.set(key, 1);
  } else if (type === "around") {
    result.clear();
    for (const [key, tile] of tilesWithin(data, attacker, resolveAttackRange(skillRow, attacker))) {
      if (tile.distance > 0) result.set(key, 1);
    }
  } else if (type === "line") {
    result.clear();
    for (const tile of directionLine(data, attacker, target, resolveAttackRange(skillRow, attacker))) result.set(tile.key, 1);
  } else if (type === "fan" || type === "front") {
    for (const tile of directionLine(data, attacker, target, resolveAttackRange(skillRow, attacker))) {
      result.set(tile.key, 1);
      for (const adjacent of neighbors(data, tile.x, tile.y)) result.set(adjacent.key, 1);
    }
  } else if (type === "all") {
    result.clear();
    for (const [key, tile] of tilesWithin(data, attacker, resolveAttackRange(skillRow, attacker))) {
      if (tile.distance > 0) result.set(key, 1);
    }
  }
  const splash = resolveSplashSpec(skillRow);
  if (splash.fullRadius > 0 || splash.fractionalRadius > 0) {
    const radius = Math.max(splash.fullRadius, splash.fractionalRadius);
    for (const [key, tile] of tilesWithin(data, target, radius)) {
      if (tile.distance <= splash.fullRadius) result.set(key, 1);
      else if (tile.distance === splash.fractionalRadius) result.set(key, splash.fractionalRatio);
    }
  }
  return result;
}

function destroyGraphics() {
  rangeGraphics?.destroy?.();
  areaGraphics?.destroy?.();
  rangeGraphics = null;
  areaGraphics = null;
}

function drawTiles(map, color, alpha, depth, existing) {
  const ctx = activeRuntime();
  existing?.destroy?.();
  if (!ctx) return null;
  const graphics = ctx.scene.add.graphics().setDepth(depth);
  for (const key of map.keys()) {
    const [x, y] = key.split(",").map(Number);
    const points = hexPoints(x, y);
    graphics.fillStyle(color, alpha).fillPoints(points, true);
    graphics.lineStyle(2, color, 0.95).strokePoints(points, true);
  }
  return graphics;
}

function drawAttackArea(areaScale) {
  const ctx = activeRuntime();
  areaGraphics?.destroy?.();
  areaGraphics = null;
  if (!ctx || !(areaScale instanceof Map)) return;
  areaGraphics = ctx.scene.add.graphics().setDepth(AREA_DEPTH);
  for (const [key, scale] of areaScale) {
    const [x, y] = key.split(",").map(Number);
    const points = hexPoints(x, y);
    const color = scale < 1 ? 0xf08a32 : 0xe44d3a;
    areaGraphics.fillStyle(color, 0.25).fillPoints(points, true);
    areaGraphics.lineStyle(2, color, 0.98).strokePoints(points, true);
  }
}

function previewAttackArea(target) {
  if (!attackSession || !attackSession.rangeTiles.has(coordKey(target?.x, target?.y))) {
    areaGraphics?.destroy?.();
    areaGraphics = null;
    return false;
  }
  const ctx = activeRuntime();
  const unit = selectedUnit();
  if (!ctx || !unit) return false;
  drawAttackArea(buildAreaScaleMap(ctx.data, unit, target, attackSession.skillRow));
  return true;
}

function tileAtPointer(event) {
  const ctx = activeRuntime();
  const host = document.getElementById("v39-phaser-field");
  if (!ctx || !(host instanceof HTMLElement) || !host.contains(event.target)) return null;
  const rect = host.getBoundingClientRect();
  const camera = ctx.scene.cameras.main;
  const screenX = (event.clientX - rect.left) * (camera.width / Math.max(1, rect.width));
  const screenY = (event.clientY - rect.top) * (camera.height / Math.max(1, rect.height));
  const world = camera.getWorldPoint(screenX, screenY);
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  const estimatedY = Math.round((world.y - height / 2) / rowStep);
  let best = null;
  for (let y = estimatedY - 1; y <= estimatedY + 1; y += 1) {
    if (y < 0 || y >= ctx.data.h) continue;
    const estimatedX = Math.round((world.x - (y % 2 ? oddRowOffsetX : 0) - width / 2) / width);
    for (let x = estimatedX - 1; x <= estimatedX + 1; x += 1) {
      if (x < 0 || x >= ctx.data.w) continue;
      const center = tileCenter(x, y);
      const distance = Math.hypot(world.x - center.x, world.y - center.y);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  }
  return best;
}

function setBanner(message = "") {
  const banner = document.getElementById("modeBanner");
  if (!banner) return;
  banner.textContent = message;
  banner.classList.toggle("show", !!message);
}

function showToast(message) {
  showV39Feedback(message);
}

function cancelAttack(reason = "attack-cancelled") {
  const hadSession = !!attackSession;
  attackSession = null;
  destroyGraphics();
  setBanner("");
  document.getElementById("mobileBattleAttack")?.classList.remove("active");
  if (hadSession) window.dispatchEvent(new CustomEvent("v39:attack-cancelled", { detail:{ reason } }));
}

function selectedAttackRow(unit) {
  const rows = resolveAttackRows(unit);
  return rows.find((row) => text(row?.名前) === selectedSkillName) || rows[0] || null;
}

function resolveRevivalTarget(player, target, revivalSpec) {
  if (!revivalSpec) return { ok:false, reason:"蘇生効果が設定されていません" };
  const unit = (player?.factionState?.units || []).find((candidate) =>
    (text(candidate?.state) === "死亡" || number(candidate?.hp, candidate?.currentHp) <= 0)
      && integer(candidate?.x) === integer(target?.x)
      && integer(candidate?.y) === integer(target?.y)
  );
  if (!unit) return { ok:false, reason:"対象位置に死亡した味方がいません" };
  const levelBefore = Math.max(1, integer(unit?.level, integer(unit?.Lv, 1)));
  const levelAfter = levelBefore - revivalSpec.levelLoss;
  if (levelAfter <= 0) return { ok:false, reason:`Lv${levelBefore}から${revivalSpec.levelLoss}低下すると0以下になるため蘇生できません` };
  return { ok:true, unit, levelBefore, levelAfter };
}

function unavailableAttackReason(skillName) {
  const faction = activeFaction();
  const unit = selectedUnit(faction);
  const row = resolveAttackRows(unit).find(item => text(item?.名前) === text(skillName));
  if (!unit || !row) return "攻撃するキャラクターと技を選択してください";
  if (text(unit?.state) === "死亡" || number(unit?.hp, unit?.currentHp) <= 0) return "死亡したキャラクターは攻撃できません";
  if (currentAp(unit) < resolveAttackApCost(row)) return "APが不足しています";
  const timing = unitRuntimeState(faction, unit, row);
  if (timing.pending) return "別の行動を発動待機中です";
  if (timing.cooldownRemainingTurns > 0) return `CT中です。残り${timing.cooldownRemainingTurns}ターン`;
  return "現在は使用できません";
}

function renderActionPanel() {
  const unit = selectedUnit();
  const list = document.getElementById("detailTechniqueList");
  if (!(list instanceof HTMLElement)) return;

  const rows = resolveAttackRows(unit);
  const rowByName = new Map(rows.map(row => [text(row?.名前), row]).filter(([name]) => !!name));
  const actionButtons = [...list.querySelectorAll("[data-v39-attack-name]")];
  const visibleActionNames = actionButtons
    .map(button => text(button?.dataset?.v39AttackName))
    .filter(name => rowByName.has(name));

  if (!rowByName.has(selectedSkillName)) {
    selectedSkillName = visibleActionNames[0] || text(rows[0]?.名前);
  }

  for (const button of actionButtons) {
    const name = text(button?.dataset?.v39AttackName);
    const row = rowByName.get(name) || null;
    const timing = unitRuntimeState(activeFaction(), unit, row);
    const disabled = !row
      || currentAp(unit) < resolveAttackApCost(row)
      || text(unit?.state) === "死亡"
      || number(unit?.hp, unit?.currentHp) <= 0
      || !!timing.pending
      || timing.cooldownRemainingTurns > 0;
    const selected = !!row && name === selectedSkillName;
    button.classList.toggle("active", selected);
    button.classList.toggle("unavailable", disabled);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-disabled", String(disabled));
  }

  document.getElementById("mobileBattleAttack")?.classList.toggle("active", !!attackSession);
}

function startAttack() {
  const ctx = activeRuntime();
  const faction = activeFaction();
  const unit = selectedUnit(faction);
  const skillRow = selectedAttackRow(unit);
  if (attackSession) {
    cancelAttack();
    return false;
  }
  window.cancelV39SelectedUnitMove?.("attack-command-started");
  if (!ctx || !unit || !skillRow) {
    showToast("攻撃するキャラクターと技を選択してください");
    return false;
  }
  const apCost = resolveAttackApCost(skillRow);
  if (currentAp(unit) < apCost) {
    showToast("APが不足しています");
    return false;
  }
  const timing = unitRuntimeState(faction, unit, skillRow);
  if (timing.pending) {
    showToast("別の行動を発動待機中です");
    return false;
  }
  if (timing.cooldownRemainingTurns > 0) {
    showToast(`CT中です。残り${timing.cooldownRemainingTurns}ターン`);
    return false;
  }
  const range = resolveAttackRange(skillRow, unit);
  const rangeTiles = tilesWithin(ctx.data, unit, range);
  if (!isV39SupportSkill(skillRow, terrainAdjusted(unit))) rangeTiles.delete(coordKey(unit.x, unit.y));
  attackSession = { unitId:text(unit.id), skillName:text(skillRow.名前), skillRow, range, rangeTiles };
  rangeGraphics = drawTiles(rangeTiles, 0xf3d84a, 0.20, RANGE_DEPTH, rangeGraphics);
  document.getElementById("mobileBattleAttack")?.classList.add("active");
  setBanner(`${text(skillRow.名前)}：黄色が射程、対象位置を選択`);
  return true;
}

function logDamage(attacker, target, skillRow, damage) {
  console.info("[ダメージ計算]", {
    攻撃者:text(attacker?.name), 対象:text(target?.name), 技名:text(skillRow?.名前), 攻撃手段:text(skillRow?.攻撃手段),
    計算威力:damage.detail.power, 判定参照ステータス:text(skillRow?.判定, "-"),
    防御参照ステータス:damage.detail.defenseKey, 防御値:damage.detail.defense,
    命中参照ステータス:damage.detail.accuracyKey, 命中値:damage.detail.accuracy,
    回避値:damage.detail.evasion, 命中率:`${Math.round(damage.detail.hitRate * 1000) / 10}%`, Miss数:damage.missCount,
    耐性軽減割合:`${Math.round(damage.detail.resistanceRate * 1000) / 10}%`, Lv軽減値:damage.detail.levelReduction,
    攻撃側地形補正:{ 地形:damage.detail.attackerTerrain, 補正:damage.detail.attackerTerrainModifiers },
    防御側地形補正:{ 地形:damage.detail.targetTerrain, 補正:damage.detail.targetTerrainModifiers },
    ガード吸収前:damage.hitsBeforeGuard, ガード吸収値:damage.guardAbsorbed, ガード残量:damage.guardRemaining,
    適用パッシブ:damage.detail.appliedPassiveSkillNames,
    攻撃回数:damage.detail.attackCount, ヒットダメージ配列:damage.hits, 合計ダメージ:damage.total, スキルデータ:skillRow
  });
}

function clearPendingAction(playerId, unitId, reason = "pending-cancelled") {
  const state = window.getV39GameState?.();
  const player = state?.players?.find((row) => row.id === playerId);
  if (!state || !player) return;
  const runtime = player.factionState.combatRuntime || {};
  const pendingActionsByUnitId = { ...(runtime.pendingActionsByUnitId || {}) };
  if (!pendingActionsByUnitId[unitId]) return;
  delete pendingActionsByUnitId[unitId];
  const players = state.players.map((row) => row.id === playerId ? {
    ...row,
    factionState:{ ...row.factionState, combatRuntime:{ ...runtime, pendingActionsByUnitId } }
  } : row);
  window.setV39GameState({ players }, { reason });
  window.dispatchEvent(new CustomEvent("v39:cast-ended", { detail:{ playerId, unitId, reason } }));
}

function executeAttack(target) {
  if (!attackSession) return false;
  const session = attackSession;
  const state = window.getV39GameState?.();
  const player = state?.players?.find((row) => row.id === state.activePlayerId);
  const attacker = player?.factionState?.units?.find((unit) => text(unit?.id) === session.unitId);
  if (!state || !player || !attacker) return false;
  if (!session.rangeTiles.has(coordKey(target.x, target.y))) {
    showToast("射程外です");
    return false;
  }
  const revivalSpec = resolveV39RevivalSpec(session.skillRow);
  if (revivalSpec) {
    const validation = resolveRevivalTarget(player, target, revivalSpec);
    if (!validation.ok) {
      showToast(validation.reason);
      return false;
    }
  }
  const delayTurns = castDurationTurns(session.skillRow);
  if (delayTurns <= 0) return performAttack(target, { ...session, playerId:player.id });
  const apCost = resolveAttackApCost(session.skillRow);
  if (currentAp(attacker) < apCost) {
    showToast("APが不足しています");
    cancelAttack("ap-shortage");
    return false;
  }
  const startedTurn = currentV39TurnNumber(state);
  const pending = {
    playerId:player.id,
    unitId:text(attacker.id),
    skillName:text(session.skillRow?.名前),
    skillRow:session.skillRow,
    target:{ x:integer(target.x), y:integer(target.y) },
    startedTurn,
    resolvesAtTurn:resolveV39DeadlineTurn(startedTurn, delayTurns),
    apCost
  };
  const runtime = player.factionState.combatRuntime || {};
  const pendingActionsByUnitId = { ...(runtime.pendingActionsByUnitId || {}), [text(attacker.id)]:pending };
  const players = state.players.map((row) => row.id !== player.id ? row : {
    ...row,
    factionState:{
      ...row.factionState,
      units:row.factionState.units.map((unit) => {
        if (text(unit.id) !== text(attacker.id)) return unit;
        const ap = Math.max(0, currentAp(unit) - apCost);
        return { ...unit, ap, currentAp:ap, actionPoint:ap };
      }),
      combatRuntime:{ ...runtime, pendingActionsByUnitId }
    }
  });
  window.setV39GameState({ players }, { reason:"combat-cast-start" });
  window.dispatchEvent(new CustomEvent("v39:cast-started", { detail:pending }));
  window.dispatchEvent(new CustomEvent("v39:combat-log", {
    detail:{ summary:`${text(attacker.name)}：${pending.skillName} 発動待機 ${delayTurns}ターン / AP-${apCost}`, attackerId:text(attacker.id), skillName:pending.skillName, apCost, target:pending.target, entries:[] }
  }));
  showToast(`${pending.skillName}：${delayTurns}ターン後に発動`);
  cancelAttack("cast-started");
  renderActionPanel();
  return true;
}

function performRevival(target, session, options, state, player, attacker, revivalSpec, apCost) {
  const validation = resolveRevivalTarget(player, target, revivalSpec);
  if (!validation.ok) {
    showToast(validation.reason);
    if (options.clearPending) clearPendingAction(player.id, text(attacker.id), "cast-target-invalid");
    return false;
  }
  const result = window.reviveV39Unit?.(player.id, validation.unit.id, {
    hp:revivalSpec.reviveHp,
    levelLoss:revivalSpec.levelLoss,
    x:target.x,
    y:target.y,
    select:false
  });
  if (!result?.ok) {
    showToast(text(result?.reason, "蘇生に失敗しました"));
    if (options.clearPending) clearPendingAction(player.id, text(attacker.id), "cast-target-invalid");
    return false;
  }
  const latestState = window.getV39GameState?.();
  const latestPlayer = latestState?.players?.find((row) => row.id === player.id);
  if (!latestState || !latestPlayer) return false;
  const runtime = latestPlayer.factionState.combatRuntime || {};
  const pendingActionsByUnitId = { ...(runtime.pendingActionsByUnitId || {}) };
  if (options.clearPending) delete pendingActionsByUnitId[text(attacker.id)];
  const cooldownsByUnitId = { ...(runtime.cooldownsByUnitId || {}) };
  const cooldownTurns = cooldownDurationTurns(session.skillRow);
  if (cooldownTurns > 0) cooldownsByUnitId[text(attacker.id)] = {
    ...(cooldownsByUnitId[text(attacker.id)] || {}),
    [text(session.skillRow?.名前)]:resolveV39DeadlineTurn(currentV39TurnNumber(latestState), cooldownTurns)
  };
  const players = latestState.players.map((row) => row.id !== player.id ? row : ({
    ...row,
    factionState:{
      ...row.factionState,
      units:row.factionState.units.map((unit) => {
        if (text(unit.id) !== text(attacker.id)) return unit;
        const ap = options.apPaid ? currentAp(unit) : Math.max(0, currentAp(unit) - apCost);
        return { ...unit, ap, currentAp:ap, actionPoint:ap, lastUsedAttack:text(session.skillRow?.名前) };
      }),
      combatRuntime:{ ...runtime, pendingActionsByUnitId, cooldownsByUnitId }
    }
  }));
  window.setV39GameState({ players }, { reason:"combat-revival" });
  const effectName = text(session.skillRow?.アニメ);
  if (effectName && window.__v39SuppressCombatEffects !== true) void window.playV39MapEffect?.({
    effectName,
    tileX:target.x,
    tileY:target.y,
    splash:resolveSplashSpec(session.skillRow).value
  });
  const summary = `${text(attacker.name)}：${text(session.skillRow?.名前)} / ${text(result.unit?.name)} Lv${result.levelBefore}→${result.levelAfter} / HP${result.hp} / AP-${apCost}`;
  window.dispatchEvent(new CustomEvent("v39:combat-log", {
    detail:{ summary, attackerId:text(attacker.id), skillName:text(session.skillRow?.名前), apCost, target, entries:[] }
  }));
  if (options.clearPending) window.dispatchEvent(new CustomEvent("v39:cast-ended", { detail:{ playerId:player.id, unitId:text(attacker.id), reason:"resolved" } }));
  showToast(summary);
  cancelAttack("revival-complete");
  renderActionPanel();
  return true;
}

function performAttack(target, session = attackSession, options = {}) {
  if (!session) return false;
  const ctx = activeRuntime();
  const state = window.getV39GameState?.();
  const player = state?.players?.find((row) => row.id === text(session.playerId, state?.activePlayerId));
  const attacker = player?.factionState?.units?.find((unit) => text(unit?.id) === session.unitId);
  if (!ctx || !state || !player || !attacker || number(attacker?.hp, attacker?.currentHp) <= 0) {
    if (options.clearPending) clearPendingAction(text(session?.playerId), text(session?.unitId), "cast-cancelled");
    return false;
  }
  const targetKey = coordKey(target.x, target.y);
  const rangeTiles = session.rangeTiles instanceof Map
    ? session.rangeTiles
    : tilesWithin(ctx.data, attacker, resolveAttackRange(session.skillRow, attacker));
  const adjustedAttacker = terrainAdjusted(attacker);
  const revivalSpec = resolveV39RevivalSpec(session.skillRow);
  const supportSkill = isV39SupportSkill(session.skillRow, adjustedAttacker);
  if (!supportSkill) rangeTiles.delete(coordKey(attacker.x, attacker.y));
  if (!rangeTiles.has(targetKey)) {
    showToast("射程外です");
    if (options.clearPending) clearPendingAction(player.id, text(attacker.id), "cast-target-invalid");
    return false;
  }
  const apCost = resolveAttackApCost(session.skillRow);
  const targetFaction = !supportSkill && state.players.find((row) => row.id !== player.id && row?.factionState?.units?.some((unit) =>
    integer(unit?.x) === integer(target.x) && integer(unit?.y) === integer(target.y) && number(unit?.hp, unit?.currentHp) > 0
  ));
  if (targetFaction && window.canV39AttackFaction?.(player.id, targetFaction.id) !== true) {
    showToast("宣戦していない勢力には攻撃できません");
    return false;
  }
  if (!options.apPaid && currentAp(attacker) < apCost) {
    showToast("APが不足しています");
    cancelAttack("ap-shortage");
    return false;
  }
  if (revivalSpec) return performRevival(target, session, options, state, player, attacker, revivalSpec, apCost);
  const areaScale = buildAreaScaleMap(ctx.data, attacker, target, session.skillRow);
  const supportTargets = supportSkill
    ? player.factionState.units.filter(unit => number(unit?.hp, unit?.currentHp) > 0 && areaScale.has(coordKey(unit.x, unit.y)))
    : [];
  if (supportSkill && !supportTargets.length) {
    showToast("対象位置に生存中の味方がいません");
    return false;
  }
  drawAttackArea(areaScale);
  const effectName = text(session.skillRow?.アニメ, supportSkill ? "" : "斬撃");
  if (effectName && window.__v39SuppressCombatEffects !== true) void window.playV39MapEffect?.({
    effectName,
    tileX:target.x,
    tileY:target.y,
    splash:resolveSplashSpec(session.skillRow).value
  });
  const damageById = new Map();
  const combatLog = [];
  for (const enemy of supportSkill ? [] : state.enemies) {
    const scale = areaScale.get(coordKey(enemy.x, enemy.y));
    if (scale === undefined || number(enemy?.hp, enemy?.currentHp) <= 0) continue;
    const damage = applyV39GuardToDamage(enemy, computeAttackDamage({ attacker:terrainAdjusted(attacker), target:terrainAdjusted(enemy), skillRow:session.skillRow, scale, isCounter:!!options.isCounter }));
    damageById.set(text(enemy.id), damage);
    const beforeHp = Math.max(0, number(enemy?.hp, enemy?.currentHp));
    combatLog.push({
      targetId:text(enemy.id), targetName:text(enemy.name), x:enemy.x, y:enemy.y,
      beforeHp, afterHp:Math.max(0, beforeHp - damage.total), maxHp:Math.max(1, number(enemy?.maxHp, beforeHp)),
      friendly:false, ...damage
    });
    logDamage(attacker, enemy, session.skillRow, damage);
  }
  const friendlyDamageById = new Map();
  for (const ally of supportSkill ? [] : player.factionState.units) {
    if (text(ally.id) === text(attacker.id)) continue;
    const scale = areaScale.get(coordKey(ally.x, ally.y));
    if (scale === undefined || number(ally?.hp, ally?.currentHp) <= 0) continue;
    const damage = applyV39GuardToDamage(ally, computeAttackDamage({ attacker:terrainAdjusted(attacker), target:terrainAdjusted(ally), skillRow:session.skillRow, scale, friendly:true, isCounter:!!options.isCounter }));
    friendlyDamageById.set(text(ally.id), damage);
    const beforeHp = Math.max(0, number(ally?.hp, ally?.currentHp));
    combatLog.push({
      targetId:text(ally.id), targetName:text(ally.name), x:ally.x, y:ally.y,
      beforeHp, afterHp:Math.max(0, beforeHp - damage.total), maxHp:Math.max(1, number(ally?.maxHp, beforeHp)),
      friendly:true, ...damage
    });
    logDamage(attacker, ally, session.skillRow, damage);
  }
  const foreignDamageById = new Map();
  for (const foreignPlayer of supportSkill ? [] : state.players) {
    if (foreignPlayer.id === player.id || window.canV39AttackFaction?.(player.id, foreignPlayer.id) !== true) continue;
    for (const foreignUnit of foreignPlayer?.factionState?.units || []) {
      const scale = areaScale.get(coordKey(foreignUnit.x, foreignUnit.y));
      if (scale === undefined || number(foreignUnit?.hp, foreignUnit?.currentHp) <= 0) continue;
      const damage = applyV39GuardToDamage(foreignUnit, computeAttackDamage({ attacker:terrainAdjusted(attacker), target:terrainAdjusted(foreignUnit), skillRow:session.skillRow, scale, isCounter:!!options.isCounter }));
      foreignDamageById.set(text(foreignUnit.id), damage);
      const beforeHp = Math.max(0, number(foreignUnit?.hp, foreignUnit?.currentHp));
      combatLog.push({
        targetId:text(foreignUnit.id), targetName:text(foreignUnit.name), targetPlayerId:foreignPlayer.id,
        x:foreignUnit.x, y:foreignUnit.y, beforeHp, afterHp:Math.max(0, beforeHp-damage.total),
        maxHp:Math.max(1, number(foreignUnit?.maxHp, beforeHp)), friendly:false, ...damage
      });
      logDamage(attacker, foreignUnit, session.skillRow, damage);
    }
  }
  const deathTurn = currentV39TurnNumber(state);
  const deathPatch = (unit, hp) => {
    if (hp > 0 || text(unit?.state) === "死亡") return {};
    return {
      state:"死亡",
      diedAtTurn:deathTurn,
      deadExpireTurn:resolveV39DeadlineTurn(deathTurn, DEFAULT_CORPSE_FIELD_TURNS),
      deathPosition:{ x:integer(unit?.x), y:integer(unit?.y) },
      deathCause:text(session.skillRow?.名前),
      deathTurn
    };
  };
  const nextEnemies = state.enemies.map((enemy) => {
    const damage = damageById.get(text(enemy.id));
    if (!damage) return enemy;
    const hp = Math.max(0, number(enemy?.hp, enemy?.currentHp) - damage.total);
    return { ...enemy, hp, currentHp:hp, ...guardStatePatch(enemy, damage), state:hp <= 0 ? "死亡" : text(enemy?.state, "生存"), ...deathPatch(enemy, hp) };
  });
  const runtime = player.factionState.combatRuntime || {};
  const pendingActionsByUnitId = { ...(runtime.pendingActionsByUnitId || {}) };
  if (options.clearPending) delete pendingActionsByUnitId[text(attacker.id)];
  const cooldownsByUnitId = { ...(runtime.cooldownsByUnitId || {}) };
  const cooldownTurns = cooldownDurationTurns(session.skillRow);
  if (cooldownTurns > 0) cooldownsByUnitId[text(attacker.id)] = {
    ...(cooldownsByUnitId[text(attacker.id)] || {}),
    [text(session.skillRow?.名前)]:resolveV39DeadlineTurn(currentV39TurnNumber(state), cooldownTurns)
  };
  const activeEffectsByUnitId = { ...(runtime.activeEffectsByUnitId || {}) };
  const activeDurationTurns = effectDurationTurns(session.skillRow);
  const timedModifiers = resolveSkillTimedModifiers(session.skillRow);
  const healing = resolveSkillHealing(session.skillRow, adjustedAttacker);
  const grantedGuard = resolveSkillGuard(session.skillRow, adjustedAttacker, { isCounter:!!options.isCounter });
  const supportTargetIds = new Set(supportTargets.map(unit => text(unit.id)));
  if (supportSkill && activeDurationTurns > 0 && Object.keys(timedModifiers).length) for (const unitId of supportTargetIds) {
    const active = Array.isArray(activeEffectsByUnitId[unitId]) ? activeEffectsByUnitId[unitId] : [];
    activeEffectsByUnitId[unitId] = [
      ...active.filter(effect => text(effect?.skillName) !== text(session.skillRow?.名前)),
      { skillName:text(session.skillRow?.名前), expiresAtTurn:resolveV39DeadlineTurn(currentV39TurnNumber(state), activeDurationTurns), modifiers:timedModifiers }
    ];
  }
  const nextPlayers = state.players.map((row) => ({
    ...row,
    factionState:{
      ...row.factionState,
      units:row.factionState.units.map((unit) => {
        if (row.id !== player.id) {
          const damage = foreignDamageById.get(text(unit.id));
          if (!damage) return unit;
          const hp = Math.max(0, number(unit?.hp, unit?.currentHp)-damage.total);
          return { ...unit, hp, currentHp:hp, ...guardStatePatch(unit, damage), state:hp <= 0 ? "死亡" : text(unit?.state, "生存"), ...deathPatch(unit, hp) };
        }
        const own = text(unit.id) === text(attacker.id);
        const damage = friendlyDamageById.get(text(unit.id));
        const supportTarget = supportTargetIds.has(text(unit.id));
        const guardTarget = supportSkill ? supportTarget : own;
        const maxHp = Math.max(1, number(unit?.maxHp, unit?.status?.HP || unit?.hp));
        const hp = supportTarget && healing > 0
          ? Math.min(maxHp, number(unit?.hp, unit?.currentHp) + healing)
          : damage ? Math.max(0, number(unit?.hp, unit?.currentHp) - damage.total) : number(unit?.hp, unit?.currentHp);
        if (!own && !damage && !supportTarget && !guardTarget) return unit;
        const ap = own && !options.apPaid ? Math.max(0, currentAp(unit) - apCost) : currentAp(unit);
        return {
          ...unit, hp, currentHp:hp, ap, currentAp:ap,
          ...guardStatePatch(unit, damage, guardTarget ? grantedGuard : 0),
          state:hp <= 0 ? "死亡" : text(unit?.state, "生存"),
          lastUsedAttack:text(session.skillRow?.名前),
          ...deathPatch(unit, hp)
        };
      }),
      combatRuntime:row.id === player.id
        ? { ...runtime, pendingActionsByUnitId, cooldownsByUnitId, activeEffectsByUnitId }
        : row.factionState.combatRuntime
    }
  }));
  window.setV39GameState({ players:nextPlayers, enemies:nextEnemies }, { reason:"combat-attack" });
  const total = combatLog.reduce((sum, entry) => sum + entry.total, 0);
  const hits = combatLog.flatMap((entry) => (entry.hitResults || []).map(row => row.hit ? row.damage : "Miss"));
  const supportCount = supportTargetIds.size;
  const summary = supportSkill
    ? `${text(attacker.name)}：${text(session.skillRow.名前)} / ${healing > 0 ? `回復${healing} × ${supportCount}` : grantedGuard > 0 ? `ガード+${grantedGuard} × ${supportCount}` : `効果付与 × ${supportCount}`} / AP-${apCost}`
    : `${text(attacker.name)}：${text(session.skillRow.名前)} / 合計${total}${hits.length ? ` (${hits.join(",")})` : ""} / AP-${apCost}`;
  window.dispatchEvent(new CustomEvent("v39:combat-log", { detail:{ summary, attackerId:text(attacker.id), skillName:text(session.skillRow.名前), apCost, target, entries:combatLog } }));
  if (!supportSkill && !options.isCounter) window.dispatchEvent(new CustomEvent("v39:attack-resolved", {
    detail:{ attackerSide:"player", attackerId:text(attacker.id), target, skillRow:session.skillRow, entries:combatLog }
  }));
  if (options.clearPending) window.dispatchEvent(new CustomEvent("v39:cast-ended", { detail:{ playerId:player.id, unitId:text(attacker.id), reason:"resolved" } }));
  showToast(summary);
  cancelAttack("attack-complete");
  renderActionPanel();
  return true;
}

function performEnemyAttack({ enemyId, targetUnitId, skillRow, apPaid = false, isCounter = false, suppressEffect = false } = {}) {
  const ctx = activeRuntime();
  const state = window.getV39GameState?.();
  const attacker = state?.enemies?.find((enemy) => text(enemy?.id) === text(enemyId));
  const playerTarget = state?.players?.flatMap((player) => player?.factionState?.units || [])
    .find((unit) => text(unit?.id) === text(targetUnitId));
  const enemyTarget = state?.enemies?.find((enemy) => text(enemy?.id) === text(targetUnitId));
  const targetUnit = playerTarget || enemyTarget;
  if (!ctx || !state || !attacker || !targetUnit || number(attacker?.hp, attacker?.currentHp) <= 0 || number(targetUnit?.hp, targetUnit?.currentHp) <= 0) return false;
  const range = resolveAttackRange(skillRow, attacker);
  if (!tilesWithin(ctx.data, attacker, range).has(coordKey(targetUnit.x, targetUnit.y))) return false;
  const apCost = resolveAttackApCost(skillRow);
  if (!apPaid && currentAp(attacker) < apCost) return false;
  const areaScale = buildAreaScaleMap(ctx.data, attacker, targetUnit, skillRow);
  if (!suppressEffect && window.__v39SuppressCombatEffects !== true) void window.playV39MapEffect?.({
      effectName:text(skillRow?.アニメ, "斬撃"),
      tileX:targetUnit.x,
      tileY:targetUnit.y,
      splash:resolveSplashSpec(skillRow).value
    });
  const combatLog = [];
  const damageByUnitId = new Map();
  for (const player of state.players) {
    for (const unit of player?.factionState?.units || []) {
      const scale = areaScale.get(coordKey(unit.x, unit.y));
      if (scale === undefined || number(unit?.hp, unit?.currentHp) <= 0) continue;
    const damage = applyV39GuardToDamage(unit, computeAttackDamage({ attacker:terrainAdjusted(attacker), target:terrainAdjusted(unit), skillRow, scale, isCounter }));
      damageByUnitId.set(text(unit.id), damage);
      const beforeHp = Math.max(0, number(unit?.hp, unit?.currentHp));
      combatLog.push({
        targetId:text(unit.id), targetName:text(unit.name), x:unit.x, y:unit.y,
        beforeHp, afterHp:Math.max(0, beforeHp-damage.total), maxHp:Math.max(1, number(unit?.maxHp, beforeHp)),
        friendly:false, ...damage
      });
      logDamage(attacker, unit, skillRow, damage);
    }
  }
  const enemyDamageById = new Map();
  for (const enemy of state.enemies) {
    if (text(enemy.id) === text(attacker.id)) continue;
    const scale = areaScale.get(coordKey(enemy.x, enemy.y));
    if (scale === undefined || number(enemy?.hp, enemy?.currentHp) <= 0) continue;
    const friendly = text(enemy?.nestId) === text(attacker?.nestId);
    const damage = applyV39GuardToDamage(enemy, computeAttackDamage({ attacker:terrainAdjusted(attacker), target:terrainAdjusted(enemy), skillRow, scale, friendly, isCounter }));
    enemyDamageById.set(text(enemy.id), damage);
    const beforeHp = Math.max(0, number(enemy?.hp, enemy?.currentHp));
    combatLog.push({
      targetId:text(enemy.id), targetName:text(enemy.name), x:enemy.x, y:enemy.y,
      beforeHp, afterHp:Math.max(0, beforeHp-damage.total), maxHp:Math.max(1, number(enemy?.maxHp, beforeHp)),
      friendly, ...damage
    });
    logDamage(attacker, enemy, skillRow, damage);
  }
  const deathTurn = currentV39TurnNumber(state);
  const applyHp = (unit, damage) => {
    if (!damage) return unit;
    const hp = Math.max(0, number(unit?.hp, unit?.currentHp)-damage.total);
    const newlyDead = hp <= 0 && text(unit?.state) !== "死亡";
    return {
      ...unit,
      hp,
      currentHp:hp,
      state:hp <= 0 ? "死亡" : text(unit?.state, "生存"),
      ...guardStatePatch(unit, damage),
      ...(newlyDead ? {
        diedAtTurn:deathTurn,
        deadExpireTurn:resolveV39DeadlineTurn(deathTurn, DEFAULT_CORPSE_FIELD_TURNS),
        deathPosition:{ x:integer(unit?.x), y:integer(unit?.y) },
        deathCause:text(skillRow?.名前),
        deathTurn
      } : {})
    };
  };
  const players = state.players.map((player) => ({
    ...player,
    factionState:{ ...player.factionState, units:(player?.factionState?.units || []).map((unit) => applyHp(unit, damageByUnitId.get(text(unit.id)))) }
  }));
  const enemies = state.enemies.map((enemy) => {
    if (text(enemy.id) === text(attacker.id)) {
      const ap = apPaid ? currentAp(enemy) : Math.max(0, currentAp(enemy)-apCost);
      const grantedGuard = resolveSkillGuard(skillRow, terrainAdjusted(attacker), { isCounter });
      return { ...enemy, ap, currentAp:ap, actionPoint:ap, lastUsedAttack:text(skillRow?.名前), ...guardStatePatch(enemy, null, grantedGuard) };
    }
    return applyHp(enemy, enemyDamageById.get(text(enemy.id)));
  });
  const attackedNestId = enemyTarget && text(enemyTarget?.nestId) !== text(attacker?.nestId) ? text(enemyTarget?.nestId) : "";
  const enemyNests = attackedNestId
    ? (state.enemyNests || []).map(nest => text(nest?.id) === attackedNestId ? {
      ...nest,
      lastAttackedByNestId:text(attacker?.nestId),
      lastNestCombatTurn:currentV39TurnNumber(state)
    } : nest)
    : state.enemyNests;
  window.setV39GameState({ players, enemies, enemyNests }, { reason:"enemy-combat-attack" });
  const total = combatLog.reduce((sum, entry) => sum+entry.total, 0);
  const hits = combatLog.flatMap((entry) => (entry.hitResults || []).map(row => row.hit ? row.damage : "Miss"));
  const summary = `${text(attacker.name)}：${text(skillRow?.名前)} / 合計${total}${hits.length ? ` (${hits.join(",")})` : ""} / AP-${apCost}`;
  window.dispatchEvent(new CustomEvent("v39:combat-log", { detail:{ summary, attackerId:text(attacker.id), skillName:text(skillRow?.名前), apCost, target:{ x:targetUnit.x, y:targetUnit.y }, entries:combatLog, enemyAction:true } }));
  if (!isCounter) window.dispatchEvent(new CustomEvent("v39:attack-resolved", {
    detail:{ attackerSide:"enemy", targetSide:enemyTarget ? "enemy" : "player", attackerId:text(attacker.id), targetUnitId:text(targetUnit.id), target:{ x:targetUnit.x, y:targetUnit.y }, skillRow, entries:combatLog }
  }));
  return true;
}

function executeCounterAction({ attackerSide, attackerId, targetId } = {}) {
  const state = window.getV39GameState?.();
  const attacker = attackerSide === "enemy"
    ? state?.enemies?.find((unit) => text(unit.id) === text(attackerId))
    : state?.players?.flatMap((player) => player?.factionState?.units || []).find((unit) => text(unit.id) === text(attackerId));
  const target = state?.enemies?.find((unit) => text(unit.id) === text(targetId))
    || state?.players?.flatMap((player) => player?.factionState?.units || []).find((unit) => text(unit.id) === text(targetId));
  const skillRow = resolveCounterAttackRow(attacker);
  if (!attacker || !target || !skillRow || number(attacker?.hp, attacker?.currentHp) <= 0 || number(target?.hp, target?.currentHp) <= 0) return false;
  if (attackerSide === "enemy") {
    return performEnemyAttack({ enemyId:text(attacker.id), targetUnitId:text(target.id), skillRow, apPaid:true, isCounter:true });
  }
  const player = state.players.find((row) => row?.factionState?.units?.some((unit) => text(unit.id) === text(attacker.id)));
  return performAttack({ x:target.x, y:target.y }, {
    playerId:player?.id,
    unitId:text(attacker.id),
    skillName:text(skillRow.名前),
    skillRow
  }, { apPaid:true, isCounter:true });
}

function handleCounter(event) {
  const detail = event?.detail || {};
  const state = window.getV39GameState?.();
  if (!state || !canTriggerMeleeCounter(detail.skillRow, detail.attackerSide === "enemy"
    ? state.enemies.find((unit) => text(unit.id) === text(detail.attackerId))
    : state.players.flatMap((player) => player?.factionState?.units || []).find((unit) => text(unit.id) === text(detail.attackerId)))) return;
  const directEntry = (detail.entries || []).find((entry) => entry.friendly !== true && integer(entry.x) === integer(detail.target?.x) && integer(entry.y) === integer(detail.target?.y));
  if (!directEntry || number(directEntry.afterHp) <= 0) return;
  executeCounterAction({
    attackerSide:detail.attackerSide === "enemy" ? "player" : "enemy",
    attackerId:text(directEntry.targetId),
    targetId:text(detail.attackerId)
  });
}

function pruneCombatRuntime(turnNumber = currentV39TurnNumber()) {
  const state = window.getV39GameState?.();
  if (!state) return;
  let changed = false;
  const players = state.players.map((player) => {
    const runtime = player.factionState.combatRuntime || {};
    const cooldownsByUnitId = {};
    for (const [unitId, cooldowns] of Object.entries(runtime.cooldownsByUnitId || {})) {
      const active = Object.fromEntries(Object.entries(cooldowns || {}).filter(([, expiresAtTurn]) => number(expiresAtTurn) > turnNumber));
      if (Object.keys(active).length) cooldownsByUnitId[unitId] = active;
      if (Object.keys(active).length !== Object.keys(cooldowns || {}).length) changed = true;
    }
    const activeEffectsByUnitId = {};
    for (const [unitId, effects] of Object.entries(runtime.activeEffectsByUnitId || {})) {
      const active = (Array.isArray(effects) ? effects : []).filter((effect) => number(effect?.expiresAtTurn) > turnNumber);
      if (active.length) activeEffectsByUnitId[unitId] = active;
      if (active.length !== (Array.isArray(effects) ? effects.length : 0)) changed = true;
    }
    return changed ? {
      ...player,
      factionState:{ ...player.factionState, combatRuntime:{ ...runtime, cooldownsByUnitId, activeEffectsByUnitId } }
    } : player;
  });
  if (changed) window.setV39GameState({ players }, { reason:"combat-timing-expired" });
}

function resolvePendingActions(turnNumber = currentV39TurnNumber()) {
  const state = window.getV39GameState?.();
  for (const player of state?.players || []) {
    for (const pending of Object.values(player?.factionState?.combatRuntime?.pendingActionsByUnitId || {})) {
      if (number(pending?.resolvesAtTurn) > turnNumber) continue;
      performAttack(pending.target, {
        playerId:player.id,
        unitId:text(pending.unitId),
        skillName:text(pending.skillName),
        skillRow:pending.skillRow
      }, { apPaid:true, clearPending:true });
      return;
    }
  }
}

function bindCapture(target, type, handler) {
  target.addEventListener(type, (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    handler(event);
  }, true);
}

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #detailTechniqueList .action-technique.unavailable{opacity:.38;filter:saturate(.4);cursor:not-allowed}
    #detailTechniqueList .action-technique.active{border-color:#e7c466}
  `;
  document.head.appendChild(style);
}

function install() {
  const techniqueList = document.getElementById("detailTechniqueList");
  const attackButton = document.getElementById("mobileBattleAttack");
  if (!(techniqueList instanceof HTMLElement) || !(attackButton instanceof HTMLElement)) {
    window.setTimeout(install, 50);
    return;
  }
  installStyles();
  bindCapture(techniqueList, "click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-v39-attack-name]") : null;
    if (!button) return;
    if (button.classList.contains("unavailable")) {
      return showToast(unavailableAttackReason(button.dataset.v39AttackName));
    }
    selectedSkillName = text(button.dataset.v39AttackName);
    cancelAttack("skill-changed");
    renderActionPanel();
  });
  bindCapture(attackButton, "click", startAttack);
window.addEventListener("v39:tile-selected", (event) => {
    if (attackSession) executeAttack(event.detail);
  });
  window.addEventListener("pointermove", (event) => {
    if (!attackSession || hoverFrame) return;
    hoverFrame = window.requestAnimationFrame(() => {
      hoverFrame = 0;
      const tile = tileAtPointer(event);
      if (tile) previewAttackArea(tile);
    });
  }, true);
  window.addEventListener("v39:unit-selected", () => { cancelAttack("unit-changed"); renderActionPanel(); });
  window.addEventListener("v39:squad-detail-rendered", renderActionPanel);
  window.addEventListener("v39:game-state-changed", (event) => {
    if (event?.detail?.reason === "active-player") cancelAttack("active-player-changed");
    renderActionPanel();
  });
  window.addEventListener("v39:turn-advanced", (event) => {
    const turnNumber = Math.max(1, integer(event?.detail?.turnNumber, currentV39TurnNumber()));
    resolvePendingActions(turnNumber);
    pruneCombatRuntime(turnNumber);
    renderActionPanel();
  });
  window.addEventListener("v39:attack-resolved", handleCounter);
  window.addEventListener("v39:field-generated", () => cancelAttack("field-regenerated"));
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") cancelAttack(); }, true);
  window.startV39SelectedUnitAttack = startAttack;
  window.cancelV39SelectedUnitAttack = cancelAttack;
  window.executeV39AttackAt = (x, y) => executeAttack({ x, y });
  window.previewV39AttackAt = (x, y) => previewAttackArea({ x, y });
  window.computeV39AttackDamage = params => computeAttackDamage({
    ...(params || {}),
    attacker:terrainAdjusted(params?.attacker),
    target:terrainAdjusted(params?.target)
  });
  window.executeV39EnemyCombatAction = performEnemyAttack;
  window.executeV39CounterAction = executeCounterAction;
  window.buildV39AttackAreaScaleMap = (attacker, target, skillRow) => {
    const ctx = activeRuntime();
    return ctx ? buildAreaScaleMap(ctx.data, attacker, target, skillRow) : new Map();
  };
  window.resolveV39PendingCombatActions = resolvePendingActions;
  window.getV39AttackSession = () => attackSession ? {
    unitId:attackSession.unitId, skillName:attackSession.skillName, range:attackSession.range,
    rangeTileKeys:[...attackSession.rangeTiles.keys()]
  } : null;
  renderActionPanel();
}

install();
