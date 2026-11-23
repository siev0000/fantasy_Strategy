import {classData, facilityData} from './game-data-registry.js';
import {getV39PlayableRaceDefinitions} from './v39-race-definitions.js';
import {createTerrainMapData, terrainDefinitions} from './map-generator.js';
import {v39SpecialtyDefinitions} from './v39-specialty-rules.js';
import {buildV39ClassEquipment, buildV39UnitEntity} from './v39-unit-creation-rules.js';
import {createInitialV39Village, normalizeV39Village} from './v39-economy-rules.js';
import {normalizeV39NeutralVillage} from './v39-neutral-village-rules.js';
import {createPlayerFactionState} from './player-state.js';
import {createV39DefenseStructure} from './v39-defense-rules.js';
import {V39_DEFENSE_BALANCE} from './v39-gameplay-balance.js';
import {isV39WallEdge,v39WallEdgeKey} from './v39-wall-edges.js';

export const FIXED_MAP_KIND = 'fantasy-strategy-fixed-map';
export const FIXED_MAP_MIN = 6;
export const FIXED_MAP_MAX = 100;
export const fixedMapTerrains = terrainDefinitions;
export const fixedMapRaces = getV39PlayableRaceDefinitions();
export const fixedMapClasses = classData.filter(row => row.名前 && row.HP > 0 && /系$/.test(row.種類 ?? ''));
export const fixedMapFacilities = facilityData.filter(row => row.施設名 && row.分類 !== '拠点規模').map(row => row.施設名);
export const fixedMapResources = v39SpecialtyDefinitions();
const terrainNames = new Set(fixedMapTerrains.map(row => row.key));
const raceNames = new Set(fixedMapRaces.map(row => row.key));
const classesByName = new Map(fixedMapClasses.map(row => [row.名前, row]));
const facilityNames = new Set(fixedMapFacilities);
const wallRules = V39_DEFENSE_BALANCE.facilityWalls;
const resourcesByName = new Map(fixedMapResources.map(row => [row.名前, row]));
const terrainBlocked = new Set(['海', '湖', '火山', '溶岩']);
const range = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const validName = name => typeof name === 'string' && name.trim().length > 0 && name.length <= 80;
const validId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,48}$/.test(id) && !Object.hasOwn(Object.prototype,id);
const matrix = (w, h, fill) => Array.from({length:h}, () => Array(w).fill(fill));
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
export const fixedMapTileKey = (x, y) => `${x},${y}`;
export const fixedMapTileCoords = key => key.split(',').map(Number);
export const fixedMapCanPlace = terrain => terrainNames.has(terrain) && !terrainBlocked.has(terrain);

function fixedMapBaseKey(data, key) {
  const tile = data.tiles[key];
  return tile?.base ? key : tile?.territory;
}

export function inspectV39FixedMapPlacement(data, factionId, tile, placement) {
  const key = fixedMapTileKey(tile?.x,tile?.y);
  const record = data.tiles[key] ?? {};
  const reason = message => ({ok:false,reason:message});
  if (!fixedMapCanPlace(data.grid[tile?.y]?.[tile?.x])) return reason('配置できる地形を選んでください。');
  const baseKey = fixedMapBaseKey(data,key);
  if (placement.kind === 'base') {
    if (baseKey) return reason('拠点や領土がないマスを選んでください。');
  } else if (placement.kind === 'territory') {
    if (data.tiles[placement.baseKey]?.base?.factionId !== factionId) return reason('自勢力の拠点を選んでください。');
    if (baseKey) return reason('まだ領土になっていないマスを選んでください。');
  } else {
    if (!baseKey || data.tiles[baseKey]?.base?.factionId !== factionId) return reason('自勢力の領土を選んでください。');
    if (!facilityNames.has(placement.name)) return reason('施設を選んでください。');
    if (wallRules[placement.name]) {
      const edges = placement.edges ?? [];
      if (!edges.length) return reason('建築する辺を選んでください。');
      const used = new Set((data.walls ?? []).map(row => v39WallEdgeKey(row.edge)));
      for (const edge of edges) {
        if (!isV39WallEdge(edge,data) || fixedMapBaseKey(data,fixedMapTileKey(edge.from.x,edge.from.y)) !== baseKey) {
          return reason('同じ拠点の領土に接するマップ内の辺を選んでください。');
        }
        const edgeKey = v39WallEdgeKey(edge);
        if (used.has(edgeKey)) return reason('すでに壁がある辺です。');
        used.add(edgeKey);
      }
    } else if (record.facility && record.facility !== placement.upgradeFrom) {
      return reason('施設のないマスを選んでください。');
    }
  }
  return {ok:true,key,baseKey};
}

