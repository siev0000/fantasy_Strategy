import { getGameDataRows } from "./game-data-registry.js";
import { resolveCompletedResearchLevel } from "./research-progress.js";
import {
  collectTerritoryIncome,
  multiplyResourceBag,
  normalizeResourceBag,
  sumResourceBag
} from "../composables/resourceEconomyUtils.js";
import { resolveVillageScaleDefinition, resolveVillageScaleLabel } from "../composables/villageCoreUtils.js";
import { getHexDistance, getHexOffsetNeighbors } from "./hex-grid.js";
import {
  TERRITORY_TILE_MODE_CONFIG,
  TERRITORY_TILE_MODE_RESOURCE,
  TERRITORY_TILE_MODE_SETTLEMENT
} from "./phaser-map-panel-config.js";
import { RESEARCH_CATEGORY_ORDER } from "./research-tree-config.js";
import { getFactionSettlements, getSelectedSettlement, replaceFactionSettlement, territorySettlementId } from "./settlement-state.js";
import {
  advanceV39PopulationEconomy,
  buildV39PopulationMaintenanceStock,
  normalizeV39PopulationGrowthState
} from "./v39-population-economy.js";

const RESOURCE_DEFINITION_ROWS = getGameDataRows("都市基本データ")
  .filter(row => ["食料", "木材", "石材", "金属", "貴金属", "宝石", "特殊資源"].includes(String(row?.分類 || "").trim()));
const resourceKeysFor = categories => Object.freeze([...new Set(RESOURCE_DEFINITION_ROWS
  .filter(row => categories.includes(String(row?.分類 || "").trim()))
  .map(row => String(row?.データ分類 || "").trim()).filter(Boolean))]);

export const FOOD_RESOURCE_KEYS = resourceKeysFor(["食料", "特殊資源"]);
export const MATERIAL_RESOURCE_KEYS = resourceKeysFor(["木材", "石材", "金属", "貴金属", "宝石"]);
export const NORMAL_FOOD_RESOURCE_KEYS = resourceKeysFor(["食料"]);
const RESOURCE_MARKER_ROWS = RESOURCE_DEFINITION_ROWS
  .filter(row => Number.isInteger(Number(row?.地図表示優先度)) && Number(row.地図表示優先度) > 0)
  .sort((left, right) => Number(left.地図表示優先度) - Number(right.地図表示優先度));
export const RESOURCE_MARKER_PRIORITY_KEYS = Object.freeze(RESOURCE_MARKER_ROWS
  .map(row => String(row?.データ分類 || "").trim()).filter(Boolean));
const RESOURCE_KEYS_WITHOUT_MARKER_PRIORITY = [...FOOD_RESOURCE_KEYS, ...MATERIAL_RESOURCE_KEYS]
  .filter(key => !RESOURCE_MARKER_PRIORITY_KEYS.includes(key));
if (RESOURCE_KEYS_WITHOUT_MARKER_PRIORITY.length) {
  throw new Error(`[ゲームデータ] 都市基本データ.json: 地図表示優先度がありません (${RESOURCE_KEYS_WITHOUT_MARKER_PRIORITY.join("、")})`);
}
if (new Set(RESOURCE_MARKER_ROWS.map(row => Number(row.地図表示優先度))).size !== RESOURCE_MARKER_ROWS.length) {
  throw new Error("[ゲームデータ] 都市基本データ.json: 地図表示優先度が重複しています");
}
export const RESOURCE_GROUPS = Object.freeze({
  food:{ title:"食料", icon:"🌾", keys:resourceKeysFor(["食料", "特殊資源"]) },
  wood:{ title:"木材", icon:"🪵", keys:resourceKeysFor(["木材", "石材"]) },
  ore:{ title:"金属", icon:"⛏", keys:resourceKeysFor(["金属"]) },
  precious:{ title:"貴金属", icon:"💎", keys:resourceKeysFor(["貴金属", "宝石"]) }
});

const RESOURCE_FACILITY_EFFECT = Object.freeze(Object.fromEntries(RESOURCE_DEFINITION_ROWS
  .map(row => [String(row?.データ分類 || "").trim(), String(row?.対応技能 || "").trim()])
  .filter(([name, skill]) => name && skill)));

