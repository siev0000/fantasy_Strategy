import { isV39SupportSkill, resolveActionSkillRows, resolveAttackApCost, resolveAttackRange } from "./lib/v39-combat-engine.js";
import { getHexDistance, getHexNeighborCoords } from "./lib/hex-grid.js";
import {
  isDetectedByScout,
  resolveDetectionGroupSense,
  resolveDetectionScoutValue
} from "./lib/v39-detection-rules.js";
import { canUnitEnterV39Tile } from "./lib/v39-terrain-traversal.js";
import {
  DEFAULT_MAGIC_CAST_TURNS,
  currentV39TurnNumber,
  parseV39TurnCount,
  remainingV39Turns,
  resolveV39DeadlineTurn
} from "./lib/v39-turn-timing.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));

const distance = getHexDistance;
const movedEnemyIdsThisTurn = new Set();

function patchEnemyTurnState(patch, reason) {
  if (window.patchV39EnemyTurnState?.(patch) === true) return;
  window.setV39GameState?.(patch, { reason, silent:true });
}

const enemyTurnState = () => window.getV39EnemyTurnState?.() || window.getV39GameState?.();

function isAlive(unit) {
  return number(unit?.hp, unit?.currentHp) > 0 && text(unit?.state, "生存") !== "死亡";
}

function visionRadius(enemy) {
  const search = resolveDetectionScoutValue(enemy);
  return 1 + Math.floor(search / 75);
}

function coordKey(x, y) {
  return `${integer(x)},${integer(y)}`;
}

function mapNeighbors(mapData, unit) {
  const wrap = mapData?.worldWrapEnabled !== false;
  return getHexNeighborCoords(mapData.w, mapData.h, unit?.x, unit?.y, wrap);
}

function enemyMoveStepCost(mapData, enemy, tile) {
  if (!canUnitEnterV39Tile(mapData, tile.x, tile.y, enemy)) return Number.POSITIVE_INFINITY;
  const fromHeight = number(mapData?.heightLevelMap?.[integer(enemy.y)]?.[integer(enemy.x)], Number.NaN);
  const toHeight = number(mapData?.heightLevelMap?.[tile.y]?.[tile.x], Number.NaN);
  const flight = Math.max(0, number(enemy?.status?.飛行, number(enemy?.飛行, number(enemy?.skillLevels?.飛行))));
  if (Number.isFinite(fromHeight) && Number.isFinite(toHeight) && Math.abs(toHeight-fromHeight) > 1 && flight <= 0) return Number.POSITIVE_INFINITY;
  const climb = Number.isFinite(fromHeight) && Number.isFinite(toHeight) ? Math.max(0, toHeight-fromHeight) : 0;
  const terrainCost = Math.max(0, 1 + climb*2 - Math.floor(flight/30));
  const movement = Math.max(1, integer(enemy?.status?.移動, integer(enemy?.移動, integer(enemy?.movement, 1))));
  return Math.max(0, Math.ceil(terrainCost * Math.max(1, number(enemy?.maxAp, 100)) / movement));
}

function availableEnemyMoves(state, enemy) {
  const mapData = window.__v39FieldRuntime?.mapData;
  if (!mapData?.grid) return [];
  const occupied = new Set([
    ...(state.enemies || []).filter(row => text(row.id) !== text(enemy.id) && isAlive(row)),
    ...state.players.flatMap(player => player?.factionState?.units || []).filter(isAlive),
    ...(state.settlements || [])
  ].map(row => coordKey(row.x, row.y)));
  return mapNeighbors(mapData, enemy)
    .filter(tile => !occupied.has(tile.key))
    .map(tile => ({ ...tile, cost:enemyMoveStepCost(mapData, enemy, tile) }))
    .filter(tile => Number.isFinite(tile.cost) && tile.cost <= number(enemy.ap));
}