export function placeV39FixedMapObject(data, factionId, tile, placement) {
  const result = inspectV39FixedMapPlacement(data,factionId,tile,placement);
  if (!result.ok) return result;
  const {key} = result;
  const record = {...data.tiles[key]};
  switch (placement.kind) {
    case 'base': {
      const base = placement.base;
      if (!validName(base?.name) || !range(base?.population,1,100000)) {
        return {ok:false,reason:'拠点名と人口（1〜100000）を確認してください。'};
      }
      if (base.factionId ? base.factionId !== factionId : !raceNames.has(base.race)) {
        return {ok:false,reason:'拠点の所属または種族が不正です。'};
      }
      record.base = {...base};
      break;
    }
    case 'territory': record.territory = placement.baseKey; break;
    default:
      if (wallRules[placement.name]) {
        data.walls ??= [];
        for (const {from,to} of placement.edges) data.walls.push({name:placement.name,edge:{from:{...from},to:{...to}}});
        return result;
      }
      record.facility = placement.name;
  }
  data.tiles[key] = record;
  return result;
}

export function getV39FixedMapRemovableObjects(data, factionId, tile) {
  const key = fixedMapTileKey(tile?.x,tile?.y);
  const record = data.tiles[key];
  if (!record) return [];
  const baseKey = fixedMapBaseKey(data,key);
  const owner = data.tiles[baseKey]?.base?.factionId;
  return [
    record.unit && record.unit.factionId === factionId && 'unit',
    record.facility && owner === factionId && 'facility',
    owner && owner === factionId && (data.walls ?? []).some(({edge}) => fixedMapTileKey(edge.from.x,edge.from.y) === key) && 'wall',
    record.territory && !record.base && owner === factionId && 'territory',
    record.base && (!owner || owner === factionId) && 'base'
  ].filter(Boolean);
}

export function removeV39FixedMapObject(data, factionId, tile, kind) {
  if (!getV39FixedMapRemovableObjects(data,factionId,tile).includes(kind)) {
    return {ok:false,reason:'外せる配置物が見つかりません。'};
  }
  const key = fixedMapTileKey(tile.x,tile.y);
  if (kind === 'wall') {
    data.walls = data.walls.filter(({edge}) => fixedMapTileKey(edge.from.x,edge.from.y) !== key);
    return {ok:true,key};
  }
  const record = {...data.tiles[key]};
  if (kind === 'base' || kind === 'territory') {
    const linkedTerritory = kind === 'base' && Object.entries(data.tiles).some(([other,row]) => other !== key && row.territory === key);
    const linkedWall = (data.walls ?? []).some(({edge}) => fixedMapTileKey(edge.from.x,edge.from.y) === key);
    if (linkedTerritory || linkedWall || record.facility) return {ok:false,reason:'所属する領土・施設・壁を先に外してください。'};
  }
  delete record[kind];
  if (kind === 'base') delete record.territory;
  if (Object.keys(record).length) data.tiles[key] = record;
  else delete data.tiles[key];
  return {ok:true,key};
}

export function createV39FixedMap(w = 16, h = 12, {random = false, terrain = '平地'} = {}) {
  if (!range(w,FIXED_MAP_MIN,FIXED_MAP_MAX) || !range(h,FIXED_MAP_MIN,FIXED_MAP_MAX)) {
    throw new Error(`横幅と高さは ${FIXED_MAP_MIN}〜${FIXED_MAP_MAX} マスで設定してください。`);
  }
  if (!terrainNames.has(terrain)) throw new Error('地形を選んでください。');
  const base = random && createTerrainMapData({w,h,mapScope:'island',patternId:'balanced'});
  return {
    kind:FIXED_MAP_KIND, version:1, name:'新しい固定マップ', w, h,
    grid:base ? base.grid : matrix(w,h,terrain),
    heightLevelMap:base ? base.heightLevelMap : matrix(w,h,0),
    factions:[], tiles:{}
  };
}