const ECONOMY_GAIN_SCALE = 0.1;
const INITIAL_STOCK_TURNS = 3;
const RESEARCH_FIELDS = RESEARCH_CATEGORY_ORDER;
const FACILITY_NON_EFFECT_FIELDS = new Set([
  "施設名", "分類", "識別キー", "規模Lv", "規模下限人口", "ネームド上限", "表示画像", "表示サイズ", "1マス収容人数", "占有マス数",
  "条件地形", "詳細", "建築時間", "建築数", "影響範囲",
  ...RESEARCH_FIELDS, ...MATERIAL_RESOURCE_KEYS, "死体", "魂"
]);

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round1 = value => Math.round(number(value) * 10) / 10;
const coordKey = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;

function factionDefinition(race) {
  const target = text(race);
  return getGameDataRows("勢力").find(row => text(row?.種族) === target || text(row?.カナ) === target)
    || (target === "只人" ? getGameDataRows("勢力").find(row => text(row?.種族) === "人間") : null);
}

function normalizePopulationByRace(raw, race, fallbackPopulation) {
  const result = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const count = Math.max(0, Math.floor(number(value)));
    if (text(key) && count > 0) result[text(key)] = count;
  }
  if (!Object.keys(result).length) result[text(race) || "只人"] = Math.max(1, Math.floor(number(fallbackPopulation, 1)));
  return result;
}

export function initialPopulationForRace(race) {
  return Math.max(1, Math.floor(number(factionDefinition(race)?.初期人数, 50)));
}

export function normalizeV39Village(village, race = "只人") {
  if (!village || typeof village !== "object") return null;
  const fallbackPopulation = initialPopulationForRace(race);
  const populationByRace = normalizePopulationByRace(village.populationByRace, race, number(village.population, fallbackPopulation));
  const population = Object.values(populationByRace).reduce((sum, value) => sum + number(value), 0);
  const scaleDefinition = resolveVillageScaleDefinition({ ...village, population });
  const foodStockByType = normalizeResourceBag(village.foodStockByType, FOOD_RESOURCE_KEYS, { roundTo1:round1 });
  const materialStockByType = normalizeResourceBag(village.materialStockByType, MATERIAL_RESOURCE_KEYS, { roundTo1:round1 });
  const constructionQueue = Array.isArray(village.constructionQueue)
    ? village.constructionQueue.filter(Boolean).map(row => ({
        id:text(row.id), facilityName:text(row.facilityName), tileKey:text(row.tileKey),
        remainingTurns:Math.max(1, Math.floor(number(row.remainingTurns, 1))),
        totalTurns:Math.max(1, Math.floor(number(row.totalTurns, row.remainingTurns || 1))),
        startedTurn:Math.max(1, Math.floor(number(row.startedTurn, 1)))
      })).filter(row => row.id && row.facilityName && row.tileKey.includes(","))
    : [];
  const tileFacilityMap = Object.fromEntries(Object.entries(village.tileFacilityMap || {})
    .map(([key, values]) => [key, [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]])
    .filter(([key]) => key.includes(",")));
  return {
    ...village,
    population,
    populationByRace,
    type:scaleDefinition?.name || text(village.type) || "村",
    scaleKey:scaleDefinition?.key || text(village.scaleKey) || "village",
    scaleLevel:Math.max(1, Math.floor(number(scaleDefinition?.level, village.scaleLevel || 1))),
    foodStockByType,
    materialStockByType,
    foodStock:sumResourceBag(foodStockByType, FOOD_RESOURCE_KEYS, { roundTo1:round1 }),
    materialStock:sumResourceBag(materialStockByType, MATERIAL_RESOURCE_KEYS, { roundTo1:round1 }),
    cityLevels:{ 鍛冶Lv:0, 魔法Lv:0, 信仰Lv:0, 軍事Lv:0, 経済Lv:0, ...(village.cityLevels || {}) },
    buildings:[...new Set((Array.isArray(village.buildings) ? village.buildings : []).map(text).filter(Boolean))],
    tileFacilityMap,
    constructionQueue,
    equipmentInventory:Array.isArray(village.equipmentInventory) ? village.equipmentInventory.map(row => ({ ...row, item:row?.item && typeof row.item === "object" ? { ...row.item } : row?.item })) : [],
    populationGrowthByRace:normalizeV39PopulationGrowthState(populationByRace, village.populationGrowthByRace),
    populationCapacity:Math.max(0, Math.floor(number(village.populationCapacity))),
    employmentSlots:Math.max(0, Math.floor(number(village.employmentSlots))),
    employmentRate:Math.max(0, Math.min(1, number(village.employmentRate))),
    lastEconomyDelta:village.lastEconomyDelta && typeof village.lastEconomyDelta === "object" ? { ...village.lastEconomyDelta } : null
  };
}

