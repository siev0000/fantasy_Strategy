import { isV39SupportSkill, resolveActionSkillRows, resolveAttackApCost, resolveAttackRange } from "./v39-combat-engine.js";
import { getHexDistance, getHexNeighborCoords } from "./hex-grid.js";
import { isDetectedByScout, resolveDetectionGroupSense, resolveDetectionScoutValue } from "./v39-detection-rules.js";
import { canUnitEnterV39Tile } from "./v39-terrain-traversal.js";
import { DEFAULT_MAGIC_CAST_TURNS, parseV39TurnCount, remainingV39Turns, resolveV39DeadlineTurn } from "./v39-turn-timing.js";
import { mergeV39EnemyExplorationInformation, normalizeV39EnemyExplorerState } from "./v39-enemy-exploration.js";
import { resolveV39EnemyFleeHpRate, V39_ENEMY_AI_CONFIG } from "./v39-enemy-ai-config.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const distance = getHexDistance;

export function isAliveEnemyAiUnit(unit) {
  return number(unit?.hp, unit?.currentHp) > 0 && text(unit?.state, "生存") !== "死亡";
}

function coordKey(x, y) {
  return `${integer(x)},${integer(y)}`;
}

function visionRadius(enemy) {
  return 1 + Math.floor(resolveDetectionScoutValue(enemy) / 75);
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

function nestFor(state, enemy) {
  return (state?.enemyNests || []).find(nest => text(nest?.id) === text(enemy?.nestId)) || null;
}

function territoryCenter(enemy, nest) {
  if (!nest) return { x:integer(enemy?.x), y:integer(enemy?.y) };
  return {
    x:integer(nest?.x, integer(enemy?.x)),
    y:integer(nest?.y, integer(enemy?.y))
  };
}

function territoryRadius(enemy, nest) {
  return nest ? Math.max(1, integer(nest?.territoryRadius, 1)) : 1;
}

function pursuitLimit(enemy, nest) {
  const outside = enemy?.aggressive === true
    ? Math.max(1, integer(enemy?.status?.移動, integer(enemy?.移動, integer(enemy?.movement, 1))))
    : 1;
  return territoryRadius(enemy, nest) + outside;
}

function castTurns(skillRow) {
  const wait = parseV39TurnCount(skillRow?.待機);
  return text(skillRow?.攻撃手段) === "魔法" ? Math.max(DEFAULT_MAGIC_CAST_TURNS, wait) : wait;
}

function nestsAreCompeting(state, attacker, target) {
  const attackerNest = nestFor(state, attacker);
  const targetNest = nestFor(state, target);
  if (!attackerNest || !targetNest || text(attackerNest.id) === text(targetNest.id)) return false;
  return distance(attackerNest, targetNest) <= territoryRadius(attacker, attackerNest) + territoryRadius(target, targetNest);
}

function targetsFor(state, enemy = null) {
  const players = (state?.players || []).flatMap(player => player?.factionState?.units || []).filter(isAliveEnemyAiUnit);
  if (!enemy) return players;
  const competingEnemies = (state?.enemies || []).filter(target => text(target?.id) !== text(enemy?.id)
    && isAliveEnemyAiUnit(target)
    && nestsAreCompeting(state, enemy, target));
  return [...players, ...competingEnemies];
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
  const canRetaliate = enemy?.aggressive === true || V39_ENEMY_AI_CONFIG.passiveRetaliatesWhenAttacked;
  const remembered = canRetaliate
    ? targets.find(target => text(target?.id) === text(enemy?.aggroTargetUnitId))
    : null;
  if (remembered && inPursuitArea(remembered)) return remembered;
  if (enemy?.aggressive !== true && !nest) return null;
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

function availableEnemyMoves(state, mapData, enemy) {
  if (!mapData?.grid) return [];
  const occupied = new Set([
    ...(state.enemies || []).filter(row => text(row.id) !== text(enemy.id) && isAliveEnemyAiUnit(row)),
    ...(state.players || []).flatMap(player => player?.factionState?.units || []).filter(isAliveEnemyAiUnit),
    ...(state.settlements || [])
  ].map(row => coordKey(row.x, row.y)));
  return getHexNeighborCoords(mapData.w, mapData.h, enemy?.x, enemy?.y, mapData?.worldWrapEnabled !== false)
    .filter(tile => !occupied.has(tile.key))
    .map(tile => ({ ...tile, cost:enemyMoveStepCost(mapData, enemy, tile) }))
    .filter(tile => Number.isFinite(tile.cost) && tile.cost <= number(enemy.ap));
}

function movePlan(state, mapData, enemy, target, turnNumber, mode, stopDistance = 1, enemyPatch = {}) {
  const currentDistance = distance(enemy, target);
  if (mode === "toward" && currentDistance <= stopDistance) return null;
  const candidates = availableEnemyMoves(state, mapData, enemy)
    .map(tile => ({ ...tile, targetDistance:distance(tile, target) }))
    .filter(tile => mode === "away" ? tile.targetDistance > currentDistance : tile.targetDistance < currentDistance)
    .sort((a, b) => mode === "away"
      ? b.targetDistance-a.targetDistance || a.cost-b.cost || a.key.localeCompare(b.key)
      : a.targetDistance-b.targetDistance || a.cost-b.cost || a.key.localeCompare(b.key));
  const next = candidates[0];
  if (!next) return null;
  return {
    type:"move", enemyId:text(enemy.id), turnNumber,
    from:{ x:integer(enemy.x), y:integer(enemy.y) },
    to:{ x:next.x, y:next.y }, cost:next.cost, enemyPatch
  };
}

function waitPlan(enemy, turnNumber, enemyPatch = {}) {
  return { type:"wait", enemyId:text(enemy.id), turnNumber, enemyPatch };
}

function lootTargetFor(state, enemy) {
  return Object.keys(state.groundLootByTile || {})
    .map(key => {
      const [x, y] = key.split(",").map(Number);
      return { x, y, key, targetDistance:distance(enemy, { x, y }) };
    })
    .filter(row => Number.isFinite(row.x) && Number.isFinite(row.y) && row.targetDistance <= visionRadius(enemy))
    .sort((a, b) => a.targetDistance-b.targetDistance || a.key.localeCompare(b.key))[0] || null;
}

function terrainLabel(tile) {
  if (tile && typeof tile === "object") return text(tile.name || tile.type || tile.terrain || tile.key, "不明");
  return text(tile, "不明");
}

function groundFoodNames(state, enemy, tileKey) {
  const cargo = state?.groundLootByTile?.[tileKey]?.cargo || state?.groundLootByTile?.[tileKey];
  const foodKeys = new Set(enemy?.foodResourceKeys || state?.foodResourceKeys || []);
  return Object.entries(cargo?.resourcesByType || {})
    .filter(([name, amount]) => foodKeys.has(text(name)) && number(amount) > 0)
    .map(([name]) => text(name));
}

function factionFoodNames(state, enemy, ownerId) {
  const player = (state?.players || []).find(row => text(row?.id) === text(ownerId));
  if (!player) return [];
  const foodKeys = new Set(enemy?.foodResourceKeys || state?.foodResourceKeys || []);
  const names = new Set();
  for (const settlement of player?.factionState?.settlements || []) {
    for (const [name, amount] of Object.entries(settlement?.foodStockByType || {})) {
      if (foodKeys.has(text(name)) && number(amount) > 0) names.add(text(name));
    }
  }
  return [...names];
}

function observeForExplorer(state, mapData, enemy, turnNumber) {
  const current = normalizeV39EnemyExplorerState(enemy?.explorationState);
  if (!current.active) return null;
  const radius = visionRadius(enemy);
  const terrainByTile = {};
  const territoryByTile = {};
  const foodCandidatesByTile = {};
  const visitedTileKeys = [];
  for (let y = 0; y < integer(mapData?.h); y += 1) for (let x = 0; x < integer(mapData?.w); x += 1) {
    if (distance(enemy, { x, y }) > radius) continue;
    const key = coordKey(x, y);
    visitedTileKeys.push(key);
    terrainByTile[key] = terrainLabel(mapData?.grid?.[y]?.[x]);
    const ownerId = text(state?.territoryOwnerByTile?.[key]);
    if (ownerId) territoryByTile[key] = ownerId;
    const foodNames = groundFoodNames(state, enemy, key);
    if (foodNames.length) foodCandidatesByTile[key] = { type:"ground-food", foodNames };
    const territoryFoodNames = factionFoodNames(state, enemy, ownerId);
    if (ownerId && territoryFoodNames.length) foodCandidatesByTile[key] = { type:"food-territory", ownerId, foodNames:territoryFoodNames };
  }
  const visibleSettlements = (state?.settlements || []).filter(row => distance(enemy, row) <= radius);
  const visibleNests = (state?.enemyNests || []).filter(row => text(row?.id) !== text(enemy?.nestId) && distance(enemy, row) <= radius);
  const nearbyUnits = [
    ...(state?.enemies || []).filter(row => text(row?.id) !== text(enemy?.id)),
    ...targetsFor(state)
  ].filter(row => isAliveEnemyAiUnit(row) && distance(enemy, row) <= radius);
  const unitsByTile = new Map();
  for (const unit of nearbyUnits) {
    const key = coordKey(unit?.x, unit?.y);
    if (!unitsByTile.has(key)) unitsByTile.set(key, []);
    unitsByTile.get(key).push(unit);
  }
  const visibleUnits = [];
  for (const group of unitsByTile.values()) {
    const targetSense = resolveDetectionGroupSense(group);
    if (isDetectedByScout({
      scout:resolveDetectionScoutValue(enemy),
      stealth:targetSense.stealth,
      distance:distance(enemy, group[0]),
      inRange:true
    })) visibleUnits.push(...group);
  }
  const enemyIds = new Set((state?.enemies || []).map(row => text(row?.id)));
  for (const row of visibleUnits.filter(row => enemyIds.has(text(row?.id)) && text(row?.nestId) !== text(enemy?.nestId))) {
    const key = coordKey(row?.x, row?.y);
    foodCandidatesByTile[key] ||= { type:"creature", unitIds:[] };
    foodCandidatesByTile[key].unitIds = [...new Set([...(foodCandidatesByTile[key].unitIds || []), text(row?.id)].filter(Boolean))];
  }
  const information = mergeV39EnemyExplorationInformation(current.information, {
    terrainByTile,
    territoryByTile,
    settlementIds:visibleSettlements.map(row => text(row?.id || row?.settlementId)),
    nestIds:visibleNests.map(row => text(row?.id)),
    unitIds:visibleUnits.map(row => text(row?.id)),
    foodCandidatesByTile,
    visitedTileKeys
  });
  return {
    ...current,
    mode:current.mode !== "raid" && Object.keys(information.foodCandidatesByTile).length ? "return" : current.mode,
    maxDistance:Math.max(current.maxDistance, distance(enemy, nestFor(state, enemy) || enemy)),
    information,
    lastObservedTurn:integer(turnNumber)
  };
}

function explorerMovePlan(state, mapData, enemy, nest, turnNumber, explorerState) {
  if (!nest || !explorerState?.active) return null;
  if (explorerState.mode === "raid") {
    const [targetX, targetY] = text(explorerState.targetTileKey).split(",").map(Number);
    const target = { x:targetX, y:targetY };
    const territory = state?.territoryStateByTile?.[explorerState.targetTileKey];
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)
      || !text(state?.territoryOwnerByTile?.[explorerState.targetTileKey])
      || territory?.raided === true) {
      return waitPlan(enemy, turnNumber, { explorationState:{ ...explorerState, mode:"search", targetTileKey:"" } });
    }
    if (distance(enemy, target) === 0) {
      const skillRows = resolveActionSkillRows(enemy).filter(row => !isV39SupportSkill(row, enemy) && resolveAttackApCost(row) <= number(enemy?.ap));
      const skillRow = chooseDeterministically(skillRows, enemy.id, turnNumber);
      return skillRow
        ? { type:"attack-territory", enemyId:text(enemy.id), turnNumber, tileKey:explorerState.targetTileKey, skillRow, skillName:text(skillRow?.名前), requiresSync:true, enemyPatch:{ explorationState:explorerState } }
        : waitPlan(enemy, turnNumber, { explorationState:explorerState });
    }
    return movePlan(state, mapData, enemy, target, turnNumber, "toward", 0, { explorationState:explorerState })
      || waitPlan(enemy, turnNumber, { explorationState:explorerState });
  }
  if (explorerState.mode === "return") {
    if (distance(enemy, nest) === 0) return waitPlan(enemy, turnNumber, { explorationState:explorerState });
    return movePlan(state, mapData, enemy, nest, turnNumber, "toward", 0, { explorationState:explorerState })
      || waitPlan(enemy, turnNumber, { explorationState:explorerState });
  }
  const visited = new Set(explorerState.information?.visitedTileKeys || []);
  const candidates = availableEnemyMoves(state, mapData, enemy)
    .filter(tile => distance(tile, nest) <= explorerState.searchRadius)
    .map(tile => ({ ...tile, nestDistance:distance(tile, nest), visited:visited.has(tile.key) }))
    .sort((left, right) => Number(left.visited)-Number(right.visited)
      || right.nestDistance-left.nestDistance
      || left.cost-right.cost
      || left.key.localeCompare(right.key));
  const next = chooseDeterministically(candidates.filter(row => row.visited === candidates[0]?.visited && row.nestDistance === candidates[0]?.nestDistance), enemy.id, turnNumber)
    || candidates[0];
  if (!next) return waitPlan(enemy, turnNumber, { explorationState:explorerState });
  return {
    type:"move", enemyId:text(enemy.id), turnNumber,
    from:{ x:integer(enemy.x), y:integer(enemy.y) }, to:{ x:next.x, y:next.y }, cost:next.cost,
    enemyPatch:{ explorationState:explorerState }
  };
}

