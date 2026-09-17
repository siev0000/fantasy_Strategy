import {
  applyEnemyPlanToSimulation,
  inspectEnemyAiState,
  isAliveEnemyAiUnit,
  planNextEnemyAction
} from "./lib/v39-enemy-ai-planner.js";
import { currentV39TurnNumber, parseV39TurnCount, remainingV39Turns, resolveV39DeadlineTurn } from "./lib/v39-turn-timing.js";
import { FOOD_RESOURCE_KEYS, NORMAL_FOOD_RESOURCE_KEYS } from "./lib/v39-economy-rules.js";
import { prepareV39EnemyExploration } from "./lib/v39-enemy-exploration.js";
import { resolveV39ConsumableFoodKeys } from "./lib/v39-population-economy.js";
import { V39_ENEMY_AI_CONFIG } from "./lib/v39-enemy-ai-config.js";
import { resolveV39EnemySquadCargoStatus } from "./lib/v39-logistics-state.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const MAX_AI_LOGS_PER_FACTION = 200;
const WORKER_REPLY_TIMEOUT_MS = 120000;
const FALLBACK_YIELD_INTERVAL = 8;
const movedEnemyIdsThisTurn = new Set();

const enemyTurnState = () => window.getV39EnemyTurnState?.() || window.getV39GameState?.();
const nowMs = () => typeof performance?.now === "function" ? performance.now() : Date.now();

function patchEnemyTurnState(patch, reason) {
  if (window.patchV39EnemyTurnState?.(patch) === true) return;
  window.setV39GameState?.(patch, { reason, silent:true });
}

function setRuntimeAction(runtime, enemyId, turnNumber) {
  return {
    ...(runtime || {}),
    lastActionTurnByEnemyId:{ ...(runtime?.lastActionTurnByEnemyId || {}), [text(enemyId)]:turnNumber }
  };
}

function enemyAiFaction(state, enemy) {
  if (enemy?.isRebel === true) return {
    id:text(enemy?.rebelFactionId, `rebel:${text(enemy?.rebelPlayerId)}`),
    label:text(enemy?.rebelFactionLabel, "反乱軍"),
    type:"rebel",
    sourceId:text(enemy?.rebelSettlementId)
  };
  const nest = (state?.enemyNests || []).find(row => text(row?.id) === text(enemy?.nestId));
  if (nest) return {
    id:`nest:${text(nest.id)}`,
    label:`${text(nest.nestType, "敵の巣")} (${integer(nest.x)},${integer(nest.y)})`,
    type:"enemy-nest",
    sourceId:text(nest.id)
  };
  return { id:`enemy:${text(enemy?.id)}`, label:`巣なし: ${text(enemy?.name, enemy?.id)}`, type:"nestless-enemy", sourceId:text(enemy?.id) };
}

function appendEnemyAiDecisionLog(enemy, inspection, overrides = {}) {
  const state = enemyTurnState();
  if (!state || !enemy || !inspection) return null;
  const currentEnemy = (state.enemies || []).find(row => text(row?.id) === text(enemy?.id)) || enemy;
  const faction = enemyAiFaction(state, currentEnemy);
  const logsByFaction = { ...(state.enemyCombatRuntime?.decisionLogsByFactionId || {}) };
  const current = Array.isArray(logsByFaction[faction.id]) ? logsByFaction[faction.id] : [];
  const turn = currentV39TurnNumber();
  const entry = {
    id:`ai:${turn}:${text(enemy.id)}:${current.length + 1}`,
    turn,
    factionId:faction.id,
    factionLabel:faction.label,
    factionType:faction.type,
    sourceId:faction.sourceId,
    actorId:text(currentEnemy.id),
    actorName:text(currentEnemy.name, currentEnemy.id),
    decision:text(overrides.decision, inspection.decision),
    reason:text(overrides.reason, inspection.reason),
    targetId:text(inspection.targetId),
    targetName:text(inspection.targetName),
    x:integer(currentEnemy.x),
    y:integer(currentEnemy.y),
    detail:{ ...inspection, ...(overrides.detail || {}) }
  };
  logsByFaction[faction.id] = [...current, entry].slice(-MAX_AI_LOGS_PER_FACTION);
  patchEnemyTurnState({
    enemyCombatRuntime:{ ...(state.enemyCombatRuntime || {}), decisionLogsByFactionId:logsByFaction }
  }, "enemy-ai-decision-log");
  window.dispatchEvent(new CustomEvent("v39:ai-log-added", { detail:{ faction, entry } }));
  return entry;
}

