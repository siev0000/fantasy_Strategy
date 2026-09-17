import { resolveUnitCreateMode } from "../composables/militaryUnitUtils.js";
import { getVillageScaleDefinitions } from "../composables/villageCoreUtils.js";
import { FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS, NORMAL_FOOD_RESOURCE_KEYS } from "./v39-economy-rules.js";
import { getGameDataRows } from "./game-data-registry.js";
import { getHexDistance, getHexNeighborCoords } from "./hex-grid.js";
import { isV39NestFoodShortage } from "./v39-enemy-exploration.js";
import { formatV39NestName, nextV39NestSequence, resolveV39NestRadiusForScale } from "./v39-nest-rules.js";
import { resolveV39ConsumableFoodKeys } from "./v39-population-economy.js";
import { canUnitEnterV39Tile } from "./v39-terrain-traversal.js";
import { getV39UnitCreationCost } from "./v39-unit-creation-rules.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const round1 = value => Math.round(number(value) * 10) / 10;
const keyOf = value => `${integer(value?.x)},${integer(value?.y)}`;

function deterministicRatio(key) {
  let hash = 2166136261;
  for (const char of String(key || "")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296;
}

function terrainName(mapData, x, y) {
  const raw = mapData?.grid?.[y]?.[x];
  return text(raw?.name || raw?.type || raw?.terrain || raw);
}

function occupiedKeys(state, ignoredNestId = "") {
  return new Set([
    ...(state?.players || []).flatMap(player => player?.factionState?.units || []).filter(unit => number(unit?.hp ?? unit?.currentHp) > 0),
    ...(state?.enemies || []).filter(unit => number(unit?.hp ?? unit?.currentHp) > 0),
    ...(state?.settlements || []),
    ...(state?.enemyNests || []).filter(nest => text(nest?.id) !== text(ignoredNestId))
  ].map(keyOf));
}

function spawnPosition(state, mapData, nest, template) {
  const occupied = occupiedKeys(state, nest.id);
  const center = { x:integer(nest.x), y:integer(nest.y), key:keyOf(nest) };
  const candidates = [center, ...getHexNeighborCoords(mapData.w, mapData.h, center.x, center.y, mapData.worldWrapEnabled !== false)];
  return candidates.find(tile => !occupied.has(tile.key) && canUnitEnterV39Tile(mapData, tile.x, tile.y, template)) || null;
}

function cloneSpawnedEnemy(template, nest, position, turnNumber, sequence) {
  const maxHp = Math.max(1, number(template?.maxHp, template?.status?.HP || 1));
  return {
    ...structuredClone(template),
    id:`${text(nest.id)}-unit-${Math.max(1, integer(turnNumber))}-${sequence}`,
    name:`${text(template?.name, nest.race)}${sequence}`,
    x:position.x,
    y:position.y,
    hp:maxHp,
    currentHp:maxHp,
    maxHp,
    ap:100,
    currentAp:100,
    actionPoint:100,
    state:"生存",
    nestId:text(nest.id),
    enemySquadId:text(nest.squadId, `enemy-squad-${text(nest.id)}`),
    territoryCenterX:integer(nest.x),
    territoryCenterY:integer(nest.y),
    territoryRadius:integer(nest.territoryRadius, 2),
    explorationState:null,
    fleeState:null,
    fleeDecisionMade:false,
    aggroTargetUnitId:"",
    lastMovedTurn:0,
    lastCombatTurn:0,
    deathTurn:null,
    diedAtTurn:null,
    deathCause:""
  };
}

function canPay(nest, cost, populationCost) {
  if (integer(nest.population) <= populationCost) return false;
  return Object.entries(cost).every(([key, amount]) => number((FOOD_RESOURCE_KEYS.includes(key) ? nest.foodStockByType : nest.materialStockByType)?.[key]) >= amount);
}

function paySpawnCost(nest, cost, populationCost) {
  const foodStockByType = { ...(nest.foodStockByType || {}) };
  const materialStockByType = { ...(nest.materialStockByType || {}) };
  for (const [key, amount] of Object.entries(cost)) {
    const bag = FOOD_RESOURCE_KEYS.includes(key) ? foodStockByType : materialStockByType;
    bag[key] = round1(Math.max(0, number(bag[key])-amount));
  }
  const race = text(nest.race, Object.keys(nest.populationByRace || {})[0]);
  const populationByRace = { ...(nest.populationByRace || {}) };
  populationByRace[race] = Math.max(0, integer(populationByRace[race], nest.population)-populationCost);
  return { ...nest, population:Math.max(0, integer(nest.population)-populationCost), populationByRace, foodStockByType, materialStockByType };
}

function addUnitToSquad(enemySquads, nest, enemy) {
  const squadId = text(nest.squadId, `enemy-squad-${text(nest.id)}`);
  const found = enemySquads.some(row => text(row?.id) === squadId);
  return found
    ? enemySquads.map(row => text(row?.id) === squadId ? { ...row, nestId:nest.id, unitIds:[...new Set([...(row.unitIds || []), enemy.id])] } : row)
    : [...enemySquads, { id:squadId, nestId:nest.id, unitIds:[enemy.id], cargo:{ resourcesByType:{}, equipmentInventory:[] } }];
}

function addResourceBags(...bags) {
  const result = {};
  for (const bag of bags) for (const [key, value] of Object.entries(bag || {})) {
    result[key] = round1(number(result[key]) + number(value));
  }
  return result;
}

function mergeNestLoot(groundLootByTile, nest) {
  const key = keyOf(nest);
  const current = groundLootByTile[key] || {};
  return {
    ...groundLootByTile,
    [key]:{
      ...current,
      discoveredByPlayerIds:[...(current.discoveredByPlayerIds || [])],
      cargo:{
        resourcesByType:addResourceBags(current.cargo?.resourcesByType, nest.foodStockByType, nest.materialStockByType),
        equipmentInventory:[...(current.cargo?.equipmentInventory || []), ...(nest.equipmentInventory || [])]
      }
    }
  };
}

function resolveDefeatedNests(state, turnNumber) {
  let working = { ...state };
  const reports = [];
  for (const defeated of [...(working.enemyNests || [])]) {
    const winnerId = text(defeated?.lastAttackedByNestId);
    if (!winnerId || integer(defeated?.lastNestCombatTurn) < integer(turnNumber)-1) continue;
    const winner = working.enemyNests.find(nest => text(nest?.id) === winnerId);
    if (!winner) continue;
    const defenders = working.enemies.filter(enemy => text(enemy?.nestId) === text(defeated.id)
      && number(enemy?.hp, enemy?.currentHp) > 0
      && getHexDistance(enemy, defeated) <= Math.max(1, integer(defeated.territoryRadius, 2)));
    if (defenders.length) {
      working.enemyNests = working.enemyNests.map(nest => text(nest?.id) === text(defeated.id)
        ? { ...nest, lastAttackedByNestId:"", lastNestCombatTurn:null }
        : nest);
      continue;
    }
    const sameRace = text(winner?.race) === text(defeated?.race);
    const survivingIds = working.enemies.filter(enemy => text(enemy?.nestId) === text(defeated.id) && number(enemy?.hp, enemy?.currentHp) > 0)
      .map(enemy => text(enemy.id));
    if (sameRace) {
      const populationByRace = { ...(winner.populationByRace || {}) };
      for (const [race, amount] of Object.entries(defeated.populationByRace || {})) populationByRace[race] = integer(populationByRace[race]) + integer(amount);
      const mergedWinner = {
        ...winner,
        population:integer(winner.population) + integer(defeated.population),
        populationByRace,
        foodStockByType:addResourceBags(winner.foodStockByType, defeated.foodStockByType),
        materialStockByType:addResourceBags(winner.materialStockByType, defeated.materialStockByType),
        equipmentInventory:[...(winner.equipmentInventory || []), ...(defeated.equipmentInventory || [])],
        unitIds:[...new Set([...(winner.unitIds || []), ...survivingIds])]
      };
      working.enemyNests = working.enemyNests.map(nest => text(nest?.id) === winnerId ? mergedWinner : nest)
        .filter(nest => text(nest?.id) !== text(defeated.id));
      working.enemies = working.enemies.map(enemy => text(enemy?.nestId) === text(defeated.id) && number(enemy?.hp, enemy?.currentHp) > 0 ? {
        ...enemy,
        nestId:winnerId,
        enemySquadId:text(winner.squadId),
        territoryCenterX:integer(winner.x),
        territoryCenterY:integer(winner.y),
        territoryRadius:integer(winner.territoryRadius, 2)
      } : enemy);
      working.enemySquads = working.enemySquads.filter(squad => text(squad?.nestId) !== text(defeated.id));
      const winnerSquad = working.enemySquads.find(squad => text(squad?.nestId) === winnerId);
      working.enemySquads = winnerSquad
        ? working.enemySquads.map(squad => text(squad?.id) === text(winnerSquad.id) ? { ...squad, unitIds:[...new Set([...(squad.unitIds || []), ...survivingIds])] } : squad)
        : [...working.enemySquads, { id:text(winner.squadId, `enemy-squad-${winnerId}`), nestId:winnerId, unitIds:survivingIds, cargo:{ resourcesByType:{}, equipmentInventory:[] } }];
      reports.push({ type:"absorbed", nestId:defeated.id, winnerNestId:winnerId, name:defeated.name });
    } else {
      working.groundLootByTile = mergeNestLoot(working.groundLootByTile || {}, defeated);
      working.enemyNests = working.enemyNests.filter(nest => text(nest?.id) !== text(defeated.id));
      working.enemySquads = working.enemySquads.filter(squad => text(squad?.nestId) !== text(defeated.id));
      working.enemies = working.enemies.map(enemy => text(enemy?.nestId) === text(defeated.id) && number(enemy?.hp, enemy?.currentHp) > 0
        ? { ...enemy, nestId:"", enemySquadId:"", territoryCenterX:integer(enemy.x), territoryCenterY:integer(enemy.y) }
        : enemy);
      reports.push({ type:"destroyed", nestId:defeated.id, winnerNestId:winnerId, name:defeated.name, lootTile:keyOf(defeated) });
    }
  }
  return { state:working, reports };
}

function foodScore(mapData, x, y, race) {
  const terrain = getGameDataRows("地形").find(row => text(row?.地形) === terrainName(mapData, x, y));
  const keys = resolveV39ConsumableFoodKeys(race, FOOD_RESOURCE_KEYS, NORMAL_FOOD_RESOURCE_KEYS);
  return keys.reduce((sum, key) => sum + Math.max(0, number(terrain?.[key])), 0);
}

function fissionPosition(state, mapData, nest, template) {
  const occupied = occupiedKeys(state);
  const candidates = [];
  for (let y=0; y<mapData.h; y+=1) for (let x=0; x<mapData.w; x+=1) {
    const key = `${x},${y}`;
    if (occupied.has(key) || !canUnitEnterV39Tile(mapData, x, y, template)) continue;
    const validDistance = (state.enemyNests || []).every(other => {
      if (keyOf(other) === key) return false;
      const distance = getHexDistance({ x, y }, other);
      return text(other?.race) === text(nest?.race) ? distance >= 1 : distance >= 4;
    });
    if (!validDistance) continue;
    candidates.push({ x, y, key, score:foodScore(mapData, x, y, nest.race), distance:getHexDistance(nest, { x, y }) });
  }
  return candidates.sort((a, b) => b.score-a.score || a.distance-b.distance || a.key.localeCompare(b.key))[0] || null;
}

function advanceNestGrowth(state, mapData, nest, template, turnNumber) {
  const definitions = getVillageScaleDefinitions();
  const currentLevel = Math.max(1, integer(nest.scaleLevel, 1));
  const nextScale = definitions.find(row => row.level === currentLevel + 1) || null;
  const threshold = nextScale ? Math.ceil(nextScale.minPopulation * 0.9) : Number.POSITIVE_INFINITY;
  if (isV39NestFoodShortage(nest) || integer(nest.population) < threshold) return { nest, createdNest:null };
  const chooseFission = !nextScale || deterministicRatio(`${nest.id}:${turnNumber}:growth`) >= 0.5;
  if (!chooseFission) {
    return { nest:{ ...nest, scaleLevel:nextScale.level, scaleName:nextScale.name, territoryRadius:resolveV39NestRadiusForScale(nextScale.level), lastGrowthTurn:turnNumber }, createdNest:null };
  }
  const position = fissionPosition(state, mapData, nest, template);
  if (!position) return { nest, createdNest:null };
  const movedPopulation = Math.max(1, Math.floor(integer(nest.population)*0.25));
  const foodStockByType = {};
  const parentFood = { ...(nest.foodStockByType || {}) };
  for (const [key, value] of Object.entries(parentFood)) {
    const moved = round1(number(value)*0.25);
    foodStockByType[key] = moved;
    parentFood[key] = round1(number(value)-moved);
  }
  const race = text(nest.race, "モンスター");
  const sequence = nextV39NestSequence(state.enemyNests, race);
  const id = `${text(nest.id)}-child-${Math.max(1, integer(turnNumber))}-${sequence}`;
  const createdNest = {
    id,
    name:formatV39NestName(race, sequence),
    nestType:nest.nestType,
    race,
    x:position.x,
    y:position.y,
    territoryRadius:resolveV39NestRadiusForScale(1),
    scaleLevel:1,
    scaleName:definitions[0]?.name || "村",
    population:movedPopulation,
    populationByRace:{ [race]:movedPopulation },
    populationGrowthByRace:{},
    unitIds:[],
    squadId:`enemy-squad-${id}`,
    sourceDefinitionId:text(nest.sourceDefinitionId || template?.sourceDefinitionId),
    foodStockByType,
    materialStockByType:{},
    equipmentInventory:[],
    pendingSpawnCount:0,
    economyInitialized:true,
    createdAtTurn:turnNumber
  };
  return {
    nest:{ ...nest, population:Math.max(0, integer(nest.population)-movedPopulation), populationByRace:{ ...(nest.populationByRace || {}), [race]:Math.max(0, integer(nest.populationByRace?.[race], nest.population)-movedPopulation) }, foodStockByType:parentFood, lastGrowthTurn:turnNumber },
    createdNest
  };
}

export function advanceV39EnemyNestLifecycle(state, mapData, turnNumber) {
  if (!state || !mapData?.grid) return { state, reports:[] };
  let working = { ...state, enemies:[...(state.enemies || [])], enemyNests:[...(state.enemyNests || [])], enemySquads:[...(state.enemySquads || [])], groundLootByTile:{ ...(state.groundLootByTile || {}) } };
  const defeated = resolveDefeatedNests(working, turnNumber);
  working = defeated.state;
  const reports = [...defeated.reports];
  const spawnMode = resolveUnitCreateMode("army", 1);
  const populationCost = Math.max(1, integer(spawnMode?.populationCost, 4));
  const cost = getV39UnitCreationCost(1);
  for (const original of [...working.enemyNests]) {
    let nest = working.enemyNests.find(row => text(row?.id) === text(original?.id));
    if (!nest || integer(nest.lastLifecycleTurn) >= integer(turnNumber)) continue;
    const templates = working.enemies.filter(enemy => text(enemy?.nestId) === text(nest.id) || (nest.sourceDefinitionId && text(enemy?.sourceDefinitionId) === text(nest.sourceDefinitionId)));
    const template = templates[0];
    if (!template) {
      working.enemyNests = working.enemyNests.map(row => text(row?.id) === text(nest.id) ? { ...row, lastLifecycleTurn:turnNumber } : row);
      continue;
    }
    const growth = advanceNestGrowth(working, mapData, nest, template, turnNumber);
    nest = growth.nest;
    if (growth.createdNest) {
      working.enemyNests.push(growth.createdNest);
      working.enemySquads.push({ id:growth.createdNest.squadId, nestId:growth.createdNest.id, unitIds:[], cargo:{ resourcesByType:{}, equipmentInventory:[] } });
      reports.push({ type:"fission", nestId:nest.id, createdNestId:growth.createdNest.id, name:growth.createdNest.name });
    } else if (integer(nest.scaleLevel, 1) !== integer(original.scaleLevel, 1)) {
      working.enemies = working.enemies.map(enemy => text(enemy?.nestId) === text(nest.id) ? { ...enemy, territoryRadius:nest.territoryRadius } : enemy);
      reports.push({ type:"growth", nestId:nest.id, scaleLevel:nest.scaleLevel, territoryRadius:nest.territoryRadius });
    }

    let pending = Math.max(0, integer(nest.pendingSpawnCount));
    const shortage = isV39NestFoodShortage(nest);
    if (!shortage && pending <= 0 && canPay(nest, cost, populationCost)) {
      nest = paySpawnCost(nest, cost, populationCost);
      pending = 1;
    }
    if (pending > 0) {
      const position = spawnPosition(working, mapData, nest, template);
      if (position) {
        const sequence = working.enemies.filter(enemy => text(enemy?.nestId) === text(nest.id)).length + 1;
        const enemy = cloneSpawnedEnemy(template, nest, position, turnNumber, sequence);
        working.enemies.push(enemy);
        working.enemySquads = addUnitToSquad(working.enemySquads, nest, enemy);
        nest = { ...nest, unitIds:[...new Set([...(nest.unitIds || []), enemy.id])], everHadUnits:true, pendingSpawnCount:pending-1 };
        reports.push({ type:"spawn", nestId:nest.id, enemyId:enemy.id, position });
      } else nest = { ...nest, pendingSpawnCount:pending };
    }
    nest = { ...nest, lastLifecycleTurn:turnNumber };
    working.enemyNests = working.enemyNests.map(row => text(row?.id) === text(nest.id) ? nest : row);
  }
  return { state:working, reports };
}
