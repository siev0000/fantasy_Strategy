import { classData, enemySpawnData } from "../../lib/game-data-registry.js";
import { applyV39DerivedCharacterData } from "../unit/v39-character-derived-rules.js";
import { getFactionSettlements } from "../../lib/settlement-state.js";
import { formatV39NestName, V39_INITIAL_NEST_TERRITORY_RADIUS } from "../../lib/v39-nest-rules.js";
import { isSovereignUnit } from "../../composables/unitCoreUtils.js";

const SAFE_DISTANCE_FROM_BASE = 4;
const LOW_LEVEL_DISTANCE_FROM_BASE = 10;
const LOW_LEVEL_MAX = 10;
const DEFAULT_ENEMY_SPAWN_TILE_DIVISOR = 40;
const MIN_ENEMY_SPAWN_TILE_DIVISOR = 20;
const MAX_ENEMY_SPAWN_TILE_DIVISOR = 60;
const TERRAIN_LEVEL_BASE = 5;
const TERRAIN_LEVEL_STEP = 5;
const TERRAIN_LEVEL_VARIANCE = 5;
const STRONG_TERRAIN_LEVEL_BONUS = 1;
const STRONG_GROUP_CHANCE_WITHOUT_COUNT = 0.3;
const STRONG_RANDOM_MINION_MIN = 2;
const STRONG_RANDOM_MINION_MAX = 4;
const DEFAULT_STRONG_TERRITORY_RADIUS = V39_INITIAL_NEST_TERRITORY_RADIUS;
const INITIAL_SPAWN_TYPES = new Set(["通常", "強敵", "強敵配下"]);

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

function isInitialSpawnEnemy(enemy) {
  return INITIAL_SPAWN_TYPES.has(text(enemy?.spawnType));
}

function hasInitialSpawnEnemies(state) {
  return (Array.isArray(state?.enemies) ? state.enemies : []).some(isInitialSpawnEnemy);
}

function preserveNonInitialEnemyState(state) {
  const enemies = (Array.isArray(state?.enemies) ? state.enemies : []).filter(enemy => !isInitialSpawnEnemy(enemy));
  const enemyIds = new Set(enemies.map(enemy => text(enemy?.id)).filter(Boolean));
  const enemyNests = (Array.isArray(state?.enemyNests) ? state.enemyNests : []).filter(nest => {
    const unitIds = Array.isArray(nest?.unitIds) ? nest.unitIds.map(text).filter(Boolean) : [];
    return unitIds.some(id => enemyIds.has(id)) || nest?.victoryGuard === true || !!text(nest?.victoryLandmarkKey);
  });
  const nestIds = new Set(enemyNests.map(nest => text(nest?.id)).filter(Boolean));
  const enemySquads = (Array.isArray(state?.enemySquads) ? state.enemySquads : []).filter(squad => {
    const unitIds = Array.isArray(squad?.unitIds) ? squad.unitIds.map(text).filter(Boolean) : [];
    return unitIds.some(id => enemyIds.has(id)) || nestIds.has(text(squad?.nestId));
  });
  return { enemies, enemyNests, enemySquads };
}

