import defaults from "../../../config/v39-facility-recruitment-defaults.json";
import { getGameDataRows } from "./game-data-registry.js";
import { getSelectedSettlement } from "./settlement-state.js";
import { resolveCurrentResearchLevel } from "./research-progress.js";
import { TERRITORY_TILE_MODE_SETTLEMENT } from "./phaser-map-panel-config.js";
import { parseV39ClassCondition } from "./v39-class-rules.js";
import { RACE_CLASS_NAME_MAP } from "../constants/unitCommon.js";

export const V39_FACILITY_RECRUITMENT = defaults.entries;

export function resolveV39FacilityRecruitmentGrowth(entry, race) {
  const condition = parseV39ClassCondition(entry.row.条件クラス);
  const initialClassLevel = entry.initialClassLevel;
  const prerequisiteClassLevels = {[condition.token]:condition.required};
  const classTotal = condition.required + initialClassLevel;
  const raceRow = getGameDataRows("クラス").find(row => row.名前 === (RACE_CLASS_NAME_MAP[race] || race));
  const initialRaceLevel = Number(defaults.initialRaceLevels[raceRow?.種類]) || 0;
  return {level:classTotal + initialRaceLevel, initialRaceLevel, initialClassLevel, prerequisiteClassLevels};
}

export function getV39FacilityRecruitmentClasses() {
  return V39_FACILITY_RECRUITMENT.flatMap(entry => {
    const row = getGameDataRows("クラス").find(row => row.名前 === entry.className);
    // 試験でもTier3以上・複合クラスを直接徴兵しない。
    if (!row || Number(row.Tire ?? row.Tier) !== 2 || String(row.条件クラス || "").split("/").filter(Boolean).length !== 1) return [];
    return [{...entry, row}];
  });
}

export function inspectV39FacilityRecruitment(player, className, state = {}) {
  const entry = getV39FacilityRecruitmentClasses().find(entry => entry.className === className);
  if (!entry) return null;
  const village = getSelectedSettlement(player?.factionState);
  const militaryLevel = Math.max(Number(village?.cityLevels?.軍事Lv) || 0, resolveCurrentResearchLevel(player?.factionState?.research, "軍事"));
  const completed = Object.entries(village?.tileFacilityMap || {}).some(([key, names]) => {
    const health = village?.facilityStateByTile?.[key]?.[entry.facilityName];
    const owner = state.territoryOwnerByTile?.[key];
    return Array.isArray(names) && names.includes(entry.facilityName) && (!state.territoryOwnerByTile || owner === player.id)
      && health?.status !== "損壊" && !(health && Number(health.hp) <= 0);
  });
  const reasons = [];
  if (!completed) reasons.push(`${entry.facilityName}の建設完了が必要`);
  if (militaryLevel < entry.requiredMilitaryLevel) reasons.push(`軍事Lv${entry.requiredMilitaryLevel}が必要`);
  return {...entry, available:reasons.length === 0, reasons};
}

export function seedV39FacilityRecruitmentTest(village, tiles, facilitiesByTile) {
  const entry = V39_FACILITY_RECRUITMENT[0];
  const tile = tiles.find(tile => tile.key !== `${village.x},${village.y}` && !facilitiesByTile[tile.key]?.length);
  if (!entry || !tile) return village;
  facilitiesByTile[tile.key] = [entry.facilityName];
  return {...village,
    cityLevels:{...village.cityLevels, 軍事Lv:Math.max(Number(village.cityLevels?.軍事Lv) || 0,entry.requiredMilitaryLevel)},
    buildings:[...new Set([...(village.buildings || []),entry.facilityName])],
    tileFacilityMap:{...village.tileFacilityMap,[tile.key]:[entry.facilityName]},
    territoryTileModeMap:{...village.territoryTileModeMap,[tile.key]:TERRITORY_TILE_MODE_SETTLEMENT}
  };
}