function setEnemyCooldown(enemyId, skillRow, turnNumber) {
  const duration = parseV39TurnCount(skillRow?.CT);
  if (duration <= 0) return;
  const state = enemyTurnState();
  const runtime = state?.enemyCombatRuntime || {};
  patchEnemyTurnState({
    enemyCombatRuntime:{
      ...runtime,
      cooldownsByEnemyId:{
        ...(runtime.cooldownsByEnemyId || {}),
        [text(enemyId)]:{
          ...(runtime.cooldownsByEnemyId?.[text(enemyId)] || {}),
          [text(skillRow?.名前)]:resolveV39DeadlineTurn(turnNumber, duration)
        }
      }
    }
  }, "enemy-cooldown-start");
}

function captureEnemyAttack(plan, options = {}) {
  let resolvedDetail = null;
  const combatLogs = [];
  const previousSuppression = window.__v39SuppressCombatEffects === true;
  const listener = event => {
    if (event?.detail?.attackerSide === "enemy" && text(event?.detail?.attackerId) === text(plan.enemyId)) resolvedDetail = event.detail;
  };
  const logListener = event => {
    if (event?.detail?.entries?.length) combatLogs.push(event.detail);
  };
  window.addEventListener("v39:attack-resolved", listener);
  window.addEventListener("v39:combat-log", logListener);
  window.__v39SuppressCombatEffects = true;
  try {
    const resolved = window.executeV39EnemyCombatAction?.({
      enemyId:text(plan.enemyId), targetUnitId:text(plan.targetUnitId), skillRow:plan.skillRow,
      apPaid:options.apPaid === true, suppressEffect:true
    }) === true;
    return { resolved, detail:resolvedDetail, combatLogs };
  } finally {
    window.__v39SuppressCombatEffects = previousSuppression;
    window.removeEventListener("v39:attack-resolved", listener);
    window.removeEventListener("v39:combat-log", logListener);
  }
}

