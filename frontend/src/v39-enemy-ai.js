import { isV39SupportSkill, resolveActionSkillRows, resolveAttackApCost, resolveAttackRange } from "./lib/v39-combat-engine.js";

const ENEMY_ATTACK_INTERVAL_MS = 12000;
let lastProcessedSecond = -1;

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));

function cube(x, y) {
  const q = integer(x) - ((integer(y) - (integer(y) & 1)) / 2);
  const r = integer(y);
  return { x:q, y:-q-r, z:r };
}

function distance(a, b) {
  const ac = cube(a?.x, a?.y);
  const bc = cube(b?.x, b?.y);
  return Math.max(Math.abs(ac.x-bc.x), Math.abs(ac.y-bc.y), Math.abs(ac.z-bc.z));
}

function isAlive(unit) {
  return number(unit?.hp, unit?.currentHp) > 0 && text(unit?.state, "生存") !== "死亡";
}

function visionRadius(enemy) {
  const search = Math.max(0, number(enemy?.status?.索敵 ?? enemy?.索敵));
  return 1 + Math.floor(search / 75);
}

function coordKey(x, y) {
  return `${integer(x)},${integer(y)}`;
}

function mapNeighbors(mapData, unit) {
  const y = integer(unit?.y);
  const deltas = y % 2 ? [[-1,0],[1,0],[0,-1],[1,-1],[0,1],[1,1]] : [[-1,0],[1,0],[-1,-1],[0,-1],[-1,1],[0,1]];
  const wrap = mapData?.worldWrapEnabled !== false;
  const result = [];
  const seen = new Set();
  for (const [dx, dy] of deltas) {
    let x = integer(unit?.x) + dx;
    let nextY = y + dy;
    if (wrap) {
      x = ((x % mapData.w) + mapData.w) % mapData.w;
      nextY = ((nextY % mapData.h) + mapData.h) % mapData.h;
    } else if (x < 0 || nextY < 0 || x >= mapData.w || nextY >= mapData.h) continue;
    const key = coordKey(x, nextY);
    if (!seen.has(key)) result.push({ x, y:nextY, key });
    seen.add(key);
  }
  return result;
}

function canCrossLava(unit) {
  const resistance = number(unit?.status?.炎耐性, number(unit?.resistances?.炎耐性));
  const abilities = [unit?.acquiredSkillNames, unit?.abilities, unit?.traits].flat().map(value => text(value));
  return resistance >= 100 || abilities.some(value => value.includes("耐熱"));
}

function enemyMoveStepCost(mapData, enemy, tile) {
  if (["海", "湖"].includes(text(mapData?.grid?.[tile.y]?.[tile.x]))) return Number.POSITIVE_INFINITY;
  if (mapData?.lavaMap?.[tile.y]?.[tile.x] && !canCrossLava(enemy)) return Number.POSITIVE_INFINITY;
  const fromHeight = number(mapData?.heightLevelMap?.[integer(enemy.y)]?.[integer(enemy.x)], Number.NaN);
  const toHeight = number(mapData?.heightLevelMap?.[tile.y]?.[tile.x], Number.NaN);
  const flight = Math.max(0, number(enemy?.status?.飛行, number(enemy?.飛行, number(enemy?.skillLevels?.飛行))));
  if (Number.isFinite(fromHeight) && Number.isFinite(toHeight) && Math.abs(toHeight-fromHeight) > 1 && flight <= 0) return Number.POSITIVE_INFINITY;
  const climb = Number.isFinite(fromHeight) && Number.isFinite(toHeight) ? Math.max(0, toHeight-fromHeight) : 0;
  const terrainCost = Math.max(0, 1 + climb*2 - Math.floor(flight/30));
  const movement = Math.max(1, integer(enemy?.status?.移動, integer(enemy?.移動, integer(enemy?.movement, 1))));
  return Math.max(0, Math.ceil(terrainCost * Math.max(1, number(enemy?.maxAp, 100)) / movement));
}