function commitEnemyMove(state, enemy, next, turnNumber, behaviorPatch = {}) {
  if (!next) return false;
  const ap = Math.max(0, number(enemy.ap)-next.cost);
  const enemies = state.enemies.map(row => text(row.id) !== text(enemy.id)
    ? row
    : { ...row, ...behaviorPatch, x:next.x, y:next.y, ap, currentAp:ap, actionPoint:ap, lastMovedTurn:turnNumber });
  const runtime = {
    ...(state.enemyCombatRuntime || {}),
    lastActionTurnByEnemyId:{ ...(state.enemyCombatRuntime?.lastActionTurnByEnemyId || {}), [text(enemy.id)]:turnNumber }
  };
  patchEnemyTurnState({ enemies, enemyCombatRuntime:runtime }, "enemy-action-move");
  movedEnemyIdsThisTurn.add(text(enemy.id));
  return true;
}

function moveEnemyToward(state, enemy, target, turnNumber, stopDistance = 1, behaviorPatch = {}) {
  if (distance(enemy, target) <= stopDistance) return false;
  const currentDistance = distance(enemy, target);
  const next = availableEnemyMoves(state, enemy)
    .map(tile => ({ ...tile, targetDistance:distance(tile, target) }))
    .filter(tile => tile.targetDistance < currentDistance)
    .sort((a, b) => a.targetDistance-b.targetDistance || a.cost-b.cost || a.key.localeCompare(b.key))[0];
  return commitEnemyMove(state, enemy, next, turnNumber, behaviorPatch);
}

function moveEnemyAway(state, enemy, target, turnNumber, behaviorPatch = {}) {
  const currentDistance = distance(enemy, target);
  const next = availableEnemyMoves(state, enemy)
    .map(tile => ({ ...tile, targetDistance:distance(tile, target) }))
    .filter(tile => tile.targetDistance > currentDistance)
    .sort((a, b) => b.targetDistance-a.targetDistance || a.cost-b.cost || a.key.localeCompare(b.key))[0];
  return commitEnemyMove(state, enemy, next, turnNumber, behaviorPatch);
}

function patchEnemyBehavior(state, enemyId, patch, reason) {
  const enemies = state.enemies.map(enemy => text(enemy?.id) === text(enemyId) ? { ...enemy, ...patch } : enemy);
  patchEnemyTurnState({ enemies }, reason);
}