function resolveTileTerrain(data, x, y) {
  if (data?.lavaMap?.[y]?.[x]) return "溶岩";
  return text(data?.specialMap?.[y]?.[x]) || text(data?.grid?.[y]?.[x]);
}

function territoryKeysForPlayer(state, playerId, settlementId = "") {
  return Object.entries(state?.territoryOwnerByTile || {})
    .filter(([key, owner]) => {
      if (text(owner) !== text(playerId)) return false;
      const assignedId = territorySettlementId(state?.territoryStateByTile?.[key]);
      return !text(settlementId) || !assignedId || assignedId === text(settlementId);
    })
    .map(([key]) => key);
}

function tileModeMultiplier(village, key) {
  const homeKey = village?.placed ? coordKey(village.x, village.y) : "";
  const mode = text(village?.territoryTileModeMap?.[key]) || (key === homeKey ? TERRITORY_TILE_MODE_SETTLEMENT : TERRITORY_TILE_MODE_RESOURCE);
  return number(TERRITORY_TILE_MODE_CONFIG[mode]?.incomeMultiplier, 1);
}

function tileModeDefinition(village, key) {
  const homeKey = village?.placed ? coordKey(village.x, village.y) : "";
  const mode = text(village?.territoryTileModeMap?.[key]) || (key === homeKey ? TERRITORY_TILE_MODE_SETTLEMENT : TERRITORY_TILE_MODE_RESOURCE);
  return TERRITORY_TILE_MODE_CONFIG[mode] || TERRITORY_TILE_MODE_CONFIG[TERRITORY_TILE_MODE_RESOURCE];
}

export function resolveV39SettlementLabor(state, player, village = normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race)) {
  const ownedKeys = territoryKeysForPlayer(state, player?.id, village?.settlementId || village?.id);
  const populationCapacity = ownedKeys.reduce((sum, key) => sum + Math.max(0, number(tileModeDefinition(village, key)?.populationCapacityBonus)), 0);
  const employmentSlots = ownedKeys.reduce((sum, key) => sum + Math.max(0, number(tileModeDefinition(village, key)?.employmentSlots)), 0);
  const population = Math.max(0, number(village?.population));
  return {
    ownedKeys,
    populationCapacity:Math.floor(populationCapacity),
    employmentSlots:Math.floor(employmentSlots),
    employmentRate:employmentSlots > 0 ? Math.min(1, population / employmentSlots) : 0
  };
}

function collectDiscoveredFeatureIncome(raw, player, ownedSet, village, employmentRate) {
  const discovered = player?.factionState?.exploration?.discoveredFeaturesByTile || {};
  const terrainYieldMap = new Map(getGameDataRows("地形").map(row => [text(row?.地形), row]));
  for (const [key, site] of Object.entries(discovered)) {
    if (!ownedSet.has(key)) continue;
    const row = terrainYieldMap.get(text(site?.featureName));
    if (!row) continue;
    const multiplier = tileModeMultiplier(village, key) * employmentRate;
    for (const resourceKey of FOOD_RESOURCE_KEYS) {
      const value = number(row[resourceKey]);
      raw.food[resourceKey] = round1(number(raw.food[resourceKey]) + value * multiplier * (value > 0 ? resolveV39FacilityYieldMultiplier(village, key, resourceKey) : 1));
    }
    for (const resourceKey of MATERIAL_RESOURCE_KEYS) {
      const value = number(row[resourceKey]);
      raw.material[resourceKey] = round1(number(raw.material[resourceKey]) + value * multiplier * (value > 0 ? resolveV39FacilityYieldMultiplier(village, key, resourceKey) : 1));
    }
  }
  return raw;
}

function nestTerritoryKeys(nest, mapData) {
  const result = new Set();
  const center = { x:Math.floor(number(nest?.x)), y:Math.floor(number(nest?.y)) };
  const radius = Math.max(1, Math.floor(number(nest?.territoryRadius, 1)));
  for (let y = 0; y < number(mapData?.h); y += 1) for (let x = 0; x < number(mapData?.w); x += 1) {
    if (getHexDistance(center, { x, y }) <= radius) result.add(coordKey(x, y));
  }
  return result;
}

