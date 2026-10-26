import balance from '../../../config/v39-npc-faction-ai.json';
import { getFactionSettlements } from './settlement-state.js';
import { resolvePopulationClassDefinition, resolveV39PopulationResourceUnitValue } from './v39-population-economy.js';
import { getHexDistance } from './hex-grid.js';
import { collectV39FactionVision } from './v39-faction-intelligence-rules.js';
import { canV39FactionAttack, hasV39ActiveTreaty, declareV39War } from './v39-diplomacy-rules.js';
import { chargeV39Negotiation, resolveV39NegotiationSkill, V39_NEGOTIATION_AP } from './v39-negotiation-rules.js';
import { replaceIncidentVillage } from './v39-village-incidents.js';
import { recoverV39GroundLootState } from './v39-ground-loot-recovery.js';
import { isV39UnitInsideSettlement } from './v39-transport-rules.js';
import { receiveV39VillageSacrifice } from './v39-village-sacrifice.js';

const n = value => Number(value) || 0;
const alive = unit => n(unit?.hp ?? unit?.currentHp) > 0 && unit.state !== '死亡';
const keyOf = unit => `${unit.x},${unit.y}`;
const surfaceUnits = player => (player.factionState?.units || []).filter(unit => alive(unit)
  && (unit.worldId || 'surface') === 'surface' && Number.isInteger(unit.x) && Number.isInteger(unit.y) && !unit.pendingWorldExit
  && !unit.tradeAssignment && !unit.transportAssignment && !unit.surveyTask && !player.factionState.aiState?.growthPlan?.busyIds?.includes(unit.id));

export function inspectV39NpcResourceNeeds(player, config = balance, {includeSatisfied=false}={}) {
  const patterns = config.resourcePatterns || {};
  const override = player.factionState?.aiState?.behaviorPatternId;
  const needs = [];
  for (const settlement of getFactionSettlements(player.factionState).filter(row => row.placed)) {
    for (const [race, population] of Object.entries(settlement.populationByRace || {})) {
      if (!(population > 0)) continue;
      const definition = resolvePopulationClassDefinition(race);
      const condition = definition?.増加条件;
      const assigned = override || config.racePatternIds?.[race] || config.racePatternIds?.[definition?.名前];
      const selected = assigned ? [assigned, patterns[assigned]] : Object.entries(patterns).find(([, pattern]) => pattern.condition === condition);
      if (!selected?.[1] || selected[1].condition !== condition || !selected[1].actions?.length) continue;
      const [patternId, pattern] = selected;
      const stock = n(settlement.foodStockByType?.[condition]);
      const required = Math.max(n(pattern.minimumStock),
        (n(settlement.populationGrowthByRace?.[race]?.lastRequiredGauge) - n(settlement.populationGrowthByRace?.[race]?.gauge)) / resolveV39PopulationResourceUnitValue(condition));
      if (stock >= required&&!includeSatisfied) continue;
      const existing = needs.find(row => row.settlementId === settlement.settlementId && row.resource === condition);
      if (existing) { existing.required = Math.max(existing.required, required); continue; }
      needs.push({ patternId, pattern, resource:condition, stock, required, settlementId:settlement.settlementId });
    }
  }
  return needs.sort((a, b) => (b.required - b.stock) - (a.required - a.stock));
}

function unitCargo(player, unit) {
  const squad = player.factionState.squads?.find(row => row.unitIds?.includes(unit.id) || row.id === unit.squadId);
  return squad?.cargoByUnitId?.[unit.id] || (squad?.id !== 'solo' ? squad?.cargo : null);
}