export function getV39FixedMapRange(start, end = start) {
  const tiles = [];
  for (let y = Math.min(start.y,end.y); y <= Math.max(start.y,end.y); y++) {
    for (let x = Math.min(start.x,end.x); x <= Math.max(start.x,end.x); x++) tiles.push({x,y});
  }
  return tiles;
}

export function applyV39FixedMapTerrain(map, tiles, terrain, height) {
  if (!terrainNames.has(terrain)) throw new Error('地形を選んでください。');
  for (const {x,y} of tiles) {
    if (!range(x,0,map.w-1) || !range(y,0,map.h-1)) throw new Error('範囲がマップの外です。');
    const key = fixedMapTileKey(x,y);
    const tile = map.tiles[key];
    if (!fixedMapCanPlace(terrain) && (tile?.base || tile?.territory || tile?.facility || tile?.unit)) {
      throw new Error(`(${key}) の配置物を外してから地形を変更してください。`);
    }
  }
  if (height !== undefined && !range(height,-100,100)) throw new Error('高度は−100〜100の整数で入力してください。');
  for (const {x,y} of tiles) {
    map.grid[y][x] = terrain;
    if (height !== undefined) map.heightLevelMap[y][x] = height;
  }
}

export function validateV39FixedMap(data, {starting = false} = {}) {
  if (!isRecord(data) || data.kind !== FIXED_MAP_KIND || data.version !== 1) {
    return ['対応する固定マップJSON（バージョン1）を選んでください。'];
  }
  const {w,h,grid,heightLevelMap,factions,tiles} = data;
  const validMatrix = (values, validate) => Array.isArray(values) && values.length === h
    && values.every(row => Array.isArray(row) && row.length === w && row.every(validate));
  if (!validName(data.name) || !range(w,FIXED_MAP_MIN,FIXED_MAP_MAX) || !range(h,FIXED_MAP_MIN,FIXED_MAP_MAX)
    || !validMatrix(grid, value => terrainNames.has(value))
    || !validMatrix(heightLevelMap, value => range(value,-100,100))
    || !Array.isArray(factions) || factions.length > 16 || !isRecord(tiles)) {
    return ['マップ名、サイズ、地形、高度、または勢力データの形式が不正です。'];
  }
  const errors = [];
  const factionsById = new Map();
  for (const faction of factions) {
    if (!isRecord(faction) || !validId(faction.id) || !validName(faction.name) || !raceNames.has(faction.race)
      || !['human','npc'].includes(faction.control) || factionsById.has(faction.id)) {
      errors.push('勢力の名前・種族・操作区分、またはIDが不正です。');
    } else {
      factionsById.set(faction.id, faction);
    }
  }
  const settlements = new Map();
  const leaders = new Map();
  for (const [key, tile] of Object.entries(tiles)) {
    const [x,y] = fixedMapTileCoords(key);
    if (!range(x,0,w-1) || !range(y,0,h-1) || key !== fixedMapTileKey(x,y) || !isRecord(tile)) {
      errors.push(`不正なマス (${key})`);
      continue;
    }
    const {base, territory, facility, unit, resource} = tile;
    if ((base || territory || facility || unit) && !fixedMapCanPlace(grid[y][x])) errors.push(`(${key}) は配置できない地形です。`);
    if (base !== undefined) {
      const validOwner = base?.factionId ? factionsById.has(base.factionId) : raceNames.has(base?.race);
      if (!isRecord(base) || !validName(base.name) || !validOwner || !range(base.population,1,100000)
        || (territory && territory !== key)) {
        errors.push(`(${key}) の拠点設定が不正または重複しています。`);
      } else settlements.set(key,base);
    }
    if (territory !== undefined && (typeof territory !== 'string' || !tiles[territory]?.base?.factionId)) {
      errors.push(`(${key}) の所属拠点がありません。`);
    }
    if (facility !== undefined && (!facilityNames.has(facility) || !(base?.factionId || tiles[territory]?.base?.factionId))) {
      errors.push(`(${key}) の施設または所属領土が不正です。`);
    }
    if (unit !== undefined) {
      if (!isRecord(unit) || !validName(unit.name) || !factionsById.has(unit.factionId)
        || (unit.race !== undefined && !raceNames.has(unit.race))
        || !classesByName.has(unit.className) || !range(unit.level,1,100) || typeof unit.leader !== 'boolean') {
        errors.push(`(${key}) のユニット設定が不正です。`);
      } else if (unit.leader) {
        leaders.set(unit.factionId,(leaders.get(unit.factionId) ?? 0) + 1);
      }
    }
    if (resource !== undefined && !resourcesByName.has(resource)) errors.push(`(${key}) の資源が見つかりません。`);
  }
  if (data.walls !== undefined && !Array.isArray(data.walls)) errors.push('壁の配置データが不正です。');
  const wallKeys = new Set();
  for (const wall of Array.isArray(data.walls) ? data.walls : []) {
    if (!Object.hasOwn(wallRules,wall?.name) || !isV39WallEdge(wall?.edge,data)) {
      errors.push('壁の種類または配置する辺が不正です。');
      continue;
    }
    const {from} = wall.edge;
    const key = fixedMapTileKey(from.x,from.y);
    const edgeKey = v39WallEdgeKey(wall.edge);
    if (!tiles[fixedMapBaseKey(data,key)]?.base?.factionId || wallKeys.has(edgeKey)) errors.push(`(${key}) の壁の所属領土または重複を確認してください。`);
    wallKeys.add(edgeKey);
  }
  if (starting) {
    if (![...factionsById.values()].some(row => row.control === 'human')) errors.push('プレイヤー操作の勢力を1つ以上設定してください。');
    const owners = new Set([...settlements.values()].map(base => base.factionId));
    for (const faction of factionsById.values()) {
      if (!owners.has(faction.id)) errors.push(`${faction.name}の初期拠点を配置してください。`);
      if (leaders.get(faction.id) !== 1) errors.push(`${faction.name}に君主ユニットを1体配置してください。`);
    }
  }
  return errors;
}

