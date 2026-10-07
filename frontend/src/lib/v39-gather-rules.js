import { getGameDataRows } from "./game-data-registry.js";
import { V39_GATHER_BALANCE } from "./v39-gameplay-balance.js";
import { ECONOMY_GAIN_SCALE } from "./v39-economy-rules.js";
import { getV39DiscoveredFeature } from "./v39-exploration-rules.js";
import { resolveV39TileTerrainName } from "./v39-terrain-traversal.js";
import { isV39UnitWaiting } from "./v39-unit-action-rules.js";
import { isV39UnitInWorld } from "./v39-cave-spatial-rules.js";
import { addV39CargoToFactionUnit, getV39SquadUnitIds, normalizeV39Cargo,
  resolveV39UnitCargoCapacity, resolveV39CargoLoad, fitV39CargoToCapacity, isV39CargoEmpty } from "./v39-logistics-state.js";

const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const terrainRows = new Map(getGameDataRows("地形").map(row => [text(row.地形), row]));
const resourceRows = getGameDataRows("都市基本データ");

export function inspectV39Gather(state, playerId, unitId, mapData) {
  const player = state?.players?.find(row => row.id === playerId);
  const faction = player?.factionState;
  const unit = faction?.units?.find(row => row.id === unitId);
  const key = `${unit?.x},${unit?.y}`, reasons = [];
  const terrainName = resolveV39TileTerrainName(mapData, unit?.x, unit?.y);
  const feature = getV39DiscoveredFeature(faction, key);
  const sourceName = text(feature?.name || feature?.definition?.name).includes("洞窟") ? feature.definition.name : terrainName;
  const row = terrainRows.get(sourceName);
  const categories = sourceName.includes("森") ? ["木材"]
    : sourceName.includes("洞窟") ? ["石材", "金属", "貴金属", "宝石"] : [];
  const yields = Object.fromEntries(resourceRows.filter(item => categories.includes(text(item.分類)))
    .map(item => [text(item.データ分類), Math.round(Math.max(0, number(row?.[item.データ分類])) * ECONOMY_GAIN_SCALE * 10) / 10])
    .filter(([name, amount]) => name && amount > 0));
  const turn = number(state?.timeline?.turnNumber);
  const squad = faction?.squads?.find(item => getV39SquadUnitIds(item).includes(text(unitId)));
  const individual = text(squad?.id) === "solo" || !!unit?.transportAssignment;
  const cargo = normalizeV39Cargo(individual ? squad?.cargoByUnitId?.[unitId] : squad?.cargo);
  const ids = new Set(getV39SquadUnitIds(squad));
  const carriers = individual ? [unit] : (faction?.units || []).filter(item => ids.has(item.id)
    && number(item.hp ?? item.currentHp) > 0 && text(item.state || item.statusName) !== "死亡" && !item.transportAssignment);
  const capacity = carriers.filter(Boolean).reduce((sum, item) => sum + resolveV39UnitCargoCapacity(item), 0);
  const fitted = fitV39CargoToCapacity({ resourcesByType:yields }, Math.max(0, capacity - resolveV39CargoLoad(cargo)));
  if (!unit || !squad) reasons.push("採取するキャラクターを選択してください");
  if(unit&&!isV39UnitInWorld(unit,state?.activeWorldId))reasons.push("このキャラクターは別のマップにいます");
  if (state?.timeline?.phase && state.timeline.phase !== "player") reasons.push("操作ターンに実行してください");
  if (unit && (number(unit.hp ?? unit.currentHp) <= 0 || text(unit.state || unit.statusName) === "死亡")) reasons.push("死亡したキャラクターは採取できません");
  if (!mapData?.grid?.[unit?.y]?.[unit?.x]) reasons.push("フィールド上で実行してください");
  if (number(unit?.ap ?? unit?.currentAp) < V39_GATHER_BALANCE.apCost) reasons.push("APが不足しています");
  if (isV39UnitWaiting(unit, turn)) reasons.push("このターンは待機済みです");
  if (unit?.surveyTask) reasons.push("調査中です");
  if (unit?.transportAssignment?.enabled) reasons.push("自動輸送を停止してから採取してください");
  if (state?.territoryOwnerByTile?.[key]) reasons.push("通常収入との重複を避けるため領土外で採取してください");
  if ((state?.players || []).some(item => number(item.factionState?.exploration?.gatheredAtTurnByTile?.[key]) === turn)) reasons.push("このマスは今ターン採取済みです");
  if (!Object.keys(yields).length) reasons.push("採取できる森・洞窟ではありません");
  else if (isV39CargoEmpty(fitted.accepted)) reasons.push("運搬上限です");
  return { available:!reasons.length, reasons, player, faction, unit, key, turn, sourceName,
    apCost:V39_GATHER_BALANCE.apCost, yields, accepted:fitted.accepted, capacity, load:resolveV39CargoLoad(cargo) };
}

export function gatherV39Resources(state, playerId, unitId, mapData) {
  const check = inspectV39Gather(state, playerId, unitId, mapData);
  if (!check.available) return { ok:false, reason:check.reasons.join(" / "), state };
  const added = addV39CargoToFactionUnit(check.faction, unitId, check.accepted);
  const faction = { ...added.faction, units:added.faction.units.map(unit => unit.id !== unitId ? unit : {
    ...unit, ap:number(unit.ap ?? unit.currentAp) - check.apCost, currentAp:number(unit.ap ?? unit.currentAp) - check.apCost,
    actionPoint:number(unit.ap ?? unit.currentAp) - check.apCost, lastAction:"採取", lastActionTurn:check.turn
  }), exploration:{ ...check.faction.exploration,
    gatheredAtTurnByTile:{ ...Object.fromEntries(Object.entries(check.faction.exploration?.gatheredAtTurnByTile || {})
      .filter(([, turn]) => number(turn) === check.turn)), [check.key]:check.turn }
  } };
  return { ok:true, ...check, state:{ ...state, players:state.players.map(player => player.id !== playerId ? player : {
    ...player, factionState:faction
  }) } };
}
