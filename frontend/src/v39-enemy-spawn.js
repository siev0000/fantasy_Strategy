import { classData, enemySpawnData } from "./lib/game-data-registry.js";
import { applyV39DerivedCharacterData } from "./v39-character-derived-rules.js";
import { getSelectedSettlement } from "./lib/settlement-state.js";

const SAFE_DISTANCE_FROM_BASE = 4;
const LOW_LEVEL_DISTANCE_FROM_BASE = 10;
const LOW_LEVEL_MAX = 10;
const LAND_TILES_PER_ENEMY = 120;
const MIN_ENEMY_COUNT = 8;
const MAX_ENEMY_COUNT = 30;

const classNames = new Set(classData.map(row => text(row?.名前)).filter(Boolean));

function text(value, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  return Math.floor(number(value, fallback));
}

function coordKey(x, y) {
  return `${integer(x)},${integer(y)}`;
}

function cubeCoord(x, y) {
  const q = x - ((y - (y & 1)) / 2);
  const r = y;
  return { x:q, y:-q-r, z:r };
}

function directHexDistance(a, b) {
  const ac = cubeCoord(integer(a?.x), integer(a?.y));
  const bc = cubeCoord(integer(b?.x), integer(b?.y));
  return Math.max(Math.abs(ac.x-bc.x), Math.abs(ac.y-bc.y), Math.abs(ac.z-bc.z));
}

function wrappedHexDistance(a, b, w, h, wrapEnabled) {
  if (!wrapEnabled) return directHexDistance(a, b);
  let best = Number.POSITIVE_INFINITY;
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      best = Math.min(best, directHexDistance(a, { x:integer(b?.x)+ox, y:integer(b?.y)+oy }));
    }
  }
  return best;
}

function seededRandom(seedValue) {
  let state = (integer(seedValue, 1) >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffle(list, random) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function validDefinition(row) {
  const name = text(row?.種族名);
  const race = text(row?.種族);
  // 種族未設定の行は制作途中として扱い、敵出現候補には含めない。
  if (!race) return null;
  const className = text(row?.サブクラス, race);
  const terrain = text(row?.出現地形);
  const minLevel = integer(row?.Lv_Min, 0);
  const maxLevel = integer(row?.Lv_Max, 0);
  if (!name || !terrain || minLevel <= 0 || maxLevel < minLevel) return null;
  if (!classNames.has(race) || !classNames.has(className)) return null;
  return { row, name, race, className, terrain, minLevel, maxLevel };
}

const definitionsByTerrain = new Map();
for (const row of enemySpawnData) {
  const definition = validDefinition(row);
  if (!definition) continue;
  if (!definitionsByTerrain.has(definition.terrain)) definitionsByTerrain.set(definition.terrain, []);
  definitionsByTerrain.get(definition.terrain).push(definition);
}

function tileTerrainKeys(data, x, y) {
  const keys = new Set();
  const values = [data?.grid?.[y]?.[x], data?.reliefMap?.[y]?.[x], data?.specialMap?.[y]?.[x]];
  for (const value of values) {
    const key = text(value);
    if (key) keys.add(key);
  }
  if (data?.lavaMap?.[y]?.[x]) keys.add("溶岩");
  if (data?.riverData?.riverSet?.has?.(coordKey(x, y))) keys.add("河川");
  return [...keys];
}

function definitionsForTile(data, x, y) {
  const rows = [];
  for (const terrain of tileTerrainKeys(data, x, y)) {
    rows.push(...(definitionsByTerrain.get(terrain) || []));
  }
  return rows;
}

function chooseLevel(definition, distanceFromBase, random) {
  let maxLevel = definition.maxLevel;
  if (distanceFromBase <= LOW_LEVEL_DISTANCE_FROM_BASE) {
    maxLevel = Math.min(maxLevel, LOW_LEVEL_MAX);
  }
  if (maxLevel < definition.minLevel) return null;
  return definition.minLevel + Math.floor(random() * ((maxLevel - definition.minLevel) + 1));
}

function createEnemy(definition, position, level, index) {
  const derived = applyV39DerivedCharacterData({
    id:`enemy-${index + 1}-${position.x}-${position.y}`,
    name:definition.name,
    race:definition.race,
    className:definition.className,
    level,
    x:position.x,
    y:position.y,
    role:"敵",
    image:text(definition.row?.画像),
    aggressive:definition.row?.好戦的 === true,
    spawnTerrain:definition.terrain,
    sourceDefinition:{ ...definition.row }
  });
  if (!derived?.derivedCharacter?.ok) return null;
  const maxHp = Math.max(1, Math.round(number(derived.maxHp ?? derived.status?.HP, 1)));
  return {
    ...derived,
    hp:maxHp,
    currentHp:maxHp,
    maxHp,
    ap:100,
    currentAp:100,
    maxAp:100,
    state:"生存"
  };
}

function buildEnemies(data, village) {
  const w = Math.max(1, integer(data?.w, 1));
  const h = Math.max(1, integer(data?.h, 1));
  const wrapEnabled = data?.worldWrapEnabled !== false
    && window.__v39FieldRuntime?.settings?.islandCustomSettings?.worldWrapEnabled !== false;
  const candidates = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const definitions = definitionsForTile(data, x, y);
      if (!definitions.length) continue;
      const distance = wrappedHexDistance(village, { x, y }, w, h, wrapEnabled);
      if (distance <= SAFE_DISTANCE_FROM_BASE) continue;
      candidates.push({ x, y, distance, definitions });
    }
  }

  const desiredCount = Math.max(MIN_ENEMY_COUNT, Math.min(MAX_ENEMY_COUNT, Math.round(candidates.length / LAND_TILES_PER_ENEMY)));
  const seed = (w * 73856093) ^ (h * 19349663) ^ (integer(village?.x) * 83492791) ^ integer(village?.y);
  const random = seededRandom(seed);
  const enemies = [];
  for (const candidate of shuffle(candidates, random)) {
    if (enemies.length >= desiredCount) break;
    const validDefinitions = candidate.definitions.filter(definition => chooseLevel(definition, candidate.distance, () => 0) !== null);
    if (!validDefinitions.length) continue;
    const definition = validDefinitions[Math.floor(random() * validDefinitions.length)];
    const level = chooseLevel(definition, candidate.distance, random);
    const enemy = createEnemy(definition, candidate, level, enemies.length);
    if (enemy) enemies.push(enemy);
  }
  return enemies;
}

