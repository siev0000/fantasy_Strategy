import {
  equipmentData as equipmentDb,
  terrainData as terrainDb,
  testGameData as testGameDb
} from "../../lib/game-data-registry.js";
import { applyV39DerivedCharacterData } from "../unit/v39-character-derived-rules.js";
import { resolveSkillBasePower } from "../../lib/skill-power.js";
import { createPlayerRecord } from "../../lib/player-state.js";
import { createV39EquipmentEntry } from "../../lib/v39-equipment-rules.js";
import { resolveV39RangeTiles } from "../../lib/v39-gameplay-balance.js";

const equipmentByName = new Map(
  (Array.isArray(equipmentDb) ? equipmentDb : [])
    .map(row => [String(row?.装備名 || "").trim(), row])
    .filter(([name]) => name)
);
const terrainByName = new Map(
  (Array.isArray(terrainDb) ? terrainDb : [])
    .map(row => [String(row?.地形 || "").trim(), row])
    .filter(([name]) => name)
);

const optionalNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveEquipment = definition => {
  const name = String(definition?.name || "").trim();
  const row = equipmentByName.get(name);
  if (!row) throw new Error(`装備.jsonに「${name}」がありません`);
  return createV39EquipmentEntry(row, definition?.quality || "common", definition?.slot);
};

const createUnit = definition => {
  const position = Array.isArray(definition?.position) ? definition.position : [];
  const derived = applyV39DerivedCharacterData({
    id: definition.id,
    name: definition.name,
    icon: definition.icon,
    squadId: definition.squadId,
    settlementId: definition.settlementId,
    x: optionalNumber(position[0]),
    y: optionalNumber(position[1]),
    race: definition.race,
    className: definition.className,
    level: definition.level,
    role: definition.role,
    isNamed:definition.isNamed === true,
    isSovereign:definition.isSovereign === true,
    unitType:definition.unitType || (definition.isNamed ? "ネームド" : "軍隊"),
    movement: definition.movement,
    equipment: (Array.isArray(definition.equipment) ? definition.equipment : []).map(resolveEquipment)
  });
  if (!derived?.derivedCharacter?.ok) {
    const missing = derived?.derivedCharacter?.missing || {};
    console.warn("[テストデータ] クラス定義がないユニットを除外しました", {
      ユニット: definition?.name || definition?.id || "名称未設定",
      種族: definition?.race || "",
      クラス: definition?.className || "",
      不足定義: Object.entries(missing)
        .filter(([, isMissing]) => isMissing)
        .map(([key]) => key)
    });
    return null;
  }
  const maxHp = Math.max(1, Math.round(optionalNumber(derived.maxHp) ?? optionalNumber(derived.status?.HP) ?? 1));
  const hpRate = Math.max(0, Math.min(1, optionalNumber(definition.hpRate) ?? 1));
  const maxAp = Math.max(1, Math.round(optionalNumber(definition.maxAp) ?? 100));
  const hp = Math.max(0, Math.min(maxHp, Math.round(maxHp * hpRate)));
  return {
    ...derived,
    maxHp,
    hp,
    currentHp: hp,
    maxAp,
    ap: Math.max(0, Math.min(maxAp, Math.round(optionalNumber(definition.ap) ?? maxAp))),
    equipmentSlots: Object.fromEntries((Array.isArray(definition.equipment) ? definition.equipment : []).map(item => [item.slot, true]))
  };
};

const players = (Array.isArray(testGameDb?.players) ? testGameDb.players : []).map((player, index) => createPlayerRecord({
  ...player,
  factionState: {
    ...player.factionState,
    units: (Array.isArray(player?.factionState?.units) ? player.factionState.units : [])
      .map(createUnit)
      .filter(Boolean)
  }
}, index));

const activePlayer = players.find(player => player.id === testGameDb?.activePlayerId) || players[0] || null;
const activeUnit = activePlayer?.factionState?.units.find(unit => unit.id === activePlayer.factionState.selectedUnitId)
  || activePlayer?.factionState?.units[0]
  || null;

const skillIcon = row => {
  if (row?.攻撃手段 === "魔法") return "●";
  if (row?.攻撃手段 === "武器") return "⚔";
  return "◆";
};

const actionSkills = (Array.isArray(activeUnit?.techniques) ? activeUnit.techniques : [])
  .filter(technique => technique?.action === "A" && technique?.source)
  .map((technique, index) => {
    const row = technique.source;
    const range = resolveV39RangeTiles(optionalNumber(row.射程), 1);
    const area = row.範囲 ?? row.炸裂 ?? null;
    return {
      key: `skill-${index}`,
      icon: skillIcon(row),
      name: row.名前,
      ap: optionalNumber(row.AP消費) ?? 0,
      power: resolveSkillBasePower(row),
      range,
      pattern: area == null ? "single" : "circle",
      meta: area == null ? `射${range}` : `射${range} / 範${area}`,
      source: row
    };
  });

const landDefinition = testGameDb?.landInitial || {};
const terrainName = String(landDefinition.terrain || "").trim();
const terrain = terrainByName.get(terrainName);
if (!terrain) throw new Error(`地形.jsonに「${terrainName}」がありません`);
const dangerPercent = Math.round((optionalNumber(terrain.モンスター危険度) ?? 0) * 100);
const recoveryPercent = Math.round((optionalNumber(terrain.回復) ?? 0) * 100);

export const V39_TEST_GAME_STATE = Object.freeze({
  activePlayerId: String(testGameDb?.activePlayerId || players[0]?.id || ""),
  players,
  territoryOwnerByTile:{ ...(testGameDb?.territoryOwnerByTile || {}) },
  facilitiesByTile:{ ...(testGameDb?.facilitiesByTile || {}) },
  territoryStateByTile:{ ...(testGameDb?.territoryStateByTile || {}) }
});

export const V39_TEST_OPERATION_DATA = Object.freeze({
  landItems: [
    { label: "地形", value: terrain.地形, valueId: "landTerrain" },
    { label: "領土", value: landDefinition.owner || "未支配", valueId: "landOwner" },
    { label: "危険度", value: `${dangerPercent}%` },
    { label: "高度", value: `Lv ${optionalNumber(landDefinition.heightLevel) ?? 0}`, valueId: "landHeight" },
    { label: "施設", value: landDefinition.facility || "なし" },
    { label: "ユニット", value: landDefinition.unitLabel || "なし", valueId: "landUnits" },
    { label: "町状態", value: landDefinition.village || "なし" },
    { label: "領土状態", value: landDefinition.territoryState || "なし" },
    { label: "回復補正", value: `${recoveryPercent >= 0 ? "+" : ""}${recoveryPercent}%` },
    { label: "移動停止", value: terrain.移動条件 || "-" },
    { label: "川 / 滝", value: `${landDefinition.river || "なし"} / ${landDefinition.waterfall || "なし"}` },
    { label: "火山 / 溶岩", value: "なし / なし" },
    { label: "敵", value: landDefinition.enemy || "なし", valueId: "landEnemies" }
  ],
  actionSkills
});
