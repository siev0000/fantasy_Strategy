import {isV39VillageContactUnit} from './v39-village-contacts.js';
import { resolveV39ImmediateSoulAmount } from './v39-soul-conversion.js';
import {resolveV39SoulResourceValue} from './v39-soul-resource-value.js';
import { isV39Undead } from './v39-corpse-types.js';
import { addV39CargoToFactionUnit } from './v39-logistics-state.js';
import { replaceIncidentVillage } from './v39-village-incidents.js';
import {addV39SoulApp,resolveV39UnitSoulApp} from './v39-soul-app.js';

const living = unit => Number(unit?.hp ?? unit?.currentHp) > 0 && unit.state !== '死亡';

export function receiveV39VillageSacrifice(state, playerId, villageId, options = {}) {
  const fail = reason => ({ ok:false, state, reason });
  const player = state.players?.find(row => row.id === playerId);
  const village = state.neutralVillages?.find(row => row.id === villageId);
  if (!player || village?.abandoned || village?.hostilePlayerIds?.includes(playerId)
    || !village?.sacrificeContract?.active || village.sacrificeContract.playerId !== playerId)
    return fail('有効な契約の受取プレイヤーが村へ来訪してください');
  if ((state.activeWorldId || 'surface') !== 'surface') return fail('地上の村で受け取ってください');
  if (options.aiTurn ? player.isPlayer !== false || !['player','resolution'].includes(state.timeline?.phase)
    : state.activePlayerId !== playerId || state.timeline?.phase !== 'player') return fail('受取側の行動中に実行してください');
  const actor = player.factionState.units.find(unit => (!options.unitId || unit.id === options.unitId)
    && living(unit) && !unit.pendingWorldExit && (unit.worldId || 'surface') === 'surface'
    && isV39VillageContactUnit(unit,village));
  if (!actor) return fail('村の領土内または隣接マスに受取ユニットが必要です');
  const history = player.factionState.sacrificeReceiptHistory || [];
  const seen = new Set(history.map(row => row.unitId));
  const held = (village.heldUnits || []).filter(row => {
    const id = row.unit?.id;
    if (!id || !['corpse','captive'].includes(row.kind) || row.ownerPlayerId === playerId || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!held.length) return fail('引き渡し対象がありません');
  const converted = held.filter(row => !row.unit.summon && !row.unit.soulCollected && !isV39Undead(row.unit)
    && resolveV39ImmediateSoulAmount(player, 1, options.conversion) > 0);
  const convertedIds = new Set(converted.map(row => row.unit.id));
  const soulAmount = resolveV39ImmediateSoulAmount(player, converted.length, options.conversion);
  const receivedTurn = Number(options.turnNumber ?? state.timeline?.turnNumber) || 1;
  const cargo = {
    resourcesByType:soulAmount > 0 ? { 魂:soulAmount } : {},
    equipmentInventory:held.flatMap(row => (row.unit.equipment || []).map(item => ({ item:{ ...item }, count:1 })))
  };
  const added = addV39CargoToFactionUnit(player.factionState, actor.id, cargo);
  if (!added.ok) return fail('受取ユニットの所属部隊がありません');
  const prisoners = held.filter(row => !convertedIds.has(row.unit.id)).map(row => ({ ...row,
    unit:{ ...structuredClone(row.unit), equipment:[] }, receivedTurn }));
  const ids = new Set(held.map(row => row.unit.id));
  const faction = { ...addV39SoulApp(added.faction,converted.map(row=>resolveV39UnitSoulApp(row.unit,state.gameSettings))),
    villagePrisoners:[...(player.factionState.villagePrisoners || []), ...prisoners],
    sacrificeReceiptHistory:[...history, ...held.map(row => ({ unitId:row.unit.id, ownerPlayerId:row.ownerPlayerId,
      villageId, receivedTurn, soulApp:convertedIds.has(row.unit.id)?resolveV39UnitSoulApp(row.unit,state.gameSettings):0,
      soulAmount:convertedIds.has(row.unit.id) ? resolveV39ImmediateSoulAmount(player, 1, options.conversion) : 0 }))]
  };
  const next = replaceIncidentVillage({ ...state,
    players:state.players.map(row => row.id === playerId ? { ...row, factionState:faction } : row)
  }, { ...village, heldUnits:(village.heldUnits || []).filter(row => !ids.has(row.unit?.id)) });
  return { ok:true, state:next, soulAmount, received:held.length, unitId:actor.id,
    message:`生贄受取 ${held.length}体${soulAmount > 0 ? ` / 魂へ即時変換 +${resolveV39SoulResourceValue(soulAmount)}` : ' / 捕虜・死体として保持'} / 装備は荷物へ` };
}