function applyEnemyPlan(plan, presentationEvents) {
  const before = enemyTurnState();
  const enemy = (before?.enemies || []).find(row => text(row?.id) === text(plan?.enemyId));
  if (!before || !enemy || !plan) return false;
  const id = text(enemy.id);

  if (["move", "wait", "queue-attack"].includes(plan.type)) {
    const simulated = applyEnemyPlanToSimulation(before, plan);
    patchEnemyTurnState({ enemies:simulated.enemies, enemyCombatRuntime:simulated.enemyCombatRuntime }, `enemy-action-${plan.type}`);
    if (plan.type === "move") {
      movedEnemyIdsThisTurn.add(id);
      presentationEvents.push({
        type:"move", enemyId:id, from:{ ...plan.from }, to:{ ...plan.to }, decision:plan.decision,
        combatApproach:!!text(plan.inspection?.targetId),
        visible:window.isV39TileInCurrentVision?.(plan.from.x, plan.from.y) === true
          || window.isV39TileInCurrentVision?.(plan.to.x, plan.to.y) === true
      });
    } else if (plan.type === "queue-attack") {
      window.dispatchEvent(new CustomEvent("v39:cast-started", { detail:{ unitId:id, enemyAction:true } }));
      window.dispatchEvent(new CustomEvent("v39:combat-log", {
        detail:{ summary:`${text(enemy.name)}：${text(plan.skillName)} 発動待機 ${plan.delay}ターン / AP-${plan.apCost}`, attackerId:id, skillName:text(plan.skillName), apCost:plan.apCost, entries:[], enemyAction:true }
      }));
    }
  } else if (plan.type === "recover-loot") {
    const recovered = window.recoverV39GroundLootForEnemy?.(id, plan.tileKey)?.ok === true;
    const state = enemyTurnState() || before;
    const enemies = plan.enemyPatch
      ? (state.enemies || []).map(row => text(row?.id) === id ? { ...row, ...plan.enemyPatch } : row)
      : state.enemies;
    patchEnemyTurnState({ enemies, enemyCombatRuntime:setRuntimeAction(state.enemyCombatRuntime, id, plan.turnNumber) }, recovered ? "enemy-ground-loot-recovered" : "enemy-ground-loot-recovery-failed");
  } else if (plan.type === "attack-territory") {
    const result = window.executeV39EnemyTerritoryRaid?.({
      enemyId:id,
      tileKey:plan.tileKey,
      skillRow:plan.skillRow,
      turnNumber:plan.turnNumber
    });
    const state = enemyTurnState() || before;
    const enemies = enemy?.territoryAssaultOnly === true
      ? (state.enemies || []).map(row => text(row?.id) === id ? { ...row, fleeState:null, fleeDecisionMade:true } : row)
      : state.enemies;
    patchEnemyTurnState({ enemies, enemyCombatRuntime:setRuntimeAction(state.enemyCombatRuntime, id, plan.turnNumber) }, result?.ok ? "enemy-territory-raid-action" : "enemy-territory-raid-failed");
    plan.decision = result?.completed ? "領土略奪完了" : result?.ok ? "領土を攻撃" : "領土攻撃失敗";
    plan.reason = result?.ok ? `${plan.tileKey} HP ${result.hpBefore} → ${result.hp}` : text(result?.reason, "領土を攻撃できませんでした");
  } else if (plan.type === "attack") {
    const enemies = plan.enemyPatch
      ? (before.enemies || []).map(row => text(row?.id) === id ? { ...row, ...plan.enemyPatch } : row)
      : before.enemies;
    patchEnemyTurnState({ enemies, enemyCombatRuntime:setRuntimeAction(before.enemyCombatRuntime, id, plan.turnNumber) }, "enemy-action-start");
    const result = captureEnemyAttack(plan);
    if (result.resolved) {
      setEnemyCooldown(id, plan.skillRow, plan.turnNumber);
      presentationEvents.push({
        type:"attack", attackerId:id, targetUnitId:text(plan.targetUnitId),
        from:{ x:integer(enemy.x), y:integer(enemy.y) }, target:result.detail?.target,
        skillName:text(plan.skillName), effectName:text(plan.skillRow?.アニメ, "斬撃"), skillRow:plan.skillRow,
        result:result.detail, combatLogs:result.combatLogs,
        visible:window.isV39TileInCurrentVision?.(result.detail?.target?.x, result.detail?.target?.y) === true
      });
    }
  } else return false;
  appendEnemyAiDecisionLog(enemy, plan.inspection, { decision:plan.decision, reason:plan.reason });
  return true;
}

function resolvePendingAction(turnNumber, presentationEvents) {
  const state = enemyTurnState();
  const pending = Object.values(state?.enemyCombatRuntime?.pendingActionsByEnemyId || {})
    .find(row => remainingV39Turns(row?.resolvesAtTurn, turnNumber) <= 0);
  if (!pending) return false;
  const enemy = state.enemies.find(row => text(row?.id) === text(pending.enemyId));
  const inspection = enemy ? inspectEnemyAiState(state, enemy.id, turnNumber) : null;
  const plan = { type:"attack", enemyId:text(pending.enemyId), targetUnitId:text(pending.targetUnitId), skillRow:pending.skillRow, skillName:text(pending.skillName), turnNumber, inspection };
  const result = captureEnemyAttack(plan, { apPaid:true });
  const latest = enemyTurnState() || state;
  const runtime = {
    ...(latest.enemyCombatRuntime || {}),
    pendingActionsByEnemyId:{ ...(latest.enemyCombatRuntime?.pendingActionsByEnemyId || {}) },
    lastActionTurnByEnemyId:{ ...(latest.enemyCombatRuntime?.lastActionTurnByEnemyId || {}), [text(pending.enemyId)]:turnNumber },
    cooldownsByEnemyId:{ ...(latest.enemyCombatRuntime?.cooldownsByEnemyId || {}) }
  };
  delete runtime.pendingActionsByEnemyId[text(pending.enemyId)];
  const cooldown = parseV39TurnCount(pending?.skillRow?.CT);
  if (result.resolved && cooldown > 0) runtime.cooldownsByEnemyId[text(pending.enemyId)] = {
    ...(runtime.cooldownsByEnemyId[text(pending.enemyId)] || {}),
    [text(pending.skillName)]:resolveV39DeadlineTurn(turnNumber, cooldown)
  };
  patchEnemyTurnState({ enemyCombatRuntime:runtime }, result.resolved ? "enemy-cast-resolved" : "enemy-cast-cancelled");
  window.dispatchEvent(new CustomEvent("v39:cast-ended", { detail:{ unitId:text(pending.enemyId), enemyAction:true, reason:result.resolved ? "resolved" : "cancelled" } }));
  if (result.resolved && enemy) presentationEvents.push({
    type:"attack", attackerId:text(enemy.id), targetUnitId:text(pending.targetUnitId), from:{ x:integer(enemy.x), y:integer(enemy.y) },
    target:result.detail?.target, skillName:text(pending.skillName), effectName:text(pending.skillRow?.アニメ, "斬撃"), skillRow:pending.skillRow, result:result.detail, combatLogs:result.combatLogs,
    visible:window.isV39TileInCurrentVision?.(result.detail?.target?.x, result.detail?.target?.y) === true
  });
  if (enemy && inspection) appendEnemyAiDecisionLog(enemy, inspection, {
    decision:result.resolved ? `発動完了: ${text(pending.skillName)}` : `発動中止: ${text(pending.skillName)}`,
    reason:result.resolved ? "待機ターンが終了したため攻撃を解決しました" : "対象または発動条件を満たせず中止しました"
  });
  return true;
}