function enemySpawnTileDivisor() {
  const runtimeValue = Number(window.__v39FieldRuntime?.settings?.enemySpawnTileDivisor);
  const fieldSettingValue = Number(window.getV39FieldSettings?.()?.enemySpawnTileDivisor);
  const configured = Number.isFinite(runtimeValue) ? runtimeValue : fieldSettingValue;
  if (!Number.isFinite(configured)) return DEFAULT_ENEMY_SPAWN_TILE_DIVISOR;
  return Math.max(
    MIN_ENEMY_SPAWN_TILE_DIVISOR,
    Math.min(MAX_ENEMY_SPAWN_TILE_DIVISOR, Math.round(configured))
  );
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

function closestBaseDistance(settlements, point, w, h, wrapEnabled) {
  const bases = (Array.isArray(settlements) ? settlements : []).filter(row => row?.placed);
  if (!bases.length) return Number.POSITIVE_INFINITY;
  return Math.min(...bases.map(base => wrappedHexDistance(base, point, w, h, wrapEnabled)));
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
  const definitionId = text(row?.ID ?? row?.id);
  const name = text(row?.種族名);
  const race = text(row?.種族);
  // 種族未設定の行は制作途中として扱い、敵出現候補には含めない。
  if (!race) return null;
  const className = text(row?.サブクラス, race);
  const terrain = text(row?.出現地形);
  const minLevel = integer(row?.Lv_Min, 0);
  const maxLevel = integer(row?.Lv_Max, 0);
  if (!definitionId || !name || !terrain || minLevel <= 0 || maxLevel < minLevel) return null;
  if (!classNames.has(race) || !classNames.has(className)) return null;
  return { row, definitionId, name, race, className, terrain, minLevel, maxLevel };
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

function isStrongMonsterTile(data, x, y) {
  return Boolean(data?.strongMonsterInfoMap?.[y]?.[x] || data?.strongMonsterMap?.[y]?.[x]);
}

function terrainLevelRange(data, x, y, distanceFromBase, strong = false) {
  const rawHeightLevel = number(data?.heightLevelMap?.[y]?.[x], 0);
  const absoluteHeightLevel = Math.abs(Math.trunc(rawHeightLevel));
  const effectiveTerrainLevel = absoluteHeightLevel + (strong ? STRONG_TERRAIN_LEVEL_BONUS : 0);
  const baseLevel = TERRAIN_LEVEL_BASE + (TERRAIN_LEVEL_STEP * effectiveTerrainLevel);
  const minLevel = Math.max(1, baseLevel - TERRAIN_LEVEL_VARIANCE);
  let maxLevel = baseLevel;

  // 既存ルール: 初期拠点10マス以内はLv10以下。
  if (distanceFromBase <= LOW_LEVEL_DISTANCE_FROM_BASE) {
    maxLevel = Math.min(maxLevel, LOW_LEVEL_MAX);
  }
  if (maxLevel < minLevel) return null;

  return {
    rawHeightLevel,
    absoluteHeightLevel,
    effectiveTerrainLevel,
    baseLevel,
    minLevel,
    maxLevel
  };
}

function intersectDefinitionLevel(definition, levelRange) {
  if (!definition || !levelRange) return null;
  const minLevel = Math.max(definition.minLevel, levelRange.minLevel);
  const maxLevel = Math.min(definition.maxLevel, levelRange.maxLevel);
  if (maxLevel < minLevel) return null;
  return { definition, minLevel, maxLevel };
}

function buildSpawnCandidate(data, settlements, x, y, w, h, wrapEnabled) {
  const definitions = definitionsForTile(data, x, y);
  if (!definitions.length) return null;

  const distance = closestBaseDistance(settlements, { x, y }, w, h, wrapEnabled);
  if (distance <= SAFE_DISTANCE_FROM_BASE) return null;

  const strong = isStrongMonsterTile(data, x, y);
  const levelRange = terrainLevelRange(data, x, y, distance, strong);
  if (!levelRange) return null;

  const eligibleDefinitions = definitions
    .map(definition => intersectDefinitionLevel(definition, levelRange))
    .filter(Boolean);
  if (!eligibleDefinitions.length) return null;

  return {
    x,
    y,
    distance,
    strong,
    levelRange,
    eligibleDefinitions,
    strongMonsterInfo: strong ? (data?.strongMonsterInfoMap?.[y]?.[x] || null) : null
  };
}

function chooseEnemyDefinition(candidate, random) {
  if (!candidate?.eligibleDefinitions?.length) return null;
  return candidate.eligibleDefinitions[Math.floor(random() * candidate.eligibleDefinitions.length)] || null;
}

function chooseEnemyLevel(selection, random) {
  if (!selection) return null;
  return selection.minLevel + Math.floor(random() * ((selection.maxLevel - selection.minLevel) + 1));
}

function parseMinionNames(value) {
  if (Array.isArray(value)) return [...new Set(value.map(item => text(item)).filter(Boolean))];
  const raw = text(value);
  if (!raw) return [];
  return [...new Set(raw.split(/[、,，;；|｜\/\n]+/).map(item => text(item)).filter(Boolean))];
}

function configuredMinionCount(definition) {
  const raw = definition?.row?.出現数;
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const parsed = integer(raw, Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function buildStrongGroupPlan(selection, random) {
  const definition = selection?.definition;
  if (!definition) return { groupType:"単独", minionCount:0, minionNames:[], countSource:"none" };

  const explicitCount = configuredMinionCount(definition);
  const minionNames = parseMinionNames(definition.row?.配下);
  const resolvedNames = minionNames.length ? minionNames : [definition.name];

  if (explicitCount !== null) {
    return {
      groupType:"群体",
      minionCount:explicitCount,
      minionNames:resolvedNames,
      countSource:"出現数",
      minionSource:minionNames.length ? "配下" : "同種"
    };
  }

  if (random() >= STRONG_GROUP_CHANCE_WITHOUT_COUNT) {
    return { groupType:"単独", minionCount:0, minionNames:[], countSource:"7:3抽選", minionSource:"none" };
  }

  const minionCount = STRONG_RANDOM_MINION_MIN
    + Math.floor(random() * ((STRONG_RANDOM_MINION_MAX - STRONG_RANDOM_MINION_MIN) + 1));
  return {
    groupType:"群体",
    minionCount,
    minionNames:resolvedNames,
    countSource:"7:3抽選",
    minionSource:minionNames.length ? "配下" : "同種"
  };
}

function strongTerritoryRadius(candidate) {
  return Math.max(1, integer(candidate?.strongMonsterInfo?.territoryRadius, DEFAULT_STRONG_TERRITORY_RADIUS));
}

function buildStrongMinionCandidates(data, settlements, strongCandidate, minionNames, w, h, wrapEnabled, occupied) {
  const desiredNames = new Set((Array.isArray(minionNames) ? minionNames : []).map(item => text(item)).filter(Boolean));
  if (!desiredNames.size) return [];

  const radius = strongTerritoryRadius(strongCandidate);
  const center = { x:strongCandidate.x, y:strongCandidate.y };
  const candidates = [];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const key = coordKey(x, y);
      if (occupied.has(key)) continue;
      const distanceFromLeader = wrappedHexDistance(center, { x, y }, w, h, wrapEnabled);
      if (distanceFromLeader <= 0 || distanceFromLeader > radius) continue;

      const distanceFromBase = closestBaseDistance(settlements, { x, y }, w, h, wrapEnabled);
      if (distanceFromBase <= SAFE_DISTANCE_FROM_BASE) continue;

      // 配下は強敵補正を受けず、その配置マスの通常敵Lv帯を使用する。
      const levelRange = terrainLevelRange(data, x, y, distanceFromBase, false);
      if (!levelRange) continue;

      const eligibleDefinitions = definitionsForTile(data, x, y)
        .filter(definition => desiredNames.has(definition.name))
        .map(definition => intersectDefinitionLevel(definition, levelRange))
        .filter(Boolean);
      if (!eligibleDefinitions.length) continue;

      candidates.push({
        x,
        y,
        distance:distanceFromBase,
        distanceFromLeader,
        strong:false,
        levelRange,
        eligibleDefinitions,
        strongMonsterInfo: strongCandidate.strongMonsterInfo
      });
    }
  }

  return candidates;
}

function createEnemy(selection, position, level, index, metadata = {}) {
  const definition = selection?.definition;
  if (!definition) return null;
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
    sourceDefinitionId:definition.definitionId
  });
  if (!derived?.derivedCharacter?.ok) return null;
  const maxHp = Math.max(1, Math.round(number(derived.maxHp ?? derived.status?.HP, 1)));
  const strongEnemy = metadata.strongEnemy === true || (metadata.strongEnemy !== false && position.strong === true);
  return {
    ...derived,
    hp:maxHp,
    currentHp:maxHp,
    maxHp,
    ap:100,
    currentAp:100,
    maxAp:100,
    state:"生存",
    spawnType:text(metadata.spawnType, strongEnemy ? "強敵" : "通常"),
    strongEnemy,
    strongMinion:metadata.strongMinion === true,
    strongGroupId:text(metadata.strongGroupId) || null,
    strongLeaderId:text(metadata.strongLeaderId) || null,
    strongGroupType:text(metadata.strongGroupType) || null,
    strongGroupExpectedMinionCount:Number.isFinite(Number(metadata.strongGroupExpectedMinionCount))
      ? Math.max(0, integer(metadata.strongGroupExpectedMinionCount))
      : null,
    strongGroupCountSource:text(metadata.strongGroupCountSource) || null,
    strongGroupMinionSource:text(metadata.strongGroupMinionSource) || null,
    nestType:text(definition.row?.巣) || null,
    nestId:text(metadata.nestId) || null,
    enemySquadId:text(metadata.enemySquadId) || null,
    territoryCenterX:Number.isFinite(Number(metadata.territoryCenterX)) ? integer(metadata.territoryCenterX) : null,
    territoryCenterY:Number.isFinite(Number(metadata.territoryCenterY)) ? integer(metadata.territoryCenterY) : null,
    territoryRadius:Number.isFinite(Number(metadata.territoryRadius)) ? Math.max(1, integer(metadata.territoryRadius)) : null,
    terrainHeightLevel:position.levelRange?.rawHeightLevel ?? 0,
    effectiveTerrainLevel:position.levelRange?.effectiveTerrainLevel ?? 0,
    terrainEnemyLevelMin:position.levelRange?.minLevel ?? level,
    terrainEnemyLevelMax:position.levelRange?.maxLevel ?? level,
    strongMonsterInfo:position.strongMonsterInfo ? { ...position.strongMonsterInfo } : null
  };
}