function moveEnemyToward(state, enemy, target, now) {
  const mapData = window.__v39FieldRuntime?.mapData;
  if (!mapData?.grid || distance(enemy, target) <= 1) return false;
  const occupied = new Set([
    ...(state.enemies || []).filter(row => text(row.id) !== text(enemy.id) && isAlive(row)),
    ...state.players.flatMap(player => player?.factionState?.units || []).filter(isAlive),
    ...(state.settlements || [])
  ].map(row => coordKey(row.x, row.y)));
  const options = mapNeighbors(mapData, enemy)
    .filter(tile => !occupied.has(tile.key))
    .map(tile => ({ ...tile, cost:enemyMoveStepCost(mapData, enemy, tile), targetDistance:distance(tile, target) }))
    .filter(tile => Number.isFinite(tile.cost) && tile.cost <= number(enemy.ap) && tile.targetDistance < distance(enemy, target))
    .sort((a, b) => a.targetDistance-b.targetDistance || a.cost-b.cost || a.key.localeCompare(b.key));
  const next = options[0];
  if (!next) return false;
  const ap = Math.max(0, number(enemy.ap)-next.cost);
  const enemies = state.enemies.map(row => text(row.id) !== text(enemy.id) ? row : { ...row, x:next.x, y:next.y, ap, currentAp:ap, actionPoint:ap });
  const runtime = {
    ...(state.enemyCombatRuntime || {}),
    lastActionAtMsByEnemyId:{ ...(state.enemyCombatRuntime?.lastActionAtMsByEnemyId || {}), [text(enemy.id)]:now }
  };
  window.setV39GameState?.({ enemies, enemyCombatRuntime:runtime }, { reason:"enemy-action-move" });
  window.dispatchEvent(new CustomEvent("v39:combat-log", {
    detail:{ summary:`${text(enemy.name)}：移動 (${integer(enemy.x)},${integer(enemy.y)})→(${next.x},${next.y}) / AP-${next.cost}`, attackerId:text(enemy.id), apCost:next.cost, enemyAction:true, entries:[] }
  }));
  return true;
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

function durationMs(value) {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return Math.max(0, number(match?.[0]) * 1000);
}

function castMs(skillRow) {
  const wait = durationMs(skillRow?.待機);
  return text(skillRow?.攻撃手段) === "魔法" ? Math.max(6000, wait) : wait;
}

function updateEnemyRuntime(mutator, reason) {
  const state = window.getV39GameState?.();
  if (!state) return null;
  const next = mutator({
    pendingActionsByEnemyId:{ ...(state.enemyCombatRuntime?.pendingActionsByEnemyId || {}) },
    lastActionAtMsByEnemyId:{ ...(state.enemyCombatRuntime?.lastActionAtMsByEnemyId || {}) },
    cooldownsByEnemyId:{ ...(state.enemyCombatRuntime?.cooldownsByEnemyId || {}) },
    activeEffectsByEnemyId:{ ...(state.enemyCombatRuntime?.activeEffectsByEnemyId || {}) }
  }, state);
  if (!next) return null;
  window.setV39GameState?.({ enemyCombatRuntime:next }, { reason });
  return next;
}

function queueEnemyAttack(enemy, target, skillRow, now) {
  const apCost = resolveAttackApCost(skillRow);
  const delay = castMs(skillRow);
  const state = window.getV39GameState?.();
  const enemies = state.enemies.map((row) => text(row.id) === text(enemy.id)
    ? { ...row, ap:Math.max(0, number(row.ap)-apCost), currentAp:Math.max(0, number(row.ap)-apCost) }
    : row);
  const runtime = {
    ...(state.enemyCombatRuntime || {}),
    pendingActionsByEnemyId:{
      ...(state.enemyCombatRuntime?.pendingActionsByEnemyId || {}),
      [text(enemy.id)]:{
        enemyId:text(enemy.id), targetUnitId:text(target.id), skillRow, skillName:text(skillRow?.名前),
        startedAtMs:now, resolvesAtMs:now+delay, apCost
      }
    },
    lastActionAtMsByEnemyId:{ ...(state.enemyCombatRuntime?.lastActionAtMsByEnemyId || {}), [text(enemy.id)]:now }
  };
  window.setV39GameState?.({ enemies, enemyCombatRuntime:runtime }, { reason:"enemy-cast-start" });
  window.dispatchEvent(new CustomEvent("v39:cast-started", { detail:{ unitId:text(enemy.id), enemyAction:true } }));
  window.dispatchEvent(new CustomEvent("v39:combat-log", {
    detail:{ summary:`${text(enemy.name)}：${text(skillRow?.名前)} 発動待機 ${Math.ceil(delay/1000)}秒 / AP-${apCost}`, attackerId:text(enemy.id), skillName:text(skillRow?.名前), apCost, entries:[], enemyAction:true }
  }));
}

function executeEnemyAttack(enemy, target, skillRow, now) {
  updateEnemyRuntime((runtime) => {
    runtime.lastActionAtMsByEnemyId[text(enemy.id)] = now;
    return runtime;
  }, "enemy-action-start");
  return window.executeV39EnemyCombatAction?.({ enemyId:text(enemy.id), targetUnitId:text(target.id), skillRow }) === true;
}

function resolvePending(now) {
  const state = window.getV39GameState?.();
  for (const pending of Object.values(state?.enemyCombatRuntime?.pendingActionsByEnemyId || {})) {
    if (number(pending?.resolvesAtMs) > now) continue;
    const resolved = window.executeV39EnemyCombatAction?.({
      enemyId:text(pending.enemyId), targetUnitId:text(pending.targetUnitId), skillRow:pending.skillRow, apPaid:true
    }) === true;
    updateEnemyRuntime((runtime) => {
      delete runtime.pendingActionsByEnemyId[text(pending.enemyId)];
      const cooldown = durationMs(pending?.skillRow?.CT);
      if (resolved && cooldown > 0) runtime.cooldownsByEnemyId[text(pending.enemyId)] = {
        ...(runtime.cooldownsByEnemyId[text(pending.enemyId)] || {}),
        [text(pending.skillName)]:now+cooldown
      };
      return runtime;
    }, resolved ? "enemy-cast-resolved" : "enemy-cast-cancelled");
    window.dispatchEvent(new CustomEvent("v39:cast-ended", { detail:{ unitId:text(pending.enemyId), enemyAction:true, reason:resolved ? "resolved" : "cancelled" } }));
    return true;
  }
  return false;
}

function runEnemyAi(now = number(window.getV39RuntimeTimeMs?.())) {
  if (resolvePending(now)) return true;
  const state = window.getV39GameState?.();
  if (!state) return false;
  const targets = state.players.flatMap((player) => player?.factionState?.units || []).filter(isAlive);
  for (const enemy of state.enemies.filter((row) => row?.aggressive === true && isAlive(row))) {
    const id = text(enemy.id);
    if (state.enemyCombatRuntime?.pendingActionsByEnemyId?.[id]) continue;
    const lastAction = number(state.enemyCombatRuntime?.lastActionAtMsByEnemyId?.[id]);
    if (now-lastAction < ENEMY_ATTACK_INTERVAL_MS) continue;
    const visibleTargets = targets.filter((target) => distance(enemy, target) <= visionRadius(enemy));
    if (!visibleTargets.length) continue;
    const target = visibleTargets.sort((a,b) => distance(enemy,a)-distance(enemy,b))[0];
    const cooldowns = state.enemyCombatRuntime?.cooldownsByEnemyId?.[id] || {};
    const candidates = resolveActionSkillRows(enemy).filter((skillRow) => {
      return !isV39SupportSkill(skillRow, enemy)
        && resolveAttackApCost(skillRow) <= number(enemy.ap)
        && resolveAttackRange(skillRow, enemy) >= distance(enemy, target)
        && number(cooldowns[text(skillRow?.名前)]) <= now;
    });
    const skillRow = chooseDeterministically(candidates, id, Math.floor(now/ENEMY_ATTACK_INTERVAL_MS));
    if (!skillRow) {
      if (moveEnemyToward(state, enemy, target, now)) return true;
      updateEnemyRuntime((runtime) => {
        runtime.lastActionAtMsByEnemyId[id] = now;
        return runtime;
      }, "enemy-action-wait");
      continue;
    }
    if (castMs(skillRow) > 0) queueEnemyAttack(enemy, target, skillRow, now);
    else executeEnemyAttack(enemy, target, skillRow, now);
    return true;
  }
  return false;
}

window.addEventListener("v39:runtime-tick", (event) => {
  const second = Math.floor(number(event?.detail?.elapsedMs)/1000);
  if (second === lastProcessedSecond) return;
  lastProcessedSecond = second;
  runEnemyAi(number(event?.detail?.elapsedMs));
});

window.runV39EnemyAi = runEnemyAi;
window.getV39EnemyAiRules = () => ({ attackIntervalMs:ENEMY_ATTACK_INTERVAL_MS });