function workerReply(worker, send) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => cleanup(new Error("敵AI Workerがタイムアウトしました")), WORKER_REPLY_TIMEOUT_MS);
    const onMessage = event => cleanup(null, event.data);
    const onError = event => cleanup(event.error || new Error(event.message || "敵AI Workerでエラーが発生しました"));
    const cleanup = (error, value) => {
      window.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (error) reject(error); else resolve(value);
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(send);
  });
}

function updateProgressMessage(messageId, processed, total, mode = "Worker") {
  const percent = total > 0 ? Math.min(100, Math.round(processed / total * 100)) : 100;
  window.updateV39SideRailMessage?.(messageId, { message:`敵AI計算 ${processed} / ${total} (${percent}%)`, meta:mode });
  window.dispatchEvent(new CustomEvent("v39:enemy-ai-progress", { detail:{ processed, total, percent, mode } }));
}

function compactTechnique(technique) {
  const row = technique?.source && typeof technique.source === "object" ? technique.source : technique;
  return row && typeof row === "object" ? { ...row } : row;
}

function compactEquipment(item) {
  return {
    name:item?.name,
    equipmentName:item?.equipmentName,
    slot:item?.slot,
    power:item?.power,
    range:item?.range,
    attackAp:item?.attackAp,
    magicAp:item?.magicAp,
    enchantAttackFields:item?.enchantAttackFields,
    source:item?.source && typeof item.source === "object" ? {
      装備名:item.source.装備名,
      威力:item.source.威力,
      攻撃AP:item.source.攻撃AP,
      魔法AP:item.source.魔法AP,
      射程:item.source.射程
    } : undefined
  };
}