export function selectV39NpcResourceObjective(state, player, mapData, config = balance, turn = n(state.timeline?.turnNumber)) {
  if ((state.activeWorldId || 'surface') !== 'surface') return null;
  const units = surfaceUnits(player);
  if (!units.length) return null;
  // Finish carrying actual resources home even if a different base no longer needs them.
  for (const unit of units) {
    const cargo = unitCargo(player, unit);
    if (!['魂', '死体'].some(resource => n(cargo?.resourcesByType?.[resource]) > 0)) continue;
    const settlement = getFactionSettlements(player.factionState).filter(row => row.placed)
      .sort((a, b) => getHexDistance(unit, a) - getHexDistance(unit, b))[0];
    if (settlement) return { type:'resource-return', actorId:unit.id, targetName:settlement.name,
      settlementId:settlement.settlementId, targetTileKey:keyOf(settlement), x:settlement.x, y:settlement.y };
  }
  const receiptIds = new Set((player.factionState.sacrificeReceiptHistory || []).map(row => row.unitId));
  const supply = (state.neutralVillages || []).filter(row => !row.abandoned && row.sacrificeContract?.active
    && row.sacrificeContract.playerId === player.id && !row.hostilePlayerIds?.includes(player.id)
    && row.heldUnits?.some(entry => entry.unit?.id && entry.ownerPlayerId !== player.id
      && ['corpse','captive'].includes(entry.kind) && !receiptIds.has(entry.unit.id)))
    .sort((a, b) => Math.min(...units.map(unit => getHexDistance(unit, a))) - Math.min(...units.map(unit => getHexDistance(unit, b))))[0];
  if (supply) return { type:'resource-receive', targetVillageId:supply.id, targetName:supply.name,
    targetTileKey:keyOf(supply), x:supply.x, y:supply.y };
  const need = inspectV39NpcResourceNeeds(player, config)[0];
  if (!need) return null;
  const base = { resource:need.resource, patternId:need.patternId, settlementId:need.settlementId };
  const distance = target => Math.min(...units.map(unit => getHexDistance(unit, target)));
  let visible;
  for (const action of need.pattern.actions) {
    if (action === 'recover') {
      const loot = Object.entries(state.groundLootByTile || {}).filter(([, row]) =>
        row.discoveredByPlayerIds?.includes(player.id) && n(row.cargo?.resourcesByType?.[need.resource]) > 0)
        .map(([key]) => { const [x, y] = key.split(',').map(Number); return { key, x, y }; })
        .sort((a, b) => distance(a) - distance(b))[0];
      if (loot) return { ...base, type:'resource-recover', targetName:`${need.resource}の残留品`, targetTileKey:loot.key, x:loot.x, y:loot.y };
    }
    if (action === 'demand') {
      visible ||= collectV39FactionVision(state, player.id, mapData).visible;
      const village = (state.neutralVillages || []).filter(row => !row.abandoned && !row.vassalPlayerId
        && (!row.sacrificeContract?.active || row.sacrificeContract.playerId === player.id)
        && (visible.has(keyOf(row)) || row.contactedByPlayerIds?.includes(player.id))
        && !(row.hostilePlayerIds || []).includes(player.id)
        && !(row.sacrificeContract?.active && row.sacrificeContract.playerId === player.id)
        && turn >= n(row.npcSacrificeAttemptsByPlayerId?.[player.id]?.nextAttemptTurn))
        .sort((a, b) => distance(a) - distance(b))[0];
      if (village) return { ...base, type:'resource-demand', targetVillageId:village.id, targetName:village.name,
        targetTileKey:keyOf(village), x:village.x, y:village.y };
    }
    if (action === 'raid') {
      const target = Object.values(player.factionState.exploration?.discoveredFactionsByPlayerId || {})
        .filter(row => state.players.some(other => other.id === row.playerId && other.id !== player.id)
          && Number.isInteger(row.x) && Number.isInteger(row.y)
          && !hasV39ActiveTreaty(state, player.id, row.playerId, 'alliance')
          && !hasV39ActiveTreaty(state, player.id, row.playerId, 'nonAggression')
          && (canV39FactionAttack(state, player.id, row.playerId) || need.pattern.allowWar))
        .sort((a, b) => distance(a) - distance(b))[0];
      if (target) return { ...base, type:'foreign-faction', resourceRaid:true, targetPlayerId:target.playerId,
        targetTileKey:target.key, targetName:target.playerName, x:target.x, y:target.y };
    }
  }
  return { ...base, type:'resource-search', targetName:`${need.resource}の供給元を探索`, x:null, y:null };
}

