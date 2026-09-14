import { getGameDataRows } from "./game-data-registry.js";
import { resolveCompletedResearchLevel } from "./research-progress.js";
import {
  addToResourceBag,
  applyVillageEconomyTurn,
  buildEmptyResourceBag,
  buildPopulationFoodDemand,
  buildUnitUpkeepFoodDemand,
  collectTerritoryIncome,
  multiplyResourceBag,
  normalizeResourceBag,
  sumResourceBag
} from "../composables/resourceEconomyUtils.js";
import { adjustVillagePopulationForTurn, resolveVillageScaleLabel } from "../composables/villageCoreUtils.js";

const RESOURCE_DEFINITION_ROWS = getGameDataRows("都市基本データ")
  .filter(row => ["食料", "木材", "石材", "金属", "貴金属", "宝石", "特殊資源"].includes(String(row?.分類 || "").trim()));
const resourceKeysFor = categories => Object.freeze([...new Set(RESOURCE_DEFINITION_ROWS
  .filter(row => categories.includes(String(row?.分類 || "").trim()))
  .map(row => String(row?.データ分類 || "").trim()).filter(Boolean))]);

export const FOOD_RESOURCE_KEYS = resourceKeysFor(["食料", "特殊資源"]);
export const MATERIAL_RESOURCE_KEYS = resourceKeysFor(["木材", "石材", "金属", "貴金属", "宝石"]);
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
const ECONOMY_CONSUMPTION_SCALE = 0.1;
const FOOD_SUBSTITUTE_MULTIPLIER = 1.2;
const INITIAL_STOCK_TURNS = 3;
const SETTLEMENT_NAMES = new Set(["村", "町", "都市", "大都市"]);
const RESEARCH_FIELDS = Object.freeze(["鍛冶Lv", "魔法Lv", "信仰Lv", "軍事Lv", "経済Lv"]);
const FACILITY_NON_EFFECT_FIELDS = new Set([
  "施設名", "条件地形", "詳細", "建築時間", "建築数", "影響範囲",
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

function classDefinitionForRace(race) {
  const target = text(race);
  const factionRace = text(factionDefinition(target)?.種族);
  return getGameDataRows("クラス").find(row => text(row?.名前) === target)
    || getGameDataRows("クラス").find(row => text(row?.名前) === factionRace)
    || null;
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
    foodStockByType,
    materialStockByType,
    foodStock:sumResourceBag(foodStockByType, FOOD_RESOURCE_KEYS, { roundTo1:round1 }),
    materialStock:sumResourceBag(materialStockByType, MATERIAL_RESOURCE_KEYS, { roundTo1:round1 }),
    cityLevels:{ 鍛冶Lv:0, 魔法Lv:0, 信仰Lv:0, 軍事Lv:0, 経済Lv:0, ...(village.cityLevels || {}) },
    buildings:[...new Set((Array.isArray(village.buildings) ? village.buildings : []).map(text).filter(Boolean))],
    tileFacilityMap,
    constructionQueue,
    equipmentInventory:Array.isArray(village.equipmentInventory) ? village.equipmentInventory.map(row => ({ ...row, item:row?.item && typeof row.item === "object" ? { ...row.item } : row?.item })) : [],
    lastEconomyDelta:village.lastEconomyDelta && typeof village.lastEconomyDelta === "object" ? { ...village.lastEconomyDelta } : null
  };
}

function resolveTileTerrain(data, x, y) {
  if (data?.lavaMap?.[y]?.[x]) return "溶岩";
  return text(data?.specialMap?.[y]?.[x]) || text(data?.grid?.[y]?.[x]);
}

function territoryKeysForPlayer(state, playerId) {
  return Object.entries(state?.territoryOwnerByTile || {})
    .filter(([, owner]) => text(owner) === text(playerId))
    .map(([key]) => key);
}

function tileModeMultiplier(village, key) {
  const homeKey = village?.placed ? coordKey(village.x, village.y) : "";
  const mode = text(village?.territoryTileModeMap?.[key]) || (key === homeKey ? "settlement" : "resource");
  return mode === "settlement" ? 1 : 2;
}

function collectDiscoveredFeatureIncome(raw, player, ownedSet, village) {
  const discovered = player?.factionState?.exploration?.discoveredFeaturesByTile || {};
  const terrainYieldMap = new Map(getGameDataRows("地形").map(row => [text(row?.地形), row]));
  for (const [key, site] of Object.entries(discovered)) {
    if (!ownedSet.has(key)) continue;
    const row = terrainYieldMap.get(text(site?.featureName));
    if (!row) continue;
    const multiplier = tileModeMultiplier(village, key);
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

export function collectV39TerritoryIncome(state, player, mapData = window.__v39FieldRuntime?.mapData) {
  const village = normalizeV39Village(player?.factionState?.village, player?.race);
  const ownedSet = new Set(territoryKeysForPlayer(state, player?.id));
  const terrainYieldMap = new Map(getGameDataRows("地形").map(row => [text(row?.地形), row]));
  const raw = collectTerritoryIncome(mapData, ownedSet, FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS, {
    roundTo1:round1,
    parseCoordKey:key => { const [x, y] = text(key).split(",").map(Number); return { x, y }; },
    resolveTileTerrainForYield:resolveTileTerrain,
    resolveTileYieldMultiplier:({ key }) => tileModeMultiplier(village, key),
    resolveResourceYieldMultiplier:({ key, resourceKey, row }) => number(row?.[resourceKey]) > 0
      ? resolveV39FacilityYieldMultiplier(village, key, resourceKey)
      : 1,
    terrainYieldMap
  });
  collectDiscoveredFeatureIncome(raw, player, ownedSet, village);
  return {
    food:multiplyResourceBag(raw.food, ECONOMY_GAIN_SCALE, FOOD_RESOURCE_KEYS, { roundTo1:round1 }),
    material:multiplyResourceBag(raw.material, ECONOMY_GAIN_SCALE, MATERIAL_RESOURCE_KEYS, { roundTo1:round1 }),
    tiles:raw.tiles
  };
}

export function createInitialV39Village({ x, y, name = "拠点", race = "只人", state, player, mapData } = {}) {
  const base = normalizeV39Village({
    id:`village-${Math.floor(number(x))}-${Math.floor(number(y))}`,
    name, x:Math.floor(number(x)), y:Math.floor(number(y)), placed:true,
    population:initialPopulationForRace(race),
    populationByRace:{ [text(race) || "只人"]:initialPopulationForRace(race) },
    foodStockByType:{}, materialStockByType:{}, buildings:[], tileFacilityMap:{}, constructionQueue:{}
  }, race);
  const sourcePlayer = { ...(player || {}), race, factionState:{ ...(player?.factionState || {}), village:base } };
  const income = collectV39TerritoryIncome(state, sourcePlayer, mapData);
  base.foodStockByType = multiplyResourceBag(income.food, INITIAL_STOCK_TURNS, FOOD_RESOURCE_KEYS, { roundTo1:round1 });
  base.materialStockByType = multiplyResourceBag(income.material, INITIAL_STOCK_TURNS, MATERIAL_RESOURCE_KEYS, { roundTo1:round1 });
  return normalizeV39Village(base, race);
}

function raceFoodProfile(race) {
  const row = classDefinitionForRace(race);
  const profile = buildEmptyResourceBag(FOOD_RESOURCE_KEYS);
  for (const key of FOOD_RESOURCE_KEYS) profile[key] = round1(Math.max(0, number(row?.[key]) / 10));
  return profile;
}

export function facilityDefinitions() {
  return getGameDataRows("施設").filter(row => text(row?.施設名) && !SETTLEMENT_NAMES.has(text(row?.施設名))).map(row => ({
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

function hexDistance(a, b) {
  const cube = point => { const q = point.x - (point.y - (point.y & 1)) / 2; return [q, -q - point.y, point.y]; };
  const aa = cube(a), bb = cube(b);
  return Math.max(...aa.map((value, index) => Math.abs(value - bb[index])));
}

function neighborCoords(x, y) {
  const offsets = y % 2 ? [[-1,0],[1,0],[0,-1],[1,-1],[0,1],[1,1]] : [[-1,0],[1,0],[-1,-1],[0,-1],[-1,1],[0,1]];
  return offsets.map(([dx, dy]) => ({ x:x + dx, y:y + dy }));
}

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
  const stage = resolveVillageScaleLabel(village);
  const row = getGameDataRows("施設").find(item => text(item?.施設名) === stage);
  return Math.max(1, Math.floor(number(row?.建築数, 3)));
}

export function inspectV39Construction(state, player, definition, tile, mapData = window.__v39FieldRuntime?.mapData) {
  const village = normalizeV39Village(player?.factionState?.village, player?.race);
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
  const players = state.players.map(row => row.id === player.id ? { ...row, factionState:{ ...row.factionState, village:nextVillage } } : row);
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
    let village = normalizeV39Village(player?.factionState?.village, player?.race);
    if (!village?.placed) return player;
    const currentTurn = Math.max(1, Math.floor(number(state?.timeline?.turnNumber, 1)));
    if (number(village?.lastEconomyDelta?.turn) >= currentTurn) return player;
    const construction = advanceConstruction(village);
    village = normalizeV39Village(construction.village, player.race);
    for (const item of construction.completed) {
      facilitiesByTile[item.tileKey] = [...new Set([...(facilitiesByTile[item.tileKey] || []), item.facilityName])];
      completed.push({ ...item, playerId:player.id });
    }
    const territoryIncome = collectV39TerritoryIncome(state, { ...player, factionState:{ ...player.factionState, village } }, mapData);
    const unitDemand = multiplyResourceBag(buildUnitUpkeepFoodDemand(
      (player.factionState.units || []).filter(unit => number(unit?.hp ?? unit?.currentHp) > 0),
      FOOD_RESOURCE_KEYS, raceFoodProfile, { roundTo1:round1 }
    ), ECONOMY_CONSUMPTION_SCALE, FOOD_RESOURCE_KEYS, { roundTo1:round1 });
    const populationDemand = multiplyResourceBag(buildPopulationFoodDemand(village, FOOD_RESOURCE_KEYS, raceFoodProfile, { roundTo1:round1 }), ECONOMY_CONSUMPTION_SCALE, FOOD_RESOURCE_KEYS, { roundTo1:round1 });
    const beforeFood = { ...village.foodStockByType };
    const beforeMaterial = { ...village.materialStockByType };
    const core = applyVillageEconomyTurn(village, {
      territoryIncome,
      buildingIncome:{ food:buildEmptyResourceBag(FOOD_RESOURCE_KEYS), material:buildEmptyResourceBag(MATERIAL_RESOURCE_KEYS), count:village.buildings.length },
      unitUpkeepDemand:unitDemand,
      populationDemand,
      foodKeys:FOOD_RESOURCE_KEYS,
      materialKeys:MATERIAL_RESOURCE_KEYS,
      fallbackMultiplier:FOOD_SUBSTITUTE_MULTIPLIER,
      adjustVillagePopulationForTurn:(target, shortage) => adjustVillagePopulationForTurn(target, shortage, {
        selectedRaceFallback:player.race,
        randomInt:(min, max) => shortage > 0 ? Math.min(-1, max) : Math.max(1, min)
      })
    }, { roundTo1:round1 });
    village = normalizeV39Village(core.village, player.race);
    village.lastEconomyDelta = {
      food:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key => [key, round1(number(village.foodStockByType[key]) - number(beforeFood[key]))])),
      material:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key => [key, round1(number(village.materialStockByType[key]) - number(beforeMaterial[key]))])),
      population:core.populationDelta,
      shortage:core.shortageTotal,
      turn:state.timeline?.turnNumber
    };
    const scale = resolveVillageScaleLabel(village);
    settlements = settlements.map(row => text(row.ownerPlayerId) === text(player.id) ? { ...row, type:scale, population:village.population } : row);
    reports.push({ playerId:player.id, territoryIncome, shortage:core.shortageTotal, populationDelta:core.populationDelta, village });
    return { ...player, factionState:{ ...player.factionState, village } };
  });
  return { state:{ ...state, players, facilitiesByTile, settlements }, reports, completed };
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