function chooseDeterministically(rows, enemyId, cycle) {
  if (!rows.length) return null;
  const source = `${String(enemyId)}:${Math.max(0, integer(cycle))}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return rows[(hash >>> 0) % rows.length];
}

function deterministicRatio(key) {
  let hash = 2166136261;
  for (const char of String(key || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function nestFor(state, enemy) {
  return (state?.enemyNests || []).find(nest => text(nest?.id) === text(enemy?.nestId)) || null;
}

function territoryCenter(enemy, nest) {
  return {
    x:integer(enemy?.territoryCenterX, integer(nest?.x, integer(enemy?.x))),
    y:integer(enemy?.territoryCenterY, integer(nest?.y, integer(enemy?.y)))
  };
}

function territoryRadius(enemy, nest) {
  return Math.max(1, integer(enemy?.territoryRadius, integer(nest?.territoryRadius, 1)));
}

function pursuitLimit(enemy, nest) {
  const outside = enemy?.aggressive === true
    ? Math.max(1, integer(enemy?.status?.移動, integer(enemy?.移動, integer(enemy?.movement, 1))))
    : 1;
  return territoryRadius(enemy, nest) + outside;
}

function roamInsideTerritory(state, enemy, nest, turnNumber) {
  const center = territoryCenter(enemy, nest);
  const radius = territoryRadius(enemy, nest);
  const candidates = availableEnemyMoves(state, enemy)
    .filter(tile => distance(tile, center) <= radius)
    .sort((a, b) => a.key.localeCompare(b.key));
  const next = chooseDeterministically(candidates, enemy.id, turnNumber);
  return commitEnemyMove(state, enemy, next, turnNumber, { fleeState:null });
}

function castTurns(skillRow) {
  const wait = parseV39TurnCount(skillRow?.待機);
  return text(skillRow?.攻撃手段) === "魔法" ? Math.max(DEFAULT_MAGIC_CAST_TURNS, wait) : wait;
}

function updateEnemyRuntime(mutator, reason) {
  const state = enemyTurnState();
  if (!state) return null;
  const next = mutator({
    pendingActionsByEnemyId:{ ...(state.enemyCombatRuntime?.pendingActionsByEnemyId || {}) },
    lastActionTurnByEnemyId:{ ...(state.enemyCombatRuntime?.lastActionTurnByEnemyId || {}) },
    cooldownsByEnemyId:{ ...(state.enemyCombatRuntime?.cooldownsByEnemyId || {}) },
    activeEffectsByEnemyId:{ ...(state.enemyCombatRuntime?.activeEffectsByEnemyId || {}) }
  }, state);
  if (!next) return null;
  patchEnemyTurnState({ enemyCombatRuntime:next }, reason);
  return next;
}

function markEnemyTurnAction(enemyId, turnNumber, reason) {
  updateEnemyRuntime((runtime) => {
    runtime.lastActionTurnByEnemyId[text(enemyId)] = turnNumber;
    return runtime;
  }, reason);
  return true;
}

function queueEnemyAttack(enemy, target, skillRow, turnNumber) {
  const apCost = resolveAttackApCost(skillRow);
  const delay = castTurns(skillRow);
  const state = enemyTurnState();
  const enemies = state.enemies.map((row) => text(row.id) === text(enemy.id)
    ? { ...row, ap:Math.max(0, number(row.ap)-apCost), currentAp:Math.max(0, number(row.ap)-apCost) }
    : row);
  const runtime = {
    ...(state.enemyCombatRuntime || {}),
    pendingActionsByEnemyId:{
      ...(state.enemyCombatRuntime?.pendingActionsByEnemyId || {}),
      [text(enemy.id)]:{
        enemyId:text(enemy.id), targetUnitId:text(target.id), skillRow, skillName:text(skillRow?.名前),
        startedTurn:turnNumber, resolvesAtTurn:resolveV39DeadlineTurn(turnNumber, delay), apCost
      }
    },
    lastActionTurnByEnemyId:{ ...(state.enemyCombatRuntime?.lastActionTurnByEnemyId || {}), [text(enemy.id)]:turnNumber }
  };
  patchEnemyTurnState({ enemies, enemyCombatRuntime:runtime }, "enemy-cast-start");
  window.dispatchEvent(new CustomEvent("v39:cast-started", { detail:{ unitId:text(enemy.id), enemyAction:true } }));
  window.dispatchEvent(new CustomEvent("v39:combat-log", {
    detail:{ summary:`${text(enemy.name)}：${text(skillRow?.名前)} 発動待機 ${delay}ターン / AP-${apCost}`, attackerId:text(enemy.id), skillName:text(skillRow?.名前), apCost, entries:[], enemyAction:true }
  }));
}

function setEnemyCooldown(enemyId, skillRow, turnNumber) {
  const duration = parseV39TurnCount(skillRow?.CT);
  if (duration <= 0) return;
  updateEnemyRuntime((runtime) => {
    runtime.cooldownsByEnemyId[text(enemyId)] = {
      ...(runtime.cooldownsByEnemyId[text(enemyId)] || {}),
      [text(skillRow?.名前)]:resolveV39DeadlineTurn(turnNumber, duration)
    };
    return runtime;
  }, "enemy-cooldown-start");
}

function executeEnemyAttack(enemy, target, skillRow, turnNumber) {
  updateEnemyRuntime((runtime) => {
    runtime.lastActionTurnByEnemyId[text(enemy.id)] = turnNumber;
    return runtime;
  }, "enemy-action-start");
  const resolved = window.executeV39EnemyCombatAction?.({ enemyId:text(enemy.id), targetUnitId:text(target.id), skillRow }) === true;
  if (resolved) setEnemyCooldown(enemy.id, skillRow, turnNumber);
  return resolved;
}

function resolvePending(turnNumber) {
  const state = enemyTurnState();
  for (const pending of Object.values(state?.enemyCombatRuntime?.pendingActionsByEnemyId || {})) {
    if (remainingV39Turns(pending?.resolvesAtTurn, turnNumber) > 0) continue;
    const resolved = window.executeV39EnemyCombatAction?.({
      enemyId:text(pending.enemyId), targetUnitId:text(pending.targetUnitId), skillRow:pending.skillRow, apPaid:true
    }) === true;
    updateEnemyRuntime((runtime) => {
      delete runtime.pendingActionsByEnemyId[text(pending.enemyId)];
      runtime.lastActionTurnByEnemyId[text(pending.enemyId)] = turnNumber;
      const cooldown = parseV39TurnCount(pending?.skillRow?.CT);
      if (resolved && cooldown > 0) runtime.cooldownsByEnemyId[text(pending.enemyId)] = {
        ...(runtime.cooldownsByEnemyId[text(pending.enemyId)] || {}),
        [text(pending.skillName)]:resolveV39DeadlineTurn(turnNumber, cooldown)
      };
      return runtime;
    }, resolved ? "enemy-cast-resolved" : "enemy-cast-cancelled");
    window.dispatchEvent(new CustomEvent("v39:cast-ended", { detail:{ unitId:text(pending.enemyId), enemyAction:true, reason:resolved ? "resolved" : "cancelled" } }));
    return true;
  }
  return false;
}

function waitEnemy(state, enemyId, turnNumber, reason = "enemy-action-wait") {
  const runtime = {
    ...(state.enemyCombatRuntime || {}),
    lastActionTurnByEnemyId:{ ...(state.enemyCombatRuntime?.lastActionTurnByEnemyId || {}), [text(enemyId)]:turnNumber }
  };
  patchEnemyTurnState({ enemyCombatRuntime:runtime }, reason);
  return true;
}

function runFleeBehavior(state, enemy, targets, turnNumber) {
  const hpRate = number(enemy?.hp, enemy?.currentHp) / Math.max(1, number(enemy?.maxHp, enemy?.status?.HP || 1));
  const nest = nestFor(state, enemy);
  const active = enemy?.fleeState?.active === true;
  if (nest) {
    const threshold = enemy?.aggressive === true ? 0.3 : 0.55;
    if (!active && hpRate > threshold) return null;
    if (distance(enemy, nest) <= 1) {
      if (active) patchEnemyBehavior(state, enemy.id, { fleeState:null }, "enemy-flee-ended-at-nest");
      return active ? markEnemyTurnAction(enemy.id, turnNumber, "enemy-flee-ended-at-nest-turn") : null;
    }
    const patch = { fleeState:{ active:true, type:"nest", startedAtTurn:integer(state?.timeline?.turnNumber, 1) } };
    return moveEnemyToward(state, enemy, nest, turnNumber, 1, patch) || waitEnemy(state, enemy.id, turnNumber, "enemy-flee-blocked");
  }
  if (!active && (hpRate > 0.3 || enemy?.fleeDecisionMade === true)) return null;
  if (!active) {
    const target = [...targets].sort((a, b) => distance(enemy, a)-distance(enemy, b))[0] || null;
    const flee = deterministicRatio(`${text(enemy.id)}:flee`) < 0.3;
    patchEnemyBehavior(state, enemy.id, {
      fleeDecisionMade:true,
      fleeState:flee && target ? { active:true, type:"open", targetUnitId:text(target.id), extraMoveRemaining:1 } : null
    }, "enemy-flee-decided");
    return markEnemyTurnAction(enemy.id, turnNumber, "enemy-flee-decision-turn");
  }
  const target = targets.find(row => text(row?.id) === text(enemy?.fleeState?.targetUnitId));
  if (!target) {
    patchEnemyBehavior(state, enemy.id, { fleeState:null }, "enemy-flee-ended-no-target");
    return markEnemyTurnAction(enemy.id, turnNumber, "enemy-flee-ended-no-target-turn");
  }
  if (distance(enemy, target) <= visionRadius(enemy)) {
    return moveEnemyAway(state, enemy, target, turnNumber, { fleeState:{ ...enemy.fleeState, extraMoveRemaining:1 } })
      || waitEnemy(state, enemy.id, turnNumber, "enemy-flee-blocked");
  }
  if (integer(enemy?.fleeState?.extraMoveRemaining) > 0) {
    return moveEnemyAway(state, enemy, target, turnNumber, { fleeState:{ ...enemy.fleeState, extraMoveRemaining:0 } })
      || waitEnemy(state, enemy.id, turnNumber, "enemy-flee-blocked");
  }
  patchEnemyBehavior(state, enemy.id, { fleeState:null }, "enemy-flee-ended");
  return markEnemyTurnAction(enemy.id, turnNumber, "enemy-flee-ended-turn");
}

function selectEnemyTarget(state, enemy, targets) {
  const nest = nestFor(state, enemy);
  const center = territoryCenter(enemy, nest);
  const limit = pursuitLimit(enemy, nest);
  const inPursuitArea = target => distance(target, center) <= limit;
  const defense = nest
    ? targets.filter(target => distance(target, nest) <= 1).sort((a, b) => distance(enemy, a)-distance(enemy, b))[0]
    : null;
  if (defense) return defense;
  const remembered = targets.find(target => text(target?.id) === text(enemy?.aggroTargetUnitId));
  if (remembered && inPursuitArea(remembered)) return remembered;
  const targetsByTile = new Map();
  for (const target of targets) {
    const key = coordKey(target?.x, target?.y);
    if (!targetsByTile.has(key)) targetsByTile.set(key, []);
    targetsByTile.get(key).push(target);
  }
  const enemyScout = resolveDetectionScoutValue(enemy);
  const visible = [];
  for (const group of targetsByTile.values()) {
    const targetDistance = distance(enemy, group[0]);
    const targetSense = resolveDetectionGroupSense(group);
    if (!isDetectedByScout({
      scout:enemyScout,
      stealth:targetSense.stealth,
      distance:targetDistance,
      inRange:targetDistance <= visionRadius(enemy)
    })) continue;
    visible.push(...group);
  }
  const candidates = enemy?.aggressive === true
    ? visible.filter(inPursuitArea)
    : visible.filter(target => distance(target, center) <= territoryRadius(enemy, nest));
  return candidates.sort((a, b) => distance(enemy, a)-distance(enemy, b))[0] || null;
}

function runEnemyAi(turnNumber = currentV39TurnNumber()) {
  if (resolvePending(turnNumber)) return true;
  const state = enemyTurnState();
  if (!state) return false;
  const targets = state.players.flatMap((player) => player?.factionState?.units || []).filter(isAlive);
  const orderedEnemies = state.enemies.filter(isAlive)
    .sort((left, right) => text(left?.id).localeCompare(text(right?.id), "ja", { numeric:true }));
  for (const enemy of orderedEnemies) {
    const id = text(enemy.id);
    if (state.enemyCombatRuntime?.pendingActionsByEnemyId?.[id]) continue;
    const lastActionTurn = integer(state.enemyCombatRuntime?.lastActionTurnByEnemyId?.[id]);
    if (lastActionTurn >= turnNumber) continue;
    const fleeHandled = runFleeBehavior(state, enemy, targets, turnNumber);
    if (fleeHandled !== null) return fleeHandled;
    const target = selectEnemyTarget(state, enemy, targets);
    if (!target) {
      const lootTarget = Object.keys(state.groundLootByTile || {})
        .map(key => {
          const [x, y] = key.split(",").map(Number);
          return { x, y, key, targetDistance:distance(enemy, { x, y }) };
        })
        .filter(row => Number.isFinite(row.x) && Number.isFinite(row.y) && row.targetDistance <= visionRadius(enemy))
        .sort((a, b) => a.targetDistance-b.targetDistance || a.key.localeCompare(b.key))[0];
      if (lootTarget?.targetDistance === 0) {
        if (window.recoverV39GroundLootForEnemy?.(id, lootTarget.key)?.ok) {
          updateEnemyRuntime((runtime) => {
            runtime.lastActionTurnByEnemyId[id] = turnNumber;
            return runtime;
          }, "enemy-ground-loot-recovered");
          return true;
        }
        return waitEnemy(enemyTurnState() || state, id, turnNumber, "enemy-ground-loot-recovery-failed");
      }
      if (lootTarget && moveEnemyToward(state, enemy, lootTarget, turnNumber, 0)) return true;
      const nest = nestFor(state, enemy);
      const center = territoryCenter(enemy, nest);
      if (distance(enemy, center) > territoryRadius(enemy, nest)) {
        if (moveEnemyToward(state, enemy, center, turnNumber, 0, { aggroTargetUnitId:"" })) return true;
      } else if (roamInsideTerritory(state, enemy, nest, turnNumber)) {
        return true;
      }
      return waitEnemy(state, id, turnNumber);
    }
    const cooldowns = state.enemyCombatRuntime?.cooldownsByEnemyId?.[id] || {};
    const candidates = resolveActionSkillRows(enemy).filter((skillRow) => {
      return !isV39SupportSkill(skillRow, enemy)
        && resolveAttackApCost(skillRow) <= number(enemy.ap)
        && resolveAttackRange(skillRow, enemy) >= distance(enemy, target)
        && remainingV39Turns(cooldowns[text(skillRow?.名前)], turnNumber) <= 0;
    });
    const skillRow = chooseDeterministically(candidates, id, turnNumber);
    if (!skillRow) {
      if (moveEnemyToward(state, enemy, target, turnNumber)) return true;
      waitEnemy(state, id, turnNumber);
      continue;
    }
    if (castTurns(skillRow) > 0) queueEnemyAttack(enemy, target, skillRow, turnNumber);
    else executeEnemyAttack(enemy, target, skillRow, turnNumber);
    return true;
  }
  return false;
}

function runEnemyTurn(turnNumber = currentV39TurnNumber()) {
  movedEnemyIdsThisTurn.clear();
  const actionLimit = Math.max(1, (enemyTurnState()?.enemies || []).filter(isAlive).length * 2);
  let steps = 0;
  while (steps < actionLimit && runEnemyAi(turnNumber)) steps += 1;
  const finalState = enemyTurnState();
  const unhandled = (finalState?.enemies || []).filter(enemy => isAlive(enemy)
    && !finalState?.enemyCombatRuntime?.pendingActionsByEnemyId?.[text(enemy.id)]
    && integer(finalState?.enemyCombatRuntime?.lastActionTurnByEnemyId?.[text(enemy.id)]) < turnNumber);
  if (unhandled.length) console.warn("[敵ターン] 未処理の敵が残りました", { ターン:turnNumber, 敵ID:unhandled.map(enemy => text(enemy.id)) });
  for (const enemyId of movedEnemyIdsThisTurn) {
    window.recoverV39GroundLootForEnemy?.(enemyId);
    window.depositV39EnemyCargo?.(enemyId);
  }
  return steps;
}

function installEnemyAggroTracking() {
  window.addEventListener("v39:attack-resolved", event => {
    const detail = event?.detail || {};
    if (detail.attackerSide !== "player") return;
    const targetIds = new Set((detail.entries || []).map(entry => text(entry?.targetId)).filter(Boolean));
    if (!targetIds.size) return;
    const state = window.getV39GameState?.();
    if (!state) return;
    let changed = false;
    const enemies = state.enemies.map(enemy => {
      if (!targetIds.has(text(enemy?.id))) return enemy;
      changed = true;
      return { ...enemy, aggroTargetUnitId:text(detail.attackerId) };
    });
    if (changed) window.setV39GameState?.({ enemies }, { reason:"enemy-attacked-aggro" });
  });
}

window.runV39EnemyAi = runEnemyAi;
window.runV39EnemyTurn = runEnemyTurn;
window.getV39EnemyAiRules = () => ({ actionsPerEnemyPerTurn:1, aggressiveFleeHpRate:0.3, passiveFleeHpRate:0.55, noNestFleeChance:0.3 });

installEnemyAggroTracking();