function collectV39NestTerritoryIncome(nest, mapData) {
  const ownedSet = nestTerritoryKeys(nest, mapData);
  const population = Math.max(0, number(nest?.population));
  const employmentSlots = ownedSet.size * number(TERRITORY_TILE_MODE_CONFIG[TERRITORY_TILE_MODE_RESOURCE]?.employmentSlots, 10);
  const employmentRate = employmentSlots > 0 ? Math.min(1, population / employmentSlots) : 0;
  const raw = collectTerritoryIncome(mapData, ownedSet, FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS, {
    roundTo1:round1,
    parseCoordKey:key => { const [x, y] = text(key).split(",").map(Number); return { x, y }; },
    resolveTileTerrainForYield:resolveTileTerrain,
    resolveTileYieldMultiplier:() => number(TERRITORY_TILE_MODE_CONFIG[TERRITORY_TILE_MODE_RESOURCE]?.incomeMultiplier, 2) * employmentRate,
    resolveResourceYieldMultiplier:() => 1,
    terrainYieldMap:new Map(getGameDataRows("地形").map(row => [text(row?.地形), row]))
  });
  return {
    food:multiplyResourceBag(raw.food, ECONOMY_GAIN_SCALE, FOOD_RESOURCE_KEYS, { roundTo1:round1 }),
    material:multiplyResourceBag(raw.material, ECONOMY_GAIN_SCALE, MATERIAL_RESOURCE_KEYS, { roundTo1:round1 }),
    territoryTiles:ownedSet.size,
    employmentSlots,
    employmentRate
  };
}

function advanceEnemyNestEconomy(state, mapData, currentTurn) {
  const sourceEnemies = Array.isArray(state?.enemies) ? state.enemies : [];
  const stageByEnemyId = new Map();
  const enemyNests = (Array.isArray(state?.enemyNests) ? state.enemyNests : []).map(nest => {
    if (number(nest?.lastEconomyTurn) >= currentTurn) return nest;
    const members = sourceEnemies.filter(enemy => text(enemy?.nestId) === text(nest?.id));
    const race = text(members[0]?.race || members[0]?.sourceRace || nest?.race);
    const fallbackPopulation = Math.max(0, Math.floor(number(nest?.population)));
    const existingPopulationEntries = Object.entries(nest?.populationByRace || {}).filter(([key, value]) => text(key) && number(value) > 0);
    const populationByRace = Object.keys(nest?.populationByRace || {}).length
      ? Object.fromEntries(existingPopulationEntries)
      : nest?.economyInitialized === true || fallbackPopulation <= 0
        ? {}
        : { [race || "スネーク"]:fallbackPopulation };
    const normalizedPopulation = Object.values(populationByRace).reduce((sum, value) => sum + Math.max(0, Math.floor(number(value))), 0);
    const territoryIncome = collectV39NestTerritoryIncome({ ...nest, population:normalizedPopulation }, mapData);
    const initializedStock = nest?.economyInitialized === true
      ? nest.foodStockByType
      : buildV39PopulationMaintenanceStock(populationByRace, members, FOOD_RESOURCE_KEYS, 4);
    const result = advanceV39PopulationEconomy({
      village:{ ...nest, population:normalizedPopulation, populationByRace, foodStockByType:initializedStock },
      units:members,
      income:territoryIncome.food,
      resourceKeys:FOOD_RESOURCE_KEYS,
      normalFoodKeys:NORMAL_FOOD_RESOURCE_KEYS,
      populationCapacity:Number.POSITIVE_INFINITY
    });
    const materialStockByType = { ...(nest?.materialStockByType || {}) };
    for (const key of MATERIAL_RESOURCE_KEYS) materialStockByType[key] = round1(number(materialStockByType[key]) + number(territoryIncome.material[key]));
    for (const enemy of members) stageByEnemyId.set(text(enemy.id), result.populationGrowthByRace[text(enemy.race)] || {});
    return {
      ...nest,
      race,
      ...result,
      materialStockByType,
      territoryTiles:territoryIncome.territoryTiles,
      employmentSlots:territoryIncome.employmentSlots,
      employmentRate:territoryIncome.employmentRate,
      economyInitialized:true,
      lastEconomyTurn:currentTurn
    };
  });
  const enemies = sourceEnemies.map(enemy => {
    const growth = stageByEnemyId.get(text(enemy.id));
    if (!growth) return enemy;
    const starvationStage = Math.max(0, Math.min(4, Math.floor(number(growth.starvationStage))));
    const exhausted = growth.remainingTurns === 0;
    const maxHp = Math.max(1, number(enemy?.maxHp, enemy?.status?.HP || 1));
    const hp = exhausted && number(enemy?.hp ?? enemy?.currentHp) > 0
      ? Math.max(0, number(enemy?.hp ?? enemy?.currentHp, maxHp) - Math.max(1, Math.floor(maxHp * 0.05)))
      : number(enemy?.hp ?? enemy?.currentHp, maxHp);
    return {
      ...enemy,
      hp,
      currentHp:hp,
      starvationStage,
      starvationApCap:starvationStage >= 4 ? 80 : 0,
      starvationPenaltyRate:starvationStage >= 4 ? 0.15 : 0,
      ...(exhausted ? { lastStarvationDamageTurn:currentTurn } : {}),
      ...(hp <= 0 ? { state:"死亡", deathCause:"飢餓", deathTurn:currentTurn, diedAtTurn:currentTurn } : {})
    };
  });
  return { enemyNests, enemies };
}

