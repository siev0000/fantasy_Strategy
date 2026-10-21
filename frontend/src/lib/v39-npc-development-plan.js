import balance from '../../../config/v39-npc-faction-ai.json';
import { getSelectedSettlement } from './settlement-state.js';
import { facilityDefinitions, inspectV39Construction, inspectV39NeutralVillageEconomy, FOOD_RESOURCE_KEYS } from './v39-economy-rules.js';
import { hasV39FacilityPrerequisites } from './v39-facility-development-rules.js';
import { getV39UnitCreationOptions, inspectV39UnitCreation } from './v39-unit-creation-rules.js';
import { inspectV39NpcResourceNeeds } from './v39-npc-resource-policy.js';

const n = value => Number(value) || 0;
const alive = unit => n(unit?.hp ?? unit?.currentHp) > 0 && unit.state !== '死亡';
const shortage = (cost, stock) => Object.entries(cost || {}).filter(([key, amount]) => n(amount) > n(stock?.[key]))
  .map(([name, required]) => ({ name, required:n(required), stock:n(stock?.[name]), missing:Math.ceil((n(required)-n(stock?.[name]))*100)/100 }));

export function inspectV39NpcConstructionPlan(state, player, mapData) {
  const village = getSelectedSettlement(player.factionState);
  if (!village?.placed) return { status:'blocked', reasons:['拠点未配置'], shortages:[] };
  const queued = village.constructionQueue?.[0];
  if (queued) return { status:'building', name:queued.facilityName, tileKey:queued.tileKey,
    remainingTurns:queued.remainingTurns, shortages:[], reasons:[] };
  const foodShortage = inspectV39NeutralVillageEconomy({ ...village, race:player.race }, mapData, state).shortageTotal > 0;
  const priority = definition => n(definition.row.自動建設優先度) + n(balance.constructionPurposeBonus[definition.row.建設目的])
    + (foodShortage && (n(definition.row.農業) > 0 || definition.gatheringResource === '魚' || definition.row.施設ID === 'cemetery') ? balance.foodShortageBonus : 0);
  const definitions = facilityDefinitions().filter(definition => hasV39FacilityPrerequisites(village, definition.row)
    && !(village.buildings || []).includes(definition.name)).sort((a,b) => priority(b)-priority(a) || a.name.localeCompare(b.name));
  const keys = Object.entries(state.territoryOwnerByTile || {}).filter(([,owner]) => owner === player.id).map(([key])=>key).sort();
  let blocked = null;
  for (const definition of definitions) for (const key of keys) {
    const [x,y] = key.split(',').map(Number), tile = {x,y};
    const check = inspectV39Construction(state, player, definition, tile, mapData);
    const reasons = [...check.reasons, ...(check.replacesResidential ? ['居住地の施設転用は未承認'] : [])];
    const shortages = shortage(check.materialPayment?.cost, check.village.materialStockByType);
    const candidate = { status:!reasons.length?'ready':'blocked', name:definition.name, tileKey:key,
      purpose:definition.row.建設目的, reasons, shortages, definition, tile };
    if (candidate.status === 'ready') return candidate;
    const blockers = reasons.filter(reason=>!reason.startsWith('資材不足:')).length;
    if (!blocked || blockers < blocked.blockers) blocked = {...candidate, blockers};
  }
  return blocked || {status:'blocked', reasons:[keys.length?'前提を満たす建設候補がありません':'自領の建設候補地がありません'], shortages:[]};
}

export function inspectV39NpcReinforcementPlan(state, player) {
  const living = (player.factionState.units || []).filter(alive).length;
  const queued = (player.factionState.unitTrainingQueue || []).length;
  const target = Math.max(0, n(balance.unitTarget)), remaining = Math.max(0,target-living-queued);
  const base = {living, queued, target, remaining, shortages:[], reasons:[]};
  if (!remaining) return {...base, status:'satisfied'};
  const options = getV39UnitCreationOptions(player);
  let blocked = null;
  for (const mode of ['army','normal']) for (const classRow of options.classes || []) for (const race of options.races || []) {
    const request = {mode, className:classRow.名前, race, count:1};
    const check = inspectV39UnitCreation(state, player, request);
    const stock = Object.fromEntries(Object.keys(check.cost).map(key => [key,FOOD_RESOURCE_KEYS.includes(key)
      ?check.village.foodStockByType?.[key]:check.village.materialStockByType?.[key]]));
    const shortages = shortage(check.cost,stock);
    const candidate = {...base, status:check.available?'ready':'blocked', className:classRow.名前, race,
      unitType:check.mode.unitTypeLabel, level:check.initialLevel, shortages, reasons:check.reasons, request};
    if (check.available) return candidate;
    const blockers = check.reasons.filter(reason=>!shortages.some(row=>reason===`${row.name}不足`)).length;
    if (!blocked || blockers < blocked.blockers) blocked = {...candidate,blockers};
  }
  return blocked || {...base, status:'blocked', reasons:['作成可能な種族・職業がありません']};
}

// Persist only the decision summary, not definitions, checks, or copies of game state.
export function inspectV39NpcDevelopmentPlan(state, player, mapData) {
  const {definition,tile,blockers,...construction} = inspectV39NpcConstructionPlan(state,player,mapData);
  const {request,blockers:ignored,...reinforcement} = inspectV39NpcReinforcementPlan(state,player);
  const resourceGoals = [
    ...construction.shortages.map(row=>({...row,purpose:`建設: ${construction.name || '施設'}`})),
    ...reinforcement.shortages.map(row=>({...row,purpose:'戦力増強'})),
    ...inspectV39NpcResourceNeeds(player).map(row=>({name:row.resource,required:row.required,stock:row.stock,
      missing:Math.ceil((row.required-row.stock)*100)/100,purpose:'人口増加',settlementId:row.settlementId}))
  ];
  return {construction,reinforcement,resourceGoals};
}