export function parseV39FixedMap(source) {
  let data;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error('固定マップJSONを読み取れませんでした。');
  }
  const errors = validateV39FixedMap(data);
  if (errors.length) throw new Error(errors.join('\n'));
  return data;
}

export function buildV39FixedMapStart(data, {editing = false} = {}) {
  const errors = validateV39FixedMap(data,{starting:!editing});
  if (errors.length) throw new Error(errors.join('\n'));
  const mapData = {
    w:data.w,h:data.h,worldWrapEnabled:false,mapScope:'island',
    grid:data.grid.map(row => [...row]),heightLevelMap:data.heightLevelMap.map(row => [...row]),
    riverData:[],specialMap:matrix(data.w,data.h,''),reliefMap:matrix(data.w,data.h,''),
    lavaMap:matrix(data.w,data.h,false),defenseStructures:[],fixedMapName:data.name,fixedMapEditing:editing
  };
  const facilitiesByTile = {}, territoryOwnerByTile = {}, territoryStateByTile = {}, specialtiesByTile = {};
  const settlementsByTile = new Map();
  const neutralVillages = [];
  const tiles = Object.entries(data.tiles);
  const occupiedTileKeys = new Set(tiles.filter(([key,tile]) => tile.base || tile.unit).map(([key]) => key));
  for (const [key,{base}] of tiles) {
    if (!base) continue;
    const [x,y] = fixedMapTileCoords(key);
    const id = `${base.factionId ? 'village' : 'fixed-neutral'}-${x}-${y}`;
    const common = {id,settlementId:id,name:base.name,type:'村',placed:true,worldId:'surface',x,y,
      population:base.population, territoryTileKeys:[key]};
    if (base.factionId) {
      settlementsByTile.set(key,{...common,ownerPlayerId:base.factionId,tileFacilityMap:{}});
    } else {
      const village = normalizeV39NeutralVillage({...common,neutral:true,race:base.race,level:1,
        ...(editing ? {defenseRosterInitialized:true} : {})},mapData,{occupiedTileKeys});
      neutralVillages.push(village);
      for (const unit of village.defenseUnits) occupiedTileKeys.add(fixedMapTileKey(unit.x,unit.y));
    }
  }
  for (const [key,tile] of tiles) {
    const base = settlementsByTile.get(tile.territory ?? key);
    if (base) {
      if (!base.territoryTileKeys.includes(key)) base.territoryTileKeys.push(key);
      territoryOwnerByTile[key] = base.ownerPlayerId;
      territoryStateByTile[key] = {status:'領土',settlementId:base.id};
      if (tile.facility) {
        facilitiesByTile[key] = [tile.facility];
        base.tileFacilityMap[key] = [tile.facility];
      }
    }
    if (tile.resource) {
      const [x,y] = fixedMapTileCoords(key);
      specialtiesByTile[key] = {key,x,y,name:tile.resource,category:resourcesByName.get(tile.resource).分類};
    }
  }
  const players = data.factions.map(faction => {
    const {id,name,race,control} = faction;
    const isPlayer = control === 'human';
    const authoredBases = [...settlementsByTile.values()].filter(base => base.ownerPlayerId === id);
    const units = tiles.filter(([,tile]) => tile.unit?.factionId === id).map(([key,{unit}]) => {
      const [x,y] = fixedMapTileCoords(key);
      const home = settlementsByTile.get(data.tiles[key]?.territory ?? key);
      return {...buildV39UnitEntity({...unit,id:`fixed-unit-${x}-${y}`,race:unit.race ?? race,x,y,
        settlementId:home?.ownerPlayerId === id ? home.id : authoredBases[0]?.id ?? '',
        role:unit.leader ? '君主' : '', equipment:buildV39ClassEquipment(classesByName.get(unit.className))}),
        isSovereign:unit.leader, worldId:'surface'};
    });
    const settlements = authoredBases.map(base => {
      const populationByRace = {[race]:base.population};
      const stock = editing ? {} : createInitialV39Village({...base,race,mapData,populationByRace,
        player:{id,race},state:{territoryOwnerByTile,territoryStateByTile},
        initialUnits:units.filter(unit => unit.settlementId === base.id),random:() => 0
      });
      return normalizeV39Village({...base,race,populationByRace,
        foodStockByType:stock.foodStockByType,materialStockByType:stock.materialStockByType,
        initialFoodReserveTurnsRemaining:stock.initialFoodReserveTurnsRemaining,
        initialSubsistenceFoodByType:stock.initialSubsistenceFoodByType,
        buildings:Object.values(base.tileFacilityMap).flat()},race);
    });
    const territoryKeys = settlements.flatMap(base => base.territoryTileKeys);
    const factionState = createPlayerFactionState({settlements,units,
      selectedSettlementId:settlements[0]?.id,initialSettlementCount:settlements.length,villagePlacementMode:false,
      selectedUnitId:units.find(unit => unit.isSovereign)?.id ?? units[0]?.id,
      squads:[{id:'solo',name:'単独',unitIds:units.map(unit => unit.id)}],
      visibility:{exploredTileKeys:territoryKeys},exploration:{initialTerritoryTileKeys:territoryKeys}
    },id);
    return {id,name,label:name,race,isPlayer,isNpc:!isPlayer,ready:true,factionState};
  });
  mapData.defenseStructures = (data.walls ?? []).map(({name,edge}) => {
    const base = settlementsByTile.get(fixedMapBaseKey(data,fixedMapTileKey(edge.from.x,edge.from.y)));
    const rule = wallRules[name];
    const id = `fixed-wall-${v39WallEdgeKey(edge)}`;
    const wall = createV39DefenseStructure(mapData,edge.from,{名前:name,効果:'壁',ガード:rule.hp},
      {id,ownerPlayerId:base.ownerPlayerId},1);
    return {...wall,id,edge:{from:{...edge.from},to:{...edge.to}},height:rule.height,wallFacilityName:name,settlementId:base.id};
  });
  return {mapData,players,neutralVillages,settlements:neutralVillages,facilitiesByTile,territoryOwnerByTile,territoryStateByTile,specialtiesByTile};
}