export function collectV39TerritoryIncome(state, player, mapData = window.__v39FieldRuntime?.mapData) {
  const village = normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race);
  const labor = resolveV39SettlementLabor(state, player, village);
  const ownedSet = new Set(labor.ownedKeys);
  const terrainYieldMap = new Map(getGameDataRows("地形").map(row => [text(row?.地形), row]));
  const raw = collectTerritoryIncome(mapData, ownedSet, FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS, {
    roundTo1:round1,
    parseCoordKey:key => { const [x, y] = text(key).split(",").map(Number); return { x, y }; },
    resolveTileTerrainForYield:resolveTileTerrain,
    resolveTileYieldMultiplier:({ key }) => tileModeMultiplier(village, key) * labor.employmentRate,
    resolveResourceYieldMultiplier:({ key, resourceKey, row }) => number(row?.[resourceKey]) > 0
      ? resolveV39FacilityYieldMultiplier(village, key, resourceKey)
      : 1,
    terrainYieldMap
  });
  collectDiscoveredFeatureIncome(raw, player, ownedSet, village, labor.employmentRate);
  return {
    food:multiplyResourceBag(raw.food, ECONOMY_GAIN_SCALE, FOOD_RESOURCE_KEYS, { roundTo1:round1 }),
    material:multiplyResourceBag(raw.material, ECONOMY_GAIN_SCALE, MATERIAL_RESOURCE_KEYS, { roundTo1:round1 }),
    tiles:raw.tiles,
    ...labor
  };
}

export function createInitialV39Village({ x, y, name = "拠点", race = "只人", state, player, mapData } = {}) {
  const base = normalizeV39Village({
    id:`village-${Math.floor(number(x))}-${Math.floor(number(y))}`,
    name, x:Math.floor(number(x)), y:Math.floor(number(y)), placed:true,
    population:initialPopulationForRace(race),
    populationByRace:{ [text(race) || "只人"]:initialPopulationForRace(race) },
    foodStockByType:{}, materialStockByType:{}, buildings:[], tileFacilityMap:{}, constructionQueue:[]
  }, race);
  const sourcePlayer = {
    ...(player || {}),
    race,
    factionState:replaceFactionSettlement(player?.factionState || {}, base, { ownerPlayerId:player?.id })
  };
  const income = collectV39TerritoryIncome(state, sourcePlayer, mapData);
  base.foodStockByType = multiplyResourceBag(income.food, INITIAL_STOCK_TURNS, FOOD_RESOURCE_KEYS, { roundTo1:round1 });
  base.materialStockByType = multiplyResourceBag(income.material, INITIAL_STOCK_TURNS, MATERIAL_RESOURCE_KEYS, { roundTo1:round1 });
  base.populationCapacity = income.populationCapacity;
  base.employmentSlots = income.employmentSlots;
  base.employmentRate = income.employmentRate;
  return normalizeV39Village(base, race);
}

export function facilityDefinitions() {
  return getGameDataRows("施設").filter(row => text(row?.施設名) && text(row?.分類) !== "拠点規模").map(row => ({
    id:`施設:${text(row.施設名)}`,
    name:text(row.施設名),
    description:text(row.詳細) || "説明なし",
    scope:text(row.影響範囲) || "単体マス",
    terrainCondition:text(row.条件地形) || "なし",
    buildTurns:Math.max(1, Math.floor(number(row.建築時間, 1))),
    cost:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key => [key, Math.max(0, number(row?.[key]))])),
    requirements:Object.fromEntries(RESEARCH_FIELDS.map(key => [key, Math.max(0, Math.floor(number(row?.[key]))) ]).filter(([, value]) => value > 0)),
    effects:Object.fromEntries(Object.entries(row).filter(([key, value]) => !FACILITY_NON_EFFECT_FIELDS.has(key) && number(value) !== 0).map(([key, value]) => [key, number(value)])),
    row
  }));
}