function compactAiUnit(unit, enemySide = false) {
  const compact = {
    id:unit?.id,
    name:unit?.name,
    x:unit?.x,
    y:unit?.y,
    hp:unit?.hp,
    currentHp:unit?.currentHp,
    maxHp:unit?.maxHp,
    ap:unit?.ap,
    currentAp:unit?.currentAp,
    maxAp:unit?.maxAp,
    state:unit?.state,
    statusName:unit?.statusName,
    status:unit?.status,
    skillLevels:unit?.skillLevels,
    resistances:unit?.resistances,
    acquiredSkillNames:unit?.acquiredSkillNames,
    abilities:unit?.abilities,
    traits:unit?.traits,
    techniques:(Array.isArray(unit?.techniques) ? unit.techniques : []).map(compactTechnique),
    equipment:(Array.isArray(unit?.equipment) ? unit.equipment : []).map(compactEquipment)
  };
  if (!enemySide) return compact;
  return {
    ...compact,
    aggressive:unit?.aggressive,
    race:unit?.race,
    nestId:unit?.nestId,
    isRebel:unit?.isRebel,
    neverFlee:unit?.neverFlee,
    territoryAssaultOnly:unit?.territoryAssaultOnly,
    rebelPlayerId:unit?.rebelPlayerId,
    rebelSettlementId:unit?.rebelSettlementId,
    rebelFactionId:unit?.rebelFactionId,
    rebelFactionLabel:unit?.rebelFactionLabel,
    territoryCenterX:unit?.territoryCenterX,
    territoryCenterY:unit?.territoryCenterY,
    territoryRadius:unit?.territoryRadius,
    movement:unit?.movement,
    移動:unit?.移動,
    飛行:unit?.飛行,
    fleeDecisionMade:unit?.fleeDecisionMade,
    fleeState:unit?.fleeState,
    aggroTargetUnitId:unit?.aggroTargetUnitId,
    explorationState:unit?.explorationState,
    foodResourceKeys:resolveV39ConsumableFoodKeys(unit?.race, FOOD_RESOURCE_KEYS, NORMAL_FOOD_RESOURCE_KEYS)
  };
}

function buildWorkerState(state = enemyTurnState()) {
  const cargoFullEnemyIds = new Set((state?.enemySquads || []).filter(squad => resolveV39EnemySquadCargoStatus(state, squad).full)
    .flatMap(squad => squad?.unitIds || []).map(text).filter(Boolean));
  return {
    enemies:(state?.enemies || []).map(unit => ({ ...compactAiUnit(unit, true), cargoFull:cargoFullEnemyIds.has(text(unit?.id)) })),
    players:(state?.players || []).map(player => ({
      id:player?.id,
      factionState:{
        units:(player?.factionState?.units || []).map(unit => compactAiUnit(unit, false)),
        settlements:(player?.factionState?.settlements || []).map(row => ({ id:row?.id, settlementId:row?.settlementId, foodStockByType:row?.foodStockByType }))
      }
    })),
    settlements:(state?.settlements || []).map(row => ({ id:row?.id, x:row?.x, y:row?.y })),
    enemyNests:(state?.enemyNests || []).map(row => ({ id:row?.id, name:row?.name, nestType:row?.nestType, x:row?.x, y:row?.y, territoryRadius:row?.territoryRadius, foodShortage:row?.foodShortage, explorationState:row?.explorationState })),
    groundLootByTile:Object.fromEntries(Object.entries(state?.groundLootByTile || {}).map(([key, value]) => [key, value])),
    territoryOwnerByTile:{ ...(state?.territoryOwnerByTile || {}) },
    territoryStateByTile:{ ...(state?.territoryStateByTile || {}) },
    foodResourceKeys:[...FOOD_RESOURCE_KEYS],
    enemyCombatRuntime:{
      pendingActionsByEnemyId:{ ...(state?.enemyCombatRuntime?.pendingActionsByEnemyId || {}) },
      lastActionTurnByEnemyId:{ ...(state?.enemyCombatRuntime?.lastActionTurnByEnemyId || {}) },
      cooldownsByEnemyId:{ ...(state?.enemyCombatRuntime?.cooldownsByEnemyId || {}) }
    }
  };
}

function buildWorkerMapData(mapData = window.__v39FieldRuntime?.mapData) {
  return {
    w:mapData?.w,
    h:mapData?.h,
    worldWrapEnabled:mapData?.worldWrapEnabled,
    grid:mapData?.grid,
    specialMap:mapData?.specialMap,
    lavaMap:mapData?.lavaMap,
    heightLevelMap:mapData?.heightLevelMap
  };
}