function attackSkillsFor(state, enemy, target, turnNumber) {
  const cooldowns = state.enemyCombatRuntime?.cooldownsByEnemyId?.[text(enemy.id)] || {};
  const targetDistance = distance(enemy, target);
  return resolveActionSkillRows(enemy).filter(skillRow => !isV39SupportSkill(skillRow, enemy)
    && resolveAttackApCost(skillRow) <= number(enemy.ap)
    && resolveAttackRange(skillRow, enemy) >= targetDistance
    && remainingV39Turns(cooldowns[text(skillRow?.名前)], turnNumber) <= 0);
}

export function inspectEnemyAiState(state, enemyId, turnNumber) {
  const enemy = (state?.enemies || []).find(row => text(row?.id) === text(enemyId));
  if (!state || !enemy) return null;
  const nest = nestFor(state, enemy);
  const center = territoryCenter(enemy, nest);
  const radius = territoryRadius(enemy, nest);
  const limit = pursuitLimit(enemy, nest);
  const targets = targetsFor(state, enemy);
  const target = selectEnemyTarget(state, enemy, targets);
  const hp = Math.max(0, number(enemy?.hp, enemy?.currentHp));
  const maxHp = Math.max(1, number(enemy?.maxHp, enemy?.status?.HP || 1));
  const hpRate = hp / maxHp;
  const fleeThreshold = resolveV39EnemyFleeHpRate(enemy);
  const runtime = state.enemyCombatRuntime || {};
  const pending = runtime.pendingActionsByEnemyId?.[text(enemy.id)] || null;
  const cooldowns = runtime.cooldownsByEnemyId?.[text(enemy.id)] || {};
  const lastActionTurn = integer(runtime.lastActionTurnByEnemyId?.[text(enemy.id)]);
  const targetDistance = target ? distance(enemy, target) : null;
  const attackSkills = target ? attackSkillsFor(state, enemy, target, turnNumber) : [];
  const lootTarget = lootTargetFor(state, enemy);
  const explorer = normalizeV39EnemyExplorerState(enemy?.explorationState);
  let decision = "待機";
  let reason = "索敵対象、回収対象、帰還条件がありません";
  if (!isAliveEnemyAiUnit(enemy)) { decision="死亡"; reason="HPが0または死亡状態です"; }
  else if (pending) { decision=`発動待機: ${text(pending.skillName, "名称未設定")}`; reason=`残り${remainingV39Turns(pending.resolvesAtTurn, turnNumber)}ターン`; }
  else if (lastActionTurn >= turnNumber) { decision="行動済み"; reason=`ターン${lastActionTurn}の行動を完了しています`; }
  else if (enemy?.fleeState?.active === true) { decision=nest ? "巣へ逃走" : "敵対対象から逃走"; reason=`HP率${Math.round(hpRate*100)}% / 逃走基準${Math.round(fleeThreshold*100)}%`; }
  else if (nest && hpRate <= fleeThreshold && distance(enemy, nest) > 1) { decision="巣へ逃走予定"; reason=`HP率が逃走基準${Math.round(fleeThreshold*100)}%以下です`; }
  else if (!nest && hpRate <= fleeThreshold && enemy?.fleeDecisionMade !== true) { decision="逃走予定"; reason=`HP率が逃走基準${Math.round(fleeThreshold*100)}%以下です`; }
  else if (target && attackSkills.length) { decision=`攻撃: ${text(chooseDeterministically(attackSkills, enemy.id, turnNumber)?.名前, "攻撃")}`; reason=`${text(target.name, target.id)}が射程内、AP・CT条件を満たします`; }
  else if (target) { decision=targetDistance > 1 ? "標的へ追跡" : "攻撃できず待機"; reason=`${text(target.name, target.id)}を認識中ですが、射程・AP・CTを満たす行動Aがありません`; }
  else if (lootTarget) { decision=lootTarget.targetDistance === 0 ? "地上物資を回収" : "地上物資へ移動"; reason=`索敵内の残留品 ${lootTarget.key} を確認しています`; }
  else if (explorer.active && explorer.mode === "raid") { decision="食料領土を襲撃"; reason=`報告済みの食料候補 ${explorer.targetTileKey} へ向かいます`; }
  else if (explorer.active && explorer.mode === "return") { decision="探索報告のため帰還"; reason="食料候補の発見または食料不足解消により所属巣へ戻ります"; }
  else if (explorer.active) { decision="食料探索"; reason=`縄張り中心から最大${explorer.searchRadius}マスを探索します`; }
  else if (distance(enemy, center) > radius) { decision="縄張りへ帰還"; reason=`縄張り中心から${distance(enemy, center)}マス、縄張り半径${radius}です`; }
  else { decision="縄張り内を徘徊"; reason="攻撃・逃走・回収・帰還の優先条件がありません"; }
  return {
    enemyId:text(enemy.id), name:text(enemy.name, enemy.id), level:integer(enemy.level, 1),
    x:integer(enemy.x), y:integer(enemy.y), hp, maxHp, hpRate, ap:number(enemy.ap), maxAp:number(enemy.maxAp, 100),
    aggressive:enemy?.aggressive === true,
    retaliating:enemy?.aggressive !== true
      && V39_ENEMY_AI_CONFIG.passiveRetaliatesWhenAttacked
      && !!text(enemy?.aggroTargetUnitId),
    decision, reason,
    visionRadius:visionRadius(enemy), scout:resolveDetectionScoutValue(enemy),
    targetId:text(target?.id), targetName:text(target?.name, target?.id), targetDistance,
    aggroTargetUnitId:text(enemy?.aggroTargetUnitId), attackSkillNames:attackSkills.map(row => text(row?.名前)).filter(Boolean),
    hasNest:!!nest, nestId:text(nest?.id), nestName:text(nest?.name, nest?.id), nestDistance:nest ? distance(enemy, nest) : null,
    territoryCenter:center, territoryRadius:radius, pursuitLimit:limit,
    fleeThreshold, fleeState:enemy?.fleeState || null, fleeDecisionMade:enemy?.fleeDecisionMade === true,
    lastActionTurn, pendingSkillName:text(pending?.skillName), pendingTurns:pending ? remainingV39Turns(pending.resolvesAtTurn, turnNumber) : 0,
    cooldowns:Object.fromEntries(Object.entries(cooldowns).map(([name, deadline]) => [name, remainingV39Turns(deadline, turnNumber)]).filter(([, turns]) => turns > 0))
  };
}