function spawnForActivePlayer() {
  const data = window.__v39FieldRuntime?.mapData;
  const state = window.getV39GameState?.();
  const faction = window.getV39ActiveFactionState?.();
  const village = getSelectedSettlement(faction);
  if (!data || !state || !village?.placed) return [];
  const enemies = buildEnemies(data, village);
  window.setV39GameState?.({
    enemies,
    enemyCombatRuntime:{ pendingActionsByEnemyId:{}, lastActionAtMsByEnemyId:{}, cooldownsByEnemyId:{}, activeEffectsByEnemyId:{} }
  }, { reason:"enemy-spawned" });
  window.dispatchEvent(new CustomEvent("v39:enemies-spawned", { detail:{ count:enemies.length } }));
  return enemies;
}

function clearEnemiesForNewField() {
  const state = window.getV39GameState?.();
  if (!state || !state.enemies?.length) return;
  window.setV39GameState?.({
    enemies:[],
    enemyCombatRuntime:{ pendingActionsByEnemyId:{}, lastActionAtMsByEnemyId:{}, cooldownsByEnemyId:{}, activeEffectsByEnemyId:{} }
  }, { reason:"field-enemies-cleared" });
}

window.addEventListener("v39:field-generated", clearEnemiesForNewField);
window.addEventListener("v39:initial-placement-complete", spawnForActivePlayer);
window.spawnV39Enemies = spawnForActivePlayer;
window.getV39EnemySpawnRules = () => ({
  safeDistanceFromBase:SAFE_DISTANCE_FROM_BASE,
  lowLevelDistanceFromBase:LOW_LEVEL_DISTANCE_FROM_BASE,
  lowLevelMax:LOW_LEVEL_MAX,
  landTilesPerEnemy:LAND_TILES_PER_ENEMY,
  validDefinitionCount:[...definitionsByTerrain.values()].reduce((sum, rows) => sum + rows.length, 0)
});