async function runWorkerPlans(turnNumber, actionLimit, totalEnemies, presentationEvents, progressId) {
  const worker = new Worker(new URL("./workers/v39-enemy-ai-worker.js", import.meta.url), { type:"module" });
  let processed = 0;
  let workerCalculationMs = 0;
  let mainApplyMs = 0;
  try {
    const ready = await workerReply(worker, { type:"initialize", state:buildWorkerState(), mapData:buildWorkerMapData(), turnNumber });
    if (ready?.type !== "ready") throw new Error("敵AI Workerを初期化できませんでした");
    while (processed < actionLimit) {
      const reply = await workerReply(worker, { type:"next" });
      workerCalculationMs += number(reply?.calculationMs);
      if (reply?.type === "complete") break;
      if (reply?.type !== "action" || !reply.plan) throw new Error("敵AI Workerから不正な応答を受信しました");
      const applyStartedAt = nowMs();
      applyEnemyPlan(reply.plan, presentationEvents);
      mainApplyMs += nowMs() - applyStartedAt;
      processed = reply.processed;
      if (reply.plan.requiresSync) {
        const synced = await workerReply(worker, { type:"sync", state:buildWorkerState() });
        if (synced?.type !== "synced") throw new Error("敵AI Workerの状態同期に失敗しました");
      }
      if (processed === 1 || processed % 8 === 0) updateProgressMessage(progressId, processed, totalEnemies);
    }
    return { processed, workerCalculationMs, mainApplyMs, fallbackUsed:false };
  } finally {
    worker.terminate();
  }
}

const yieldToBrowser = () => new Promise(resolve => window.setTimeout(resolve, 0));

async function runFallbackPlans(turnNumber, actionLimit, totalEnemies, presentationEvents, progressId) {
  let processed = 0;
  let calculationMs = 0;
  let mainApplyMs = 0;
  while (processed < actionLimit) {
    const calculationStartedAt = nowMs();
    const plan = planNextEnemyAction(enemyTurnState(), window.__v39FieldRuntime?.mapData, turnNumber);
    calculationMs += nowMs() - calculationStartedAt;
    if (!plan) break;
    const applyStartedAt = nowMs();
    applyEnemyPlan(plan, presentationEvents);
    mainApplyMs += nowMs() - applyStartedAt;
    processed += 1;
    if (processed % FALLBACK_YIELD_INTERVAL === 0) {
      updateProgressMessage(progressId, processed, totalEnemies, "メインスレッド分割処理");
      await yieldToBrowser();
    }
  }
  return { processed, workerCalculationMs:calculationMs, mainApplyMs, fallbackUsed:true };
}

