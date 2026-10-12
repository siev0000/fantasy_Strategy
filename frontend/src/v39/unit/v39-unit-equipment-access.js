import { changeV39UnitEquipment, getV39EquipmentSlotCandidates, normalizeV39EquipmentInventory, normalizeV39EquipmentItem } from "../../lib/v39-equipment-rules.js";
import { getSelectedSettlement } from "../../lib/settlement-state.js";
import { normalizeV39Cargo } from "../../lib/v39-logistics-state.js";
import { isMobUnit } from "../../composables/unitCoreUtils.js";
import { applyV39DerivedCharacterData } from "./v39-character-derived-rules.js";
import { EQUIPMENT_SLOT_KEYS } from "../../constants/unitCommon.js";

function cargoContext(player, unit) {
  const squad = player?.factionState?.squads?.find(row => row.unitIds?.includes(unit?.id));
  const individual = squad?.id === "solo" || unit?.squadId === "solo" || !!unit?.transportAssignment;
  return {squad, individual, cargo:normalizeV39Cargo(individual ? squad?.cargoByUnitId?.[unit?.id] : squad?.cargo)};
}

export function getV39UnitEquipmentStock(player, unit, underground = false) {
  if (!underground) return normalizeV39EquipmentInventory(getSelectedSettlement(player?.factionState)?.equipmentInventory);
  return cargoContext(player, unit).cargo.equipmentInventory.map((item, index) => ({
    key:`cargo:${index}`, item:normalizeV39EquipmentItem(item), count:1
  })).filter(row => row.item);
}

export function changeV39UnitEquipmentFromStock(state, playerId, request, underground = false) {
  if (!underground) return changeV39UnitEquipment(state, playerId, request);
  const player = state?.players?.find(row => row.id === playerId);
  const unit = player?.factionState?.units?.find(row => row.id === request.unitId);
  const fail = reason => ({ok:false, reason, state});
  if (!EQUIPMENT_SLOT_KEYS.includes(request.slot)) return fail("装備部位が不正です");
  if (!unit) return fail("キャラクターが見つかりません");
  if (isMobUnit(unit)) return fail("軍隊ユニットは固定装備です");
  if (!(unit.hp > 0)) return fail("死亡したキャラクターは装備変更できません");
  const {squad, individual, cargo} = cargoContext(player, unit);
  if (!squad) return fail("携帯在庫を持つ部隊がありません");
  const equipment = (unit.equipment || []).map(normalizeV39EquipmentItem).filter(Boolean);
  const old = equipment.find(item => item.slot === request.slot);
  let item = null;
  if (request.inventoryKey) {
    const row = getV39UnitEquipmentStock(player, unit, true).find(row => row.key === request.inventoryKey);
    if (!row) return fail("携帯在庫に装備がありません");
    if (!getV39EquipmentSlotCandidates(row.item.source || row.item.name).includes(request.slot)) return fail("この部位には装備できません");
    cargo.equipmentInventory.splice(Number(row.key.slice(6)), 1);
    item = {...row.item, slot:request.slot};
  }
  if (old) cargo.equipmentInventory.push(old);
  const next = applyV39DerivedCharacterData({...unit,
    equipment:[...equipment.filter(row => row.slot !== request.slot), ...(item ? [item] : [])]});
  if (!next.derivedCharacter?.ok) return fail("装備の計算に失敗しました");
  const updated = {...next, hp:Math.min(unit.hp, next.maxHp), currentHp:Math.min(unit.hp, next.maxHp), ap:unit.ap, currentAp:unit.currentAp};
  const factionState = {...player.factionState,
    units:player.factionState.units.map(row => row.id === unit.id ? updated : row),
    squads:player.factionState.squads.map(row => row.id !== squad.id ? row : individual
      ? {...row, cargoByUnitId:{...row.cargoByUnitId, [unit.id]:cargo}} : {...row, cargo})};
  return {ok:true, state:{...state, players:state.players.map(row => row.id === playerId ? {...row, factionState} : row)}};
}
