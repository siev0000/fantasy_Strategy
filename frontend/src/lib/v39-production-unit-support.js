import {getFactionSettlements,replaceFactionSettlement,territorySettlementId} from "./settlement-state.js";

const SKILL_POINTS_STEP = 10;
const skills = {work:"制作",magic:"魔術",faith:"信仰"};

function supportPoints(unit, skill) {
  const value = Number(unit.skillLevels?.[skill] ?? unit.status?.[skill]);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value / SKILL_POINTS_STEP)) : 0;
}

export function getV39ProductionUnitBonus(village, field, turn) {
  const bonus = village?.productionUnitBonus;
  return bonus?.turn === turn ? Number(bonus?.[field]) || 0 : 0;
}

export function collectV39WaitingSupportUnits(player, state, turn) {
  const groups = new Map();
  for (const unit of player?.factionState?.units || []) {
    if (Number(unit.productionWaitTurn) !== turn || Number(unit.waitTurnNumber) !== turn
      || Number(unit.lastCombatActionTurn) === turn || !(Number(unit.hp ?? unit.currentHp) > 0)
      || (unit.state || unit.statusName) === "死亡" || unit.characterStorage
      || !Number.isInteger(unit.x) || !Number.isInteger(unit.y) || unit.x < 0 || unit.y < 0) continue;
    const world = unit.worldId || "surface";
    const spatial = world === (state.activeWorldId || "surface") ? state : state.explorationWorlds?.[world]?.spatial;
    const tile = `${unit.x},${unit.y}`;
    if (spatial?.territoryOwnerByTile?.[tile] !== player.id) continue;
    const id = territorySettlementId(spatial.territoryStateByTile?.[tile]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(unit);
  }
  return groups;
}

export function settleV39ProductionUnitSupport(player, state, turn, nextTurn) {
  const faction = player.factionState;
  const bases = getFactionSettlements(faction);
  if (!bases.some(base => base.placed)) return faction;
  const groups = collectV39WaitingSupportUnits(player, state, turn);
  let next = faction;
  for (const base of bases) {
    const total = {turn:nextTurn,work:0,magic:0,faith:0};
    for (const unit of base.placed ? groups.get(base.settlementId) || [] : []) {
      if ((unit.worldId || "surface") !== (base.worldId || "surface")) continue;
      for (const [field, skill] of Object.entries(skills)) total[field] += supportPoints(unit, skill);
    }
    const productionUnitBonus = total.work || total.magic || total.faith ? total : undefined;
    if (!productionUnitBonus && !base.productionUnitBonus) continue;
    next = replaceFactionSettlement(next, {...base, productionUnitBonus}, {ownerPlayerId:player.id,select:false});
  }
  return next;
}