export async function runEnemyTurn(turnNumber = currentV39TurnNumber()) {
  movedEnemyIdsThisTurn.clear();
  const prepared = prepareV39EnemyExploration(enemyTurnState(), turnNumber);
  patchEnemyTurnState({ enemies:prepared.enemies, enemyNests:prepared.enemyNests }, "enemy-exploration-prepared");
  const presentationEvents = [];
  const aliveCount = (enemyTurnState()?.enemies || []).filter(isAliveEnemyAiUnit).length;
  const actionLimit = Math.max(1, aliveCount * 2);
  const progressId = window.pushV39SideRailMessage?.({ channel:"notification", title:`T${turnNumber} 敵AI`, message:`敵AI計算 0 / ${aliveCount} (0%)`, tone:"debug", turn:turnNumber });
  const totalStartedAt = nowMs();
  let pendingCount = 0;
  while (pendingCount < actionLimit && resolvePendingAction(turnNumber, presentationEvents)) pendingCount += 1;
  let metrics;
  try {
    if (typeof Worker !== "function") throw new Error("Web Workerを利用できません");
    metrics = await runWorkerPlans(turnNumber, actionLimit, aliveCount, presentationEvents, progressId);
  } catch (error) {
    console.error("[敵AI Worker] フォールバックへ切り替えます", error);
    window.pushV39Notification?.(`敵AI Workerを使用できないため分割処理へ切り替えました: ${error.message}`, { title:"敵AI", tone:"warn", turn:turnNumber });
    metrics = await runFallbackPlans(turnNumber, actionLimit, aliveCount, presentationEvents, progressId);
  }
  for (const enemyId of movedEnemyIdsThisTurn) {
    const state = enemyTurnState();
    const enemy = (state?.enemies || []).find(row => text(row?.id) === text(enemyId));
    const key = enemy ? `${integer(enemy.x)},${integer(enemy.y)}` : "";
    if (key && state?.groundLootByTile?.[key]) window.recoverV39GroundLootForEnemy?.(enemyId);
    const latest = enemyTurnState();
    const currentEnemy = (latest?.enemies || []).find(row => text(row?.id) === text(enemyId));
    const nest = (latest?.enemyNests || []).find(row => text(row?.id) === text(currentEnemy?.nestId));
    const squad = (latest?.enemySquads || []).find(row => (row?.unitIds || []).map(text).includes(text(enemyId)));
    const cargo = squad?.cargo || {};
    const hasCargo = Object.values(cargo.resourcesByType || {}).some(value => number(value) > 0)
      || (cargo.equipmentInventory || []).length > 0;
    if (hasCargo && nest && integer(currentEnemy?.x) === integer(nest.x) && integer(currentEnemy?.y) === integer(nest.y)) {
      window.depositV39EnemyCargo?.(enemyId);
    }
  }
  const finalState = enemyTurnState();
  const unhandled = (finalState?.enemies || []).filter(enemy => isAliveEnemyAiUnit(enemy)
    && !finalState?.enemyCombatRuntime?.pendingActionsByEnemyId?.[text(enemy.id)]
    && integer(finalState?.enemyCombatRuntime?.lastActionTurnByEnemyId?.[text(enemy.id)]) < turnNumber);
  if (unhandled.length) console.warn("[敵ターン] 未処理の敵が残りました", { ターン:turnNumber, 敵ID:unhandled.map(enemy => text(enemy.id)) });
  updateProgressMessage(progressId, metrics.processed, Math.max(aliveCount, metrics.processed), metrics.fallbackUsed ? "フォールバック完了" : "Worker完了");
  const presentedEventCount = number(await window.playV39EnemyTurnPresentation?.(presentationEvents));
  const profile = {
    turnNumber, aliveEnemies:aliveCount, playerTargets:(finalState?.players || []).flatMap(player => player?.factionState?.units || []).filter(isAliveEnemyAiUnit).length,
    actionLimit, aiPasses:metrics.processed + pendingCount, movedEnemies:movedEnemyIdsThisTurn.size,
    pendingActions:Object.keys(finalState?.enemyCombatRuntime?.pendingActionsByEnemyId || {}).length,
    workerCalculationMs:metrics.workerCalculationMs, mainApplyMs:metrics.mainApplyMs,
    workerTotalMs:Math.max(0, nowMs() - totalStartedAt), fallbackUsed:metrics.fallbackUsed,
    actionEventCount:presentationEvents.length,
    presentationEventCount:presentedEventCount
  };
  window.dispatchEvent(new CustomEvent("v39:enemy-ai-worker-performance", { detail:profile }));
  return profile;
}

function runEnemyAi(turnNumber = currentV39TurnNumber()) {
  if (resolvePendingAction(turnNumber, [])) return true;
  const plan = planNextEnemyAction(enemyTurnState(), window.__v39FieldRuntime?.mapData, turnNumber);
  return plan ? applyEnemyPlan(plan, []) : false;
}

function inspectEnemyAi(enemyId) {
  return inspectEnemyAiState(enemyTurnState(), enemyId, currentV39TurnNumber());
}

function installEnemyAggroTracking() {
  window.addEventListener("v39:attack-resolved", event => {
    const detail = event?.detail || {};
    if (!text(detail.attackerId)) return;
    const targetIds = new Set((detail.entries || []).filter(entry => entry?.friendly !== true).map(entry => text(entry?.targetId)).filter(Boolean));
    if (!targetIds.size) return;
    const state = window.getV39GameState?.();
    if (!state) return;
    let changed = false;
    const enemies = state.enemies.map(enemy => {
      if (!targetIds.has(text(enemy?.id))) return enemy;
      if (enemy?.aggressive !== true && !V39_ENEMY_AI_CONFIG.passiveRetaliatesWhenAttacked) return enemy;
      changed = true;
      return { ...enemy, aggroTargetUnitId:text(detail.attackerId) };
    });
    if (changed) window.setV39GameState?.({ enemies }, { reason:"enemy-attacked-aggro" });
  });
}

window.runV39EnemyAi = runEnemyAi;
window.runV39EnemyTurn = runEnemyTurn;
window.inspectV39EnemyAi = inspectEnemyAi;
window.getV39EnemyAiRules = () => ({ actionsPerEnemyPerTurn:1, ...V39_ENEMY_AI_CONFIG });

installEnemyAggroTracking();