export function resolveV39FacilityEffectsAtTile(village, tileKey) {
  const key = text(tileKey);
  const definitions = new Map(facilityDefinitions().map(definition => [definition.name, definition]));
  const placedNames = new Set(Array.isArray(village?.tileFacilityMap?.[key]) ? village.tileFacilityMap[key].map(text).filter(Boolean) : []);
  const globalNames = new Set();
  for (const names of Object.values(village?.tileFacilityMap || {})) {
    for (const name of Array.isArray(names) ? names : []) {
      const definition = definitions.get(text(name));
      if (definition?.scope === "全体") globalNames.add(definition.name);
    }
  }
  for (const name of Array.isArray(village?.buildings) ? village.buildings : []) {
    const definition = definitions.get(text(name));
    if (definition?.scope === "全体") globalNames.add(definition.name);
  }
  const effects = {};
  for (const name of new Set([...globalNames, ...placedNames])) {
    const definition = definitions.get(name);
    if (!definition || (definition.scope !== "全体" && !placedNames.has(name))) continue;
    for (const [effect, value] of Object.entries(definition.effects || {})) effects[effect] = round1(number(effects[effect]) + number(value));
  }
  return effects;
}

export function resolveV39FacilityYieldMultiplier(village, tileKey, resourceKey) {
  const effects = resolveV39FacilityEffectsAtTile(village, tileKey);
  const category = RESOURCE_FACILITY_EFFECT[text(resourceKey)];
  return Math.max(0, 1 + (number(effects.生産力) + number(category ? effects[category] : 0)) / 100);
}

const hexDistance = getHexDistance;
const neighborCoords = getHexOffsetNeighbors;

function terrainConditionMet(condition, tile, mapData) {
  const expected = text(condition);
  if (!expected || expected === "なし") return true;
  const terrain = resolveTileTerrain(mapData, tile.x, tile.y);
  if (expected === "海辺") return neighborCoords(tile.x, tile.y).some(pos => ["海", "湖"].includes(resolveTileTerrain(mapData, pos.x, pos.y)));
  if (expected === "火山:4マス以内") {
    for (let y = 0; y < number(mapData?.h); y += 1) for (let x = 0; x < number(mapData?.w); x += 1) {
      if (resolveTileTerrain(mapData, x, y) === "火山" && hexDistance(tile, { x, y }) <= 4) return true;
    }
    return false;
  }
  const aliases = { 山:"山岳", 丘:"丘陵" };
  return terrain === expected || terrain === aliases[expected];
}

function completedResearchLevels(research, cityLevels = {}) {
  return Object.fromEntries(RESEARCH_FIELDS.map(field => {
    const category = field.replace(/Lv$/u, "");
    return [field, Math.max(number(cityLevels?.[field]), resolveCompletedResearchLevel(research, category))];
  }));
}

function settlementCapacity(village) {
  return Math.max(1, resolveVillageScaleDefinition(village)?.buildingCapacity || 1);
}

export function inspectV39Construction(state, player, definition, tile, mapData = window.__v39FieldRuntime?.mapData) {
  const village = normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race);
  const key = coordKey(tile?.x, tile?.y);
  const reasons = [];
  if (!village?.placed) reasons.push("拠点未配置");
  if (text(state?.territoryOwnerByTile?.[key]) !== text(player?.id)) reasons.push("自領ではない");
  if (!terrainConditionMet(definition?.terrainCondition, tile, mapData)) reasons.push(`地形条件: ${definition?.terrainCondition}`);
  const levels = completedResearchLevels(player?.factionState?.research, village?.cityLevels);
  for (const [field, required] of Object.entries(definition?.requirements || {})) if (number(levels[field]) < number(required)) reasons.push(`${field}${required}が必要`);
  const allNames = new Set([...(village?.buildings || []), ...(village?.constructionQueue || []).map(row => row.facilityName)]);
  if (allNames.has(definition?.name)) reasons.push("建設済みまたは建設中");
  const used = allNames.size;
  const capacity = settlementCapacity(village);
  if (used >= capacity) reasons.push(`施設枠不足 ${used}/${capacity}`);
  const shortage = Object.entries(definition?.cost || {}).filter(([keyName, cost]) => number(cost) > number(village?.materialStockByType?.[keyName]));
  if (shortage.length) reasons.push(`資材不足: ${shortage.map(([name]) => name).join("・")}`);
  return { available:reasons.length === 0, reasons, key, used, capacity, levels, village };
}