export function executeV39NpcResourceObjective(state, playerId, objective, turn, random = Math.random, config = balance) {
  const player = state.players.find(row => row.id === playerId);
  if (!player || player.isPlayer !== false || (state.activeWorldId || 'surface') !== 'surface') return null;
  const units = surfaceUnits(player);
  if (objective.type === 'resource-receive') {
    const result = receiveV39VillageSacrifice(state, playerId, objective.targetVillageId, { aiTurn:true, turnNumber:turn });
    return result.ok ? { state:result.state, command:result.message } : null;
  }
  if (objective.type === 'resource-recover') {
    const actor = units.find(unit => keyOf(unit) === objective.targetTileKey);
    if (!actor) return null;
    const recovered = recoverV39GroundLootState(state, playerId, actor.id, objective.targetTileKey);
    return recovered.ok ? { state:recovered.state, command:`資源回収:${objective.resource}@${objective.targetTileKey}` } : null;
  }
  if (objective.resourceRaid) {
    if (canV39FactionAttack(state, playerId, objective.targetPlayerId)) return null;
    const next = declareV39War(state, playerId, objective.targetPlayerId, turn);
    return canV39FactionAttack(next, playerId, objective.targetPlayerId)
      ? { state:next, command:`資源確保の宣戦:${objective.resource} / ${objective.targetName}` } : null;
  }
  if (objective.type !== 'resource-demand') return null;
  const village = state.neutralVillages.find(row => row.id === objective.targetVillageId);
  const actor = village && units.filter(unit => getHexDistance(unit, village) <= 1
    && n(unit.ap ?? unit.currentAp) >= V39_NEGOTIATION_AP && unit.waitTurnNumber !== turn)
    .sort((a, b) => resolveV39NegotiationSkill(state, playerId, b, '威圧') - resolveV39NegotiationSkill(state, playerId, a, '威圧'))[0];
  if (!actor || village.abandoned || village.vassalPlayerId || village.sacrificeContract?.active
    || village.hostilePlayerIds?.includes(playerId)) return null;
  const attempt = village.npcSacrificeAttemptsByPlayerId?.[playerId];
  if (turn < n(attempt?.nextAttemptTurn)) return null;
  const charged = chargeV39Negotiation(state, playerId, actor.id, village.id, ['sacrifice', objective.resource], { aiTurn:true, turnNumber:turn });
  if (!charged.ok) return null;
  const rule = config.sacrificeDemand;
  const guards = (village.defenseUnits || []).filter(alive).reduce((sum, unit) => sum + n(unit.status?.攻撃), 0);
  const strength = units.filter(unit => getHexDistance(unit, village) <= 1).reduce((sum, unit) => sum + n(unit.status?.攻撃), 0);
  const chance = Math.max(rule.minimumChance, Math.min(rule.maximumChance, rule.baseChance
    + resolveV39NegotiationSkill(state, playerId, actor, '威圧') / rule.skillDivisor
    + Math.max(-rule.maximumStrengthBonus, Math.min(rule.maximumStrengthBonus, (strength - guards) / rule.strengthDivisor))));
  const accepted = random() < chance;
  const pattern = config.resourcePatterns[objective.patternId];
  const updated = { ...village,
    contactedByPlayerIds:[...new Set([...(village.contactedByPlayerIds || []), playerId])],
    relationsByPlayerId:{ ...village.relationsByPlayerId, [playerId]:Math.max(-100, n(village.relationsByPlayerId?.[playerId]) - rule.relationCost) },
    npcSacrificeAttemptsByPlayerId:{ ...village.npcSacrificeAttemptsByPlayerId,
      [playerId]:{ turn, accepted, resource:objective.resource, nextAttemptTurn:turn + Math.max(1, n(pattern.demandCooldownTurns)) } },
    ...(accepted ? { sacrificeContract:{ active:true, playerId, alliedPlayerIds:[], resource:objective.resource, createdTurn:turn } } : {}) };
  return { state:replaceIncidentVillage(charged.state, updated), command:`生贄要求:${village.name} / ${accepted ? '供給契約成立' : '拒否'} / AP消費` };
}

export function isV39NpcResourceReturnComplete(player, objective) {
  const unit = player.factionState.units.find(row => row.id === objective.actorId);
  const settlement = getFactionSettlements(player.factionState).find(row => row.settlementId === objective.settlementId);
  return !!unit && !!settlement && isV39UnitInsideSettlement(unit, settlement);
}