export function planNextEnemyAction(state, mapData, turnNumber) {
  const ordered = (state?.enemies || []).filter(isAliveEnemyAiUnit)
    .sort((left, right) => text(left?.id).localeCompare(text(right?.id), "ja", { numeric:true }));
  const enemy = ordered.find(row => {
    const id = text(row?.id);
    return !state.enemyCombatRuntime?.pendingActionsByEnemyId?.[id]
      && integer(state.enemyCombatRuntime?.lastActionTurnByEnemyId?.[id]) < turnNumber;
  });
  if (!enemy) return null;
  const id = text(enemy.id);
  const inspection = inspectEnemyAiState(state, id, turnNumber);
  const targets = targetsFor(state, enemy);
  const nest = nestFor(state, enemy);
  const hpRate = number(enemy?.hp, enemy?.currentHp) / Math.max(1, number(enemy?.maxHp, enemy?.status?.HP || 1));
  const activeFlee = enemy?.fleeState?.active === true;
  const observedExplorerState = observeForExplorer(state, mapData, enemy, turnNumber);
  let action = null;

  const fleeThreshold = resolveV39EnemyFleeHpRate(enemy);
  if (nest && (activeFlee || hpRate <= fleeThreshold)) {
    if (distance(enemy, nest) <= 1) {
      if (activeFlee) action = waitPlan(enemy, turnNumber, { fleeState:null });
    } else {
      action = movePlan(state, mapData, enemy, nest, turnNumber, "toward", 1, { fleeState:{ active:true, type:"nest", startedAtTurn:turnNumber } }) || waitPlan(enemy, turnNumber);
    }
  } else if (!nest && (activeFlee || hpRate <= fleeThreshold)) {
    if (!activeFlee) {
      const target = [...targets].sort((a, b) => distance(enemy, a)-distance(enemy, b))[0] || null;
      action = target
        ? movePlan(state, mapData, enemy, target, turnNumber, "away", 0, { fleeDecisionMade:true, fleeState:{ active:true, type:"open", targetUnitId:text(target.id), extraMoveRemaining:1 } })
          || waitPlan(enemy, turnNumber, { fleeDecisionMade:true, fleeState:{ active:true, type:"open", targetUnitId:text(target.id), extraMoveRemaining:1 } })
        : waitPlan(enemy, turnNumber, { fleeDecisionMade:true });
    } else {
      const target = targets.find(row => text(row?.id) === text(enemy?.fleeState?.targetUnitId));
      if (!target) action = waitPlan(enemy, turnNumber, { fleeState:null });
      else if (distance(enemy, target) <= visionRadius(enemy)) action = movePlan(state, mapData, enemy, target, turnNumber, "away", 0, { fleeState:{ ...enemy.fleeState, extraMoveRemaining:1 } }) || waitPlan(enemy, turnNumber);
      else if (integer(enemy?.fleeState?.extraMoveRemaining) > 0) action = movePlan(state, mapData, enemy, target, turnNumber, "away", 0, { fleeState:{ ...enemy.fleeState, extraMoveRemaining:0 } }) || waitPlan(enemy, turnNumber);
      else action = waitPlan(enemy, turnNumber, { fleeState:null });
    }
  }

  if (!action && nest && enemy?.cargoFull === true) {
    const returning = observedExplorerState
      ? { ...observedExplorerState, mode:"return" }
      : normalizeV39EnemyExplorerState({ active:true, mode:"return", nestId:text(nest.id) });
    action = distance(enemy, nest) === 0
      ? waitPlan(enemy, turnNumber, { explorationState:returning })
      : movePlan(state, mapData, enemy, nest, turnNumber, "toward", 0, { explorationState:returning }) || waitPlan(enemy, turnNumber, { explorationState:returning });
  }

  const target = action ? null : selectEnemyTarget(state, enemy, targets);
  if (!action && !target) {
    const loot = lootTargetFor(state, enemy);
    if (loot?.targetDistance === 0) action = { type:"recover-loot", enemyId:id, turnNumber, tileKey:loot.key, requiresSync:true };
    else if (loot) action = movePlan(state, mapData, enemy, loot, turnNumber, "toward", 0);
    if (!action && observedExplorerState) action = explorerMovePlan(state, mapData, enemy, nest, turnNumber, observedExplorerState);
    if (!action) {
      const center = territoryCenter(enemy, nest);
      if (distance(enemy, center) > territoryRadius(enemy, nest)) action = movePlan(state, mapData, enemy, center, turnNumber, "toward", 0, { aggroTargetUnitId:"" });
      else {
        const candidates = availableEnemyMoves(state, mapData, enemy)
          .filter(tile => distance(tile, center) <= territoryRadius(enemy, nest))
          .sort((a, b) => a.key.localeCompare(b.key));
        const next = chooseDeterministically(candidates, id, turnNumber);
        if (next) action = { type:"move", enemyId:id, turnNumber, from:{ x:integer(enemy.x), y:integer(enemy.y) }, to:{ x:next.x, y:next.y }, cost:next.cost, enemyPatch:{ fleeState:null } };
      }
    }
    if (!action) action = waitPlan(enemy, turnNumber);
  }

  if (observedExplorerState) {
    action.enemyPatch = { ...(action.enemyPatch || {}), explorationState:observedExplorerState };
  }

  if (!action && target) {
    const skillRow = chooseDeterministically(attackSkillsFor(state, enemy, target, turnNumber), id, turnNumber);
    if (!skillRow) action = movePlan(state, mapData, enemy, target, turnNumber, "toward") || waitPlan(enemy, turnNumber);
    else {
      const delay = castTurns(skillRow);
      action = delay > 0
        ? { type:"queue-attack", enemyId:id, targetUnitId:text(target.id), turnNumber, skillRow, skillName:text(skillRow?.名前), delay, apCost:resolveAttackApCost(skillRow) }
        : { type:"attack", enemyId:id, targetUnitId:text(target.id), turnNumber, skillRow, skillName:text(skillRow?.名前), requiresSync:true };
    }
  }

  const decisionByType = {
    move:inspection?.decision === "縄張り内を徘徊" ? "縄張り内を徘徊" : inspection?.decision,
    wait:"攻撃できず待機",
    "recover-loot":"地上物資を回収",
    "attack-territory":`領土攻撃: ${text(action?.skillName)}`,
    "queue-attack":`発動開始: ${text(action?.skillName)}`,
    attack:`攻撃: ${text(action?.skillName)}`
  };
  return { ...action, inspection, decision:text(decisionByType[action?.type], inspection?.decision), reason:text(inspection?.reason) };
}