// 地形別の出現敵定義を持たないイベント用。能力計算は通常敵と同じ派生処理へ統一する。
export function createV39EventEnemy({ id, name, race, className, level, x, y, metadata = {} } = {}) {
  const derived = applyV39DerivedCharacterData({
    id:text(id) || `event-enemy-${Date.now()}`,
    name:text(name) || text(className) || "イベント敵",
    race:text(race),
    className:text(className),
    level:Math.max(1, integer(level, 1)),
    x:integer(x),
    y:integer(y),
    role:"敵",
    image:text(metadata?.image),
    aggressive:metadata?.aggressive !== false,
    spawnTerrain:text(metadata?.spawnTerrain),
    sourceDefinitionId:text(metadata?.sourceDefinitionId)
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
    state:"生存",
    spawnType:text(metadata?.spawnType, "イベント"),
    aggressive:metadata?.aggressive !== false,
    strongEnemy:false,
    strongMinion:false,
    nestType:null,
    nestId:null,
    enemySquadId:text(metadata?.enemySquadId),
    territoryCenterX:null,
    territoryCenterY:null,
    territoryRadius:null,
    sourceDefinitionId:text(metadata?.sourceDefinitionId),
    naturalSource:text(metadata?.naturalSource),
    naturalSpawnTurn:integer(metadata?.naturalSpawnTurn),
    isUndead:metadata?.isUndead === true
  };
}

function spawnStrongGroup(data, settlements, candidate, selection, level, enemies, occupied, w, h, wrapEnabled, random) {
  const plan = buildStrongGroupPlan(selection, random);
  const groupId = `strong-group-${candidate.x}-${candidate.y}`;
  const nestId = `enemy-nest-${groupId}`;
  const enemySquadId = `enemy-squad-${groupId}`;
  const territoryRadius = strongTerritoryRadius(candidate);
  const boss = createEnemy(selection, candidate, level, enemies.length, {
    strongEnemy:true,
    spawnType:"強敵",
    strongGroupId:groupId,
    strongGroupType:plan.groupType,
    strongGroupExpectedMinionCount:plan.minionCount,
    strongGroupCountSource:plan.countSource,
    strongGroupMinionSource:plan.minionSource,
    nestId,
    enemySquadId,
    territoryCenterX:candidate.x,
    territoryCenterY:candidate.y,
    territoryRadius
  });
  if (!boss) return { boss:null, minionCount:0, expectedMinionCount:plan.minionCount };

  enemies.push(boss);
  occupied.add(coordKey(candidate.x, candidate.y));
  if (plan.groupType !== "群体" || plan.minionCount <= 0) {
    return { boss, minionCount:0, expectedMinionCount:0 };
  }

  const minionCandidates = shuffle(
    buildStrongMinionCandidates(data, settlements, candidate, plan.minionNames, w, h, wrapEnabled, occupied),
    random
  );
  let minionCount = 0;

  for (const minionCandidate of minionCandidates) {
    if (minionCount >= plan.minionCount) break;
    if (occupied.has(coordKey(minionCandidate.x, minionCandidate.y))) continue;
    const minionSelection = chooseEnemyDefinition(minionCandidate, random);
    const minionLevel = chooseEnemyLevel(minionSelection, random);
    if (minionLevel === null) continue;
    const minion = createEnemy(minionSelection, minionCandidate, minionLevel, enemies.length, {
      strongEnemy:false,
      strongMinion:true,
      spawnType:"強敵配下",
      strongGroupId:groupId,
      strongLeaderId:boss.id,
      strongGroupType:"群体",
      strongGroupExpectedMinionCount:plan.minionCount,
      strongGroupCountSource:plan.countSource,
      strongGroupMinionSource:plan.minionSource,
      nestId,
      enemySquadId,
      territoryCenterX:candidate.x,
      territoryCenterY:candidate.y,
      territoryRadius
    });
    if (!minion) continue;
    enemies.push(minion);
    occupied.add(coordKey(minionCandidate.x, minionCandidate.y));
    minionCount += 1;
  }

  if (minionCount < plan.minionCount) {
    console.warn(
      `[v39-enemy-spawn] strong group ${boss.name} requested ${plan.minionCount} minions but placed ${minionCount}; matching terrain/level tiles were insufficient.`
    );
  }

  return { boss, minionCount, expectedMinionCount:plan.minionCount };
}

function buildEnemyNestAndSquadState(enemies) {
  const groups = new Map();
  const nests = [];
  const enemySquads = [];

  for (const enemy of enemies) {
    const enemyId = text(enemy?.id);
    if (!enemyId) continue;
    const initialNestEligible = enemy?.strongEnemy === true
      || enemy?.strongMinion === true
      || !!text(enemy?.strongGroupId);

    if (!initialNestEligible || !text(enemy?.nestType)) {
      const enemySquadId = text(enemy?.enemySquadId) || `enemy-squad-single-${enemyId}`;
      enemy.nestId = null;
      enemy.enemySquadId = enemySquadId;
      enemy.territoryCenterX = null;
      enemy.territoryCenterY = null;
      enemy.territoryRadius = null;
      enemySquads.push({
        id:enemySquadId,
        nestId:"",
        unitIds:[enemyId],
        cargo:{ resourcesByType:{}, equipmentInventory:[] }
      });
      continue;
    }

    const key = text(enemy?.strongGroupId) || `single-${enemyId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(enemy);
  }

  const sequenceByRace = new Map();
  for (const [groupKey, members] of groups) {
    const anchor = members.find(enemy => enemy?.strongEnemy === true) || members[0];
    const nestId = text(anchor?.nestId) || `enemy-nest-${groupKey}`;
    const enemySquadId = text(anchor?.enemySquadId) || `enemy-squad-${groupKey}`;
    const hasCenterX = anchor?.territoryCenterX !== null
      && anchor?.territoryCenterX !== undefined
      && String(anchor.territoryCenterX).trim() !== ""
      && Number.isFinite(Number(anchor.territoryCenterX));
    const hasCenterY = anchor?.territoryCenterY !== null
      && anchor?.territoryCenterY !== undefined
      && String(anchor.territoryCenterY).trim() !== ""
      && Number.isFinite(Number(anchor.territoryCenterY));
    const x = hasCenterX ? integer(anchor.territoryCenterX) : integer(anchor?.x);
    const y = hasCenterY ? integer(anchor.territoryCenterY) : integer(anchor?.y);
    const territoryRadius = Math.max(
      1,
      integer(anchor?.territoryRadius, V39_INITIAL_NEST_TERRITORY_RADIUS)
    );
    const race = text(anchor?.race || anchor?.sourceRace, anchor?.name || "モンスター");
    const sequence = (sequenceByRace.get(race) || 0) + 1;
    sequenceByRace.set(race, sequence);
    for (const member of members) {
      member.nestId = nestId;
      member.enemySquadId = enemySquadId;
      member.territoryCenterX = x;
      member.territoryCenterY = y;
      member.territoryRadius = territoryRadius;
    }
    nests.push({
      id:nestId,
      name:formatV39NestName(race, sequence),
      nestType:text(anchor?.nestType),
      race,
      sourceDefinitionId:text(anchor?.sourceDefinitionId),
      squadId:enemySquadId,
      scaleLevel:1,
      scaleName:"村",
      militaryLevel:1,
      x,
      y,
      territoryRadius,
      population:members.length,
      unitIds:members.map(member => text(member?.id)).filter(Boolean),
      everHadUnits:members.length > 0,
      foodStockByType:{},
      materialStockByType:{},
      equipmentInventory:[]
    });
    enemySquads.push({
      id:enemySquadId,
      nestId,
      unitIds:members.map(member => text(member?.id)).filter(Boolean),
      cargo:{ resourcesByType:{}, equipmentInventory:[] }
    });
  }
  return { enemyNests:nests, enemySquads };
}

function collectEnemySpawnPlan(data, settlements) {
  const w = Math.max(1, integer(data?.w, 1));
  const h = Math.max(1, integer(data?.h, 1));
  const wrapEnabled = data?.worldWrapEnabled !== false
    && window.__v39FieldRuntime?.settings?.islandCustomSettings?.worldWrapEnabled !== false;
  const normalCandidates = [];
  const strongCandidates = [];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const candidate = buildSpawnCandidate(data, settlements, x, y, w, h, wrapEnabled);
      if (!candidate) continue;
      if (candidate.strong) strongCandidates.push(candidate);
      else normalCandidates.push(candidate);
    }
  }

  const tileDivisor = enemySpawnTileDivisor();
  const spawnableTileCount = normalCandidates.length + strongCandidates.length;
  const desiredTotalCount = spawnableTileCount
    ? Math.max(1, Math.round(spawnableTileCount / tileDivisor))
    : 0;
  // 強敵候補はマップ生成側ですでに希少地点として抽選済みなので優先して実体化する。
  // 敵密度設定は通常敵+強敵本体の基準数に使い、強敵の配下は群体構成として別枠で追加する。
  const desiredNormalCount = Math.max(0, desiredTotalCount - strongCandidates.length);

  const settlementSeed = (Array.isArray(settlements) ? settlements : []).reduce((seed, settlement, index) => (
    seed
    ^ Math.imul(integer(settlement?.x) + index + 1, 83492791)
    ^ Math.imul(integer(settlement?.y) + index + 1, 19349663)
  ), 0);
  const seed = (w * 73856093) ^ (h * 19349663) ^ settlementSeed;
  const random = seededRandom(seed);
  const enemies = [];
  const occupied = new Set();

  for (const candidate of shuffle(strongCandidates, random)) {
    const selection = chooseEnemyDefinition(candidate, random);
    const level = chooseEnemyLevel(selection, random);
    if (level === null) continue;
    spawnStrongGroup(data, settlements, candidate, selection, level, enemies, occupied, w, h, wrapEnabled, random);
  }

  let normalSpawned = 0;
  for (const candidate of shuffle(normalCandidates, random)) {
    if (normalSpawned >= desiredNormalCount) break;
    if (occupied.has(coordKey(candidate.x, candidate.y))) continue;
    const selection = chooseEnemyDefinition(candidate, random);
    const level = chooseEnemyLevel(selection, random);
    if (level === null) continue;
    const enemy = createEnemy(selection, candidate, level, enemies.length);
    if (!enemy) continue;
    enemies.push(enemy);
    occupied.add(coordKey(candidate.x, candidate.y));
    normalSpawned += 1;
  }

  return {
    enemies,
    diagnostics:{
      width:w,
      height:h,
      settlementCount:Array.isArray(settlements) ? settlements.length : 0,
      normalCandidateCount:normalCandidates.length,
      strongCandidateCount:strongCandidates.length,
      spawnableTileCount,
      tileDivisor,
      desiredTotalCount,
      desiredNormalCount,
      spawnedCount:enemies.length,
      strongSpawnedCount:enemies.filter(enemy => enemy?.strongEnemy === true).length,
      normalSpawnedCount:enemies.filter(enemy => enemy?.spawnType === "通常").length
    }
  };
}

function buildEnemies(data, settlements) {
  return collectEnemySpawnPlan(data, settlements).enemies;
}

function initialSettlementTargetCount(faction) {
  const plans = Array.isArray(faction?.initialSettlementPlans)
    ? faction.initialSettlementPlans.filter(row => row && typeof row === "object")
    : [];
  return Math.max(1, integer(faction?.initialSettlementCount, plans.length || 1));
}

function playerHasSovereign(player) {
  return Array.isArray(player?.factionState?.units)
    && player.factionState.units.some(unit => isSovereignUnit(unit));
}

function allInitialPlacementsComplete(state) {
  const players = (Array.isArray(state?.players) ? state.players : []).filter(playerHasSovereign);
  if (!players.length) return false;
  return players.every(player => {
    const faction = player?.factionState;
    const placedCount = getFactionSettlements(faction).filter(row => row?.placed).length;
    return placedCount >= initialSettlementTargetCount(faction);
  });
}

let ensureSpawnTimer = null;

function ensureInitialEnemiesSpawned(reason = "initial-placement-check") {
  window.clearTimeout(ensureSpawnTimer);
  ensureSpawnTimer = window.setTimeout(() => {
    const data = window.__v39FieldRuntime?.mapData;
    const state = window.getV39GameState?.();
    if (!data || !state) return;
    if (hasInitialSpawnEnemies(state)) return;
    if (!allInitialPlacementsComplete(state)) return;

    const enemies = spawnForActivePlayer();
    if (!enemies.length) {
      console.warn("[v39-enemy-spawn] 初期配置完了後も敵を生成できませんでした", {
        reason,
        validDefinitionCount:[...definitionsByTerrain.values()].reduce((sum, rows) => sum + rows.length, 0),
        settlementCount:(state.players || []).flatMap(player =>
          getFactionSettlements(player?.factionState).filter(row => row?.placed)
        ).length,
        mapSize:[data?.w, data?.h]
      });
    }
  }, 0);
}

function spawnForActivePlayer() {
  const data = window.__v39FieldRuntime?.mapData;
  const state = window.getV39GameState?.();
  const settlements = (state?.players || [])
    .flatMap(player => getFactionSettlements(player?.factionState).filter(row => row?.placed));
  if (!data || !state || !settlements.length) return [];
  const spawnPlan = collectEnemySpawnPlan(data, settlements);
  const initialEnemies = spawnPlan.enemies;
  const initialState = buildEnemyNestAndSquadState(initialEnemies);
  const preserved = preserveNonInitialEnemyState(state);
  const enemies = [...preserved.enemies, ...initialEnemies];
  const enemyNests = [...preserved.enemyNests, ...initialState.enemyNests];
  const enemySquads = [...preserved.enemySquads, ...initialState.enemySquads];
  const strongCount = initialEnemies.filter(enemy => enemy?.strongEnemy === true).length;
  const strongMinionCount = initialEnemies.filter(enemy => enemy?.strongMinion === true).length;
  const strongGroupCount = new Set(
    initialEnemies.filter(enemy => enemy?.strongEnemy === true && enemy?.strongGroupType === "群体")
      .map(enemy => enemy?.strongGroupId)
      .filter(Boolean)
  ).size;
  window.setV39GameState?.({
    enemies,
    enemySquads,
    enemyNests,
    enemyCombatRuntime:{ pendingActionsByEnemyId:{}, lastActionTurnByEnemyId:{}, cooldownsByEnemyId:{}, activeEffectsByEnemyId:{}, decisionLogsByFactionId:{} }
  }, { reason:"enemy-spawned" });
  window.dispatchEvent(new CustomEvent("v39:enemies-spawned", {
    detail:{
      count:initialEnemies.length,
      totalEnemyCount:enemies.length,
      preservedEnemyCount:preserved.enemies.length,
      nestCount:enemyNests.length,
      strongCount,
      strongMinionCount,
      strongGroupCount,
      tileDivisor:enemySpawnTileDivisor(),
      baseCount:settlements.length,
      diagnostics:spawnPlan.diagnostics
    }
  }));
  return initialEnemies;
}

function clearEnemiesForNewField() {
  const state = window.getV39GameState?.();
  if (!state || (!state.enemies?.length && !state.enemyNests?.length)) return;
  window.setV39GameState?.({
    enemies:[],
    enemySquads:[],
    enemyNests:[],
    enemyCombatRuntime:{ pendingActionsByEnemyId:{}, lastActionTurnByEnemyId:{}, cooldownsByEnemyId:{}, activeEffectsByEnemyId:{}, decisionLogsByFactionId:{} }
  }, { reason:"field-enemies-cleared" });
}

window.addEventListener("v39:field-generated", clearEnemiesForNewField);
window.addEventListener("v39:initial-placement-complete", () => ensureInitialEnemiesSpawned("initial-placement-complete"));
window.addEventListener("v39:initial-settlement-placed", () => ensureInitialEnemiesSpawned("initial-settlement-placed"));
window.addEventListener("v39:bootstrap-complete", () => ensureInitialEnemiesSpawned("bootstrap-complete"));
window.spawnV39Enemies = spawnForActivePlayer;
window.ensureV39InitialEnemiesSpawned = ensureInitialEnemiesSpawned;
window.inspectV39EnemySpawn = () => {
  const data = window.__v39FieldRuntime?.mapData;
  const state = window.getV39GameState?.();
  const settlements = (state?.players || [])
    .flatMap(player => getFactionSettlements(player?.factionState).filter(row => row?.placed));
  if (!data || !state) return { ok:false, reason:"field-or-state-missing" };
  const plan = collectEnemySpawnPlan(data, settlements);
  return {
    ok:true,
    allInitialPlacementsComplete:allInitialPlacementsComplete(state),
    currentEnemyCount:Array.isArray(state.enemies) ? state.enemies.length : 0,
    initialSpawnEnemyCount:(Array.isArray(state.enemies) ? state.enemies : []).filter(isInitialSpawnEnemy).length,
    validDefinitionCount:[...definitionsByTerrain.values()].reduce((sum, rows) => sum + rows.length, 0),
    ...plan.diagnostics
  };
};
window.getV39EnemySpawnRules = () => ({
  safeDistanceFromBase:SAFE_DISTANCE_FROM_BASE,
  lowLevelDistanceFromBase:LOW_LEVEL_DISTANCE_FROM_BASE,
  lowLevelMax:LOW_LEVEL_MAX,
  enemySpawnTileDivisor:enemySpawnTileDivisor(),
  enemySpawnTileDivisorMin:MIN_ENEMY_SPAWN_TILE_DIVISOR,
  enemySpawnTileDivisorMax:MAX_ENEMY_SPAWN_TILE_DIVISOR,
  terrainLevelBase:TERRAIN_LEVEL_BASE,
  terrainLevelStep:TERRAIN_LEVEL_STEP,
  terrainLevelVariance:TERRAIN_LEVEL_VARIANCE,
  strongTerrainLevelBonus:STRONG_TERRAIN_LEVEL_BONUS,
  strongGroupChanceWithoutCount:STRONG_GROUP_CHANCE_WITHOUT_COUNT,
  strongRandomMinionMin:STRONG_RANDOM_MINION_MIN,
  strongRandomMinionMax:STRONG_RANDOM_MINION_MAX,
  defaultStrongTerritoryRadius:DEFAULT_STRONG_TERRITORY_RADIUS,
  useAbsoluteHeightLevel:true,
  validDefinitionCount:[...definitionsByTerrain.values()].reduce((sum, rows) => sum + rows.length, 0)
});