export function startV39Construction(state, playerId, facilityName, tile, mapData = window.__v39FieldRuntime?.mapData) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const definition = facilityDefinitions().find(row => row.name === text(facilityName));
  if (!player || !definition) return { ok:false, reason:"施設データが見つかりません", state };
  const check = inspectV39Construction(state, player, definition, tile, mapData);
  if (!check.available) return { ok:false, reason:check.reasons.join(" / "), state };
  const village = check.village;
  const materialStockByType = { ...village.materialStockByType };
  for (const key of MATERIAL_RESOURCE_KEYS) materialStockByType[key] = round1(Math.max(0, number(materialStockByType[key]) - number(definition.cost[key])));
  const turn = Math.max(1, Math.floor(number(state?.timeline?.turnNumber, 1)));
  const queueItem = { id:`construction-${player.id}-${definition.name}-${turn}-${check.key}`, facilityName:definition.name, tileKey:check.key, remainingTurns:definition.buildTurns, totalTurns:definition.buildTurns, startedTurn:turn };
  const nextVillage = normalizeV39Village({ ...village, materialStockByType, constructionQueue:[...village.constructionQueue, queueItem] }, player.race);
  const players = state.players.map(row => row.id === player.id ? {
    ...row,
    factionState:replaceFactionSettlement(row.factionState, nextVillage, { ownerPlayerId:row.id })
  } : row);
  return { ok:true, state:{ ...state, players }, queueItem, definition };
}

function facilityCityModifiers(buildings) {
  const byName = new Map(facilityDefinitions().map(def => [def.name, def]));
  const result = {};
  for (const name of buildings || []) {
    const definition = byName.get(name);
    if (definition?.scope !== "全体") continue;
    for (const [key, value] of Object.entries(definition.effects || {})) result[key] = round1(number(result[key]) + value);
  }
  return result;
}

function advanceConstruction(village) {
  const completed = [];
  const queue = [];
  const tileFacilityMap = { ...village.tileFacilityMap };
  const buildings = [...village.buildings];
  for (const item of village.constructionQueue) {
    const remainingTurns = item.remainingTurns - 1;
    if (remainingTurns > 0) { queue.push({ ...item, remainingTurns }); continue; }
    completed.push(item);
    if (!buildings.includes(item.facilityName)) buildings.push(item.facilityName);
    tileFacilityMap[item.tileKey] = [...new Set([...(tileFacilityMap[item.tileKey] || []), item.facilityName])];
  }
  return { village:{ ...village, constructionQueue:queue, buildings, tileFacilityMap, cityModifiers:facilityCityModifiers(buildings) }, completed };
}