export function applyEnemyPlanToSimulation(state, plan) {
  if (!state || !plan) return state;
  const id = text(plan.enemyId);
  const runtime = {
    ...(state.enemyCombatRuntime || {}),
    pendingActionsByEnemyId:{ ...(state.enemyCombatRuntime?.pendingActionsByEnemyId || {}) },
    lastActionTurnByEnemyId:{ ...(state.enemyCombatRuntime?.lastActionTurnByEnemyId || {}) },
    cooldownsByEnemyId:{ ...(state.enemyCombatRuntime?.cooldownsByEnemyId || {}) }
  };
  runtime.lastActionTurnByEnemyId[id] = plan.turnNumber;
  let enemies = state.enemies || [];
  if (plan.type === "move") {
    enemies = enemies.map(enemy => text(enemy?.id) === id ? {
      ...enemy, ...(plan.enemyPatch || {}), x:plan.to.x, y:plan.to.y,
      ap:Math.max(0, number(enemy.ap)-number(plan.cost)),
      currentAp:Math.max(0, number(enemy.ap)-number(plan.cost)),
      actionPoint:Math.max(0, number(enemy.ap)-number(plan.cost)),
      lastMovedTurn:plan.turnNumber
    } : enemy);
  } else if (plan.type === "wait") {
    enemies = enemies.map(enemy => text(enemy?.id) === id ? { ...enemy, ...(plan.enemyPatch || {}) } : enemy);
  } else if (plan.type === "queue-attack") {
    enemies = enemies.map(enemy => text(enemy?.id) === id ? {
      ...enemy, ...(plan.enemyPatch || {}),
      ap:Math.max(0, number(enemy.ap)-number(plan.apCost)),
      currentAp:Math.max(0, number(enemy.ap)-number(plan.apCost))
    } : enemy);
    runtime.pendingActionsByEnemyId[id] = {
      enemyId:id, targetUnitId:text(plan.targetUnitId), skillRow:plan.skillRow, skillName:text(plan.skillName),
      startedTurn:plan.turnNumber, resolvesAtTurn:resolveV39DeadlineTurn(plan.turnNumber, plan.delay), apCost:plan.apCost
    };
  }
  if (!["move", "wait", "queue-attack"].includes(plan.type) && plan.enemyPatch) {
    enemies = enemies.map(enemy => text(enemy?.id) === id ? { ...enemy, ...plan.enemyPatch } : enemy);
  }
  return { ...state, enemies, enemyCombatRuntime:runtime };
}