export function advanceV39EconomyTurn(state, mapData = window.__v39FieldRuntime?.mapData) {
  if (!state || !mapData?.grid) return { state, reports:[], completed:[] };
  const reports = [];
  const completed = [];
  let facilitiesByTile = { ...(state.facilitiesByTile || {}) };
  let settlements = Array.isArray(state.settlements) ? state.settlements.map(row => ({ ...row })) : [];
  const players = state.players.map(player => {
    const currentTurn = Math.max(1, Math.floor(number(state?.timeline?.turnNumber, 1)));
    const processedSettlementIds = new Set();
    const originalSettlements = getFactionSettlements(player?.factionState);
    const selectedId = text(player?.factionState?.selectedSettlementId) || text(originalSettlements[0]?.settlementId);
    const nextSettlements = originalSettlements.map(sourceVillage => {
      let village = normalizeV39Village(sourceVillage, player?.race);
      if (!village?.placed || number(village?.lastEconomyDelta?.turn) >= currentTurn) return village;
      const settlementId = text(village.settlementId || village.id);
      processedSettlementIds.add(settlementId);
      const construction = advanceConstruction(village);
      village = normalizeV39Village(construction.village, player.race);
      for (const item of construction.completed) {
        facilitiesByTile[item.tileKey] = [...new Set([...(facilitiesByTile[item.tileKey] || []), item.facilityName])];
        completed.push({ ...item, playerId:player.id, settlementId });
      }
      const territoryIncome = collectV39TerritoryIncome(state, {
        ...player,
        factionState:replaceFactionSettlement(player.factionState, village, { ownerPlayerId:player.id })
      }, mapData);
      const assignedUnits = (player.factionState.units || []).filter(unit => {
        if (number(unit?.hp ?? unit?.currentHp) <= 0) return false;
        return text(unit?.settlementId || selectedId) === settlementId;
      });
      const beforeFood = { ...village.foodStockByType };
      const beforeMaterial = { ...village.materialStockByType };
      const populationResult = advanceV39PopulationEconomy({
        village,
        units:assignedUnits,
        income:territoryIncome.food,
        resourceKeys:FOOD_RESOURCE_KEYS,
        normalFoodKeys:NORMAL_FOOD_RESOURCE_KEYS,
        populationCapacity:territoryIncome.populationCapacity
      });
      const materialStockByType = { ...village.materialStockByType };
      for (const key of MATERIAL_RESOURCE_KEYS) materialStockByType[key] = round1(number(materialStockByType[key]) + number(territoryIncome.material[key]));
      village = normalizeV39Village({
        ...village,
        ...populationResult,
        materialStockByType,
        populationCapacity:territoryIncome.populationCapacity,
        employmentSlots:territoryIncome.employmentSlots,
        employmentRate:territoryIncome.employmentRate
      }, player.race);
      village.lastEconomyDelta = {
        food:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key => [key, round1(number(village.foodStockByType[key]) - number(beforeFood[key]))])),
        material:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key => [key, round1(number(village.materialStockByType[key]) - number(beforeMaterial[key]))])),
        population:populationResult.populationDelta,
        populationByRace:populationResult.populationChanges,
        shortage:populationResult.shortageTotal,
        employmentRate:territoryIncome.employmentRate,
        turn:state.timeline?.turnNumber
      };
      const scale = resolveVillageScaleLabel(village);
      settlements = settlements.map(row => text(row.id || row.settlementId) === settlementId
        ? { ...row, type:scale, population:village.population }
        : row);
      reports.push({ playerId:player.id, settlementId, territoryIncome, shortage:populationResult.shortageTotal, populationDelta:populationResult.populationDelta, village });
      return village;
    }).filter(Boolean);
    const selectedSettlement = nextSettlements.find(row => text(row.settlementId || row.id) === selectedId) || nextSettlements[0] || null;
    const settlementById = new Map(nextSettlements.map(row => [text(row.settlementId || row.id), row]));
    const units = (player?.factionState?.units || []).map(unit => {
      const settlementId = text(unit?.settlementId || selectedId);
      const growth = settlementById.get(settlementId)?.populationGrowthByRace?.[text(unit?.race)] || {};
      const starvationStage = Math.max(0, Math.min(4, Math.floor(number(growth?.starvationStage))));
      const resourceExhausted = growth?.remainingTurns === 0;
      if (!processedSettlementIds.has(settlementId) || !resourceExhausted || number(unit?.hp ?? unit?.currentHp) <= 0) {
        return { ...unit, starvationStage, starvationApCap:starvationStage >= 4 ? 80 : 0, starvationPenaltyRate:starvationStage >= 4 ? 0.15 : 0 };
      }
      const maxHp = Math.max(1, number(unit?.maxHp, unit?.status?.HP || 1));
      const hp = Math.max(0, number(unit?.hp ?? unit?.currentHp, maxHp) - Math.max(1, Math.floor(maxHp * 0.05)));
      return {
        ...unit,
        hp,
        currentHp:hp,
        starvationStage,
        starvationApCap:starvationStage >= 4 ? 80 : 0,
        starvationPenaltyRate:starvationStage >= 4 ? 0.15 : 0,
        lastStarvationDamageTurn:currentTurn,
        ...(hp <= 0 ? { state:"死亡", deathCause:"飢餓", deathTurn:currentTurn, diedAtTurn:currentTurn } : {})
      };
    });
    return {
      ...player,
      factionState:{ ...player.factionState, units, settlements:nextSettlements, selectedSettlementId:text(selectedSettlement?.settlementId || selectedSettlement?.id) }
    };
  });
  const enemyEconomy = advanceEnemyNestEconomy({ ...state, players }, mapData, Math.max(1, Math.floor(number(state?.timeline?.turnNumber, 1))));
  return { state:{ ...state, players, facilitiesByTile, settlements, ...enemyEconomy }, reports, completed };
}

export function buildV39ResourceSnapshot(village) {
  const normalized = normalizeV39Village(village);
  if (!normalized) return null;
  const delta = normalized.lastEconomyDelta || { food:{}, material:{} };
  return Object.fromEntries(Object.entries(RESOURCE_GROUPS).map(([groupKey, group]) => [groupKey, {
    title:group.title,
    icon:group.icon,
    items:group.keys.map(name => ({ name, icon:"◆", value:number(normalized.foodStockByType[name] ?? normalized.materialStockByType[name]), delta:number(delta.food?.[name] ?? delta.material?.[name]), rare:!["食料", "木材", "石材", "金属"].includes(String(RESOURCE_DEFINITION_ROWS.find(row => String(row?.データ分類 || "").trim() === name)?.分類 || "")) }))
  }]));
}
