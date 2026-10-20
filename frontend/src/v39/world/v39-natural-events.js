import { disasterData, terrainData } from "../../lib/game-data-registry.js";
import {projectV39HazardEvents} from '../../lib/v39-hazard-zones.js';
import {tickV39HazardEffects} from '../../lib/v39-hazard-effects.js';
import { getHexDistance } from "../../lib/hex-grid.js";
import {
  V39_PROVISIONAL_DISASTER_BALANCE,
  V39_UNDEAD_SPAWN_BALANCE
} from "../../lib/v39-gameplay-balance.js";
import { createV39EventEnemy } from "../ai/v39-enemy-spawn.js";
import { normalizeV39NeutralVillage } from "../../lib/v39-neutral-village-rules.js";
import { advanceV39CorpseFog, isV39DeathFogTile } from "../../lib/v39-fog-rules.js";
import { V39_FOG_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { convertV39CorpsesInDeathFog } from "../../lib/v39-corpse-undead-rules.js";
import {resolveV39DisasterRule as readRule} from '../../lib/v39-disaster-rules.js';
import {applyV39DisasterDamage as damageUnit,resolveV39DisasterDamage} from '../../lib/v39-disaster-damage.js';
import {resolveV39DisasterDamageTiles} from '../../lib/v39-disaster-strikes.js';
import {canV39UnitLeaveOrganicCorpse} from '../../lib/v39-corpse-types.js';
import {ensureV39ClimateProfile,advanceV39Weather,inspectV39WeatherAt,setV39WeatherAt,resolveV39DisasterWeather} from '../../lib/v39-weather.js';

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const tileKey = (x, y) => `${integer(x)},${integer(y)}`;
const isLiving = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state) !== "死亡";

function hash(value) {
  let result = 2166136261;
  for (const character of String(value ?? "")) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function roll(value) {
  return hash(value) / 4294967296;
}

function mapTileText(mapData, x, y) {
  const values = [
    mapData?.grid?.[y]?.[x],
    mapData?.reliefMap?.[y]?.[x],
    mapData?.specialMap?.[y]?.[x]
  ].map(text).filter(Boolean);
  const key = tileKey(x, y);
  if (mapData?.riverData?.riverSet?.has?.(key) || mapData?.riverData?.riverTouchSet?.has?.(key)) values.push("河川");
  return values;
}

function mapTiles(mapData, targetTerrain = []) {
  const terrainTerms = (Array.isArray(targetTerrain) ? targetTerrain : [])
    .map(text).filter(Boolean);
  const rows = [];
  for (let y = 0; y < integer(mapData?.h); y += 1) {
    for (let x = 0; x < integer(mapData?.w); x += 1) {
      if (mapData?.lavaMap?.[y]?.[x]) continue;
      const terrain = mapTileText(mapData, x, y);
      if (!terrainTerms.length && terrain.some(value => ["海", "湖", "火山"].includes(value))) continue;
      if (terrainTerms.length && !terrainTerms.some(term => terrain.some(value => value.includes(term) || term.includes(value)))) continue;
      rows.push({ x, y, key:tileKey(x, y), terrain });
    }
  }
  return rows;
}

function terrainAffinityMultiplier(rule, terrainValues = []) {
  const field = text(V39_PROVISIONAL_DISASTER_BALANCE.terrainAffinityFieldByDisasterId?.[text(rule?.id)]);
  if (!field) return 1;
  const affinity = Math.max(0, ...terrainValues.map(value => {
    const terrain = text(value);
    const row = (terrainData || []).find(candidate => {
      const name = text(candidate?.地形);
      return name && (name === terrain || name.includes(terrain) || terrain.includes(name));
    });
    return number(row?.[field]);
  }));
  return Math.max(0, 1 + affinity);
}

function affectedTiles(mapData, anchor, radius) {
  const distance = Math.max(0, integer(radius));
  // Candidate terrain restrictions select the origin, not holes inside its hex area.
  const tiles=[];
  for(let y=Math.max(0,anchor.y-distance);y<=Math.min(mapData.h-1,anchor.y+distance);y++){
    for(let x=Math.max(0,anchor.x-distance-1);x<=Math.min(mapData.w-1,anchor.x+distance+1);x++){
      if(getHexDistance(anchor,{x,y})<=distance)tiles.push({x,y,key:tileKey(x,y)});
    }
  }
  return tiles;
}

function disasterRows() {
  return (Array.isArray(disasterData) ? disasterData : [])
    .filter(row => text(row?.ID) && text(row?.ID) !== "災害:火山噴火"&&row.常設危険地帯!==true);
}

function recentSameEvent(environment, rule, key, turn) {
  const cooldown = rule.cooldown;
  return (environment?.lastDisasterEvents || []).some(event => (
    text(event?.disasterId) === rule.id
    && text(event?.anchorKey) === key
    && integer(event?.turn) > turn - cooldown
  ));
}

function occupiedKeys(state) {
  const keys = new Set();
  for (const player of state?.players || []) for (const unit of player?.factionState?.units || []) {
    if (isLiving(unit)) keys.add(tileKey(unit.x, unit.y));
  }
  for (const enemy of state?.enemies || []) if (isLiving(enemy)) keys.add(tileKey(enemy.x, enemy.y));
  for (const village of state?.neutralVillages || []) {
    keys.add(tileKey(village.x, village.y));
    for (const unit of village?.defenseUnits || []) if (isLiving(unit)) keys.add(tileKey(unit.x, unit.y));
  }
  return keys;
}

function settlementAnchors(state) {
  return (state?.settlements || [])
    .filter(row => row?.neutral !== true && row?.placed !== false)
    .filter(row => Number.isFinite(Number(row?.x)) && Number.isFinite(Number(row?.y)))
    .map(row => ({ x:integer(row.x), y:integer(row.y), key:tileKey(row.x, row.y), settlementId:text(row?.settlementId || row?.id) }));
}

function chooseAnchor(state, mapData, rule, turn, forcedPosition = null, candidateCache=new Map(),ignoreWeather=false,trace=null) {
  if (forcedPosition && Number.isFinite(Number(forcedPosition.x)) && Number.isFinite(Number(forcedPosition.y))) {
    return { x:integer(forcedPosition.x), y:integer(forcedPosition.y), key:tileKey(forcedPosition.x, forcedPosition.y) };
  }
  const cacheKey=`${rule.targetMode}:${rule.targetTerrain.join(',')}`;
  if(!candidateCache.has(cacheKey))candidateCache.set(cacheKey,rule.targetMode === "settlement"?settlementAnchors(state):mapTiles(mapData, rule.targetTerrain));
  const source=candidateCache.get(cacheKey).filter(point=>ignoreWeather||resolveV39DisasterWeather(rule,mapData,state.worldEnvironment?.weather,point).allowed);
  if(trace){trace.terrainCandidates=candidateCache.get(cacheKey).length;trace.eligibleCandidates=source.length;}
  if (!source.length) return null;
  return source[hash(`${rule.id}:T${turn}:anchor`) % source.length];
}

function buildDisasterEvent(rule, mapData, anchor, turn, forced = false, terrainAffinity = 1) {
  const tiles = rule.targetMode === "settlement" ? [anchor] : affectedTiles(mapData, anchor, rule.radius);
  const tileKeys = [...new Set(tiles.map(tile => tile.key))];
  return {
    id:`disaster:${rule.id}:${turn}:${anchor.key}`,
    disasterId:rule.id,
    name:rule.name,
    description:rule.description,
    icon:rule.icon,
    imageFile:rule.imageFile,
    imageSlot:rule.imageSlot,
    terrainAffinity,
    turn,
    forced,
    anchorKey:anchor.key,
    x:anchor.x,
    y:anchor.y,
    tileKeys,
    startsAtTurn:turn,
    expiresAtTurn:turn + rule.duration - 1,
    yieldMultiplier:rule.yieldMultiplier,
    securityLoss:rule.securityLoss,
    unitDamageRate:rule.unitDamageRate,
    movementDamageRate:rule.movementDamageRate,
    stationaryDamageMultiplier:rule.stationaryDamageMultiplier,
    damageElement:rule.damageElement,damagePower:rule.damagePower,movementDamagePower:rule.movementDamagePower,
    damagePattern:rule.damagePattern,randomDamageTileCount:rule.randomDamageTileCount,
    randomDamageTilesPerHit:rule.randomDamageTilesPerHit,
    spawnEnemy:rule.spawnEnemy,
    undeadBonus:rule.undeadBonus,
    lastTickTurn:turn - 1
  };
}

function createNaturalDisasters(state, mapData, turn, forceRuleId = "", forcedPosition = null, diagnostics=null) {
  const environment = state?.worldEnvironment || {};
  const events = [];
  const candidateCache=new Map();
  for (const row of disasterRows()) {
    const rule = readRule(row);
    const trace=diagnostics?{id:rule.id,name:rule.name,baseChance:rule.chance,condition:rule.occurrenceCondition,status:'disabled'}:null;
    if(trace)diagnostics.push(trace);
    if(!rule.enabled)continue;
    const forced = text(forceRuleId) === rule.id;
    if(!forced&&!rule.occurrenceMethods.some(method=>['自然','条件付き'].includes(method))){if(trace)trace.status='not-natural';continue;}
    // テスト強制時は選択した1種だけを発生させ、同ターンの通常抽選を混ぜない。
    if (forceRuleId && !forced) continue;
    if (!forced && events.length >= V39_PROVISIONAL_DISASTER_BALANCE.maximumNaturalEventsPerTurn){if(trace)trace.status='limit';continue;}
    const anchor = chooseAnchor(state, mapData, rule, turn, forced ? forcedPosition : null,candidateCache,forced,trace);
    if (!anchor){if(trace)trace.status=trace.terrainCandidates?'condition':'no-terrain';continue;}
    if(trace)trace.anchorKey=anchor.key;
    if (!forced && recentSameEvent(environment, rule, anchor.key, turn)){if(trace)trace.status='cooldown';continue;}
    const terrainAffinity = terrainAffinityMultiplier(rule, anchor.terrain || mapTileText(mapData, anchor.x, anchor.y));
    const weather=resolveV39DisasterWeather(rule,mapData,environment.weather,anchor);
    const chance=Math.min(1,rule.chance*terrainAffinity*weather.climateMultiplier*weather.weatherMultiplier),rolled=roll(`${rule.id}:T${turn}`);
    if(trace)Object.assign(trace,{chance,rolled,terrainAffinity,climateMultiplier:weather.climateMultiplier,weatherMultiplier:weather.weatherMultiplier});
    if (!forced && (!weather.allowed||rolled >= chance)){if(trace)trace.status=weather.allowed?'miss':'condition';continue;}
    if(trace)trace.status='spawned';
    events.push({...buildDisasterEvent(rule, mapData, anchor, turn, forced, terrainAffinity),
      weatherAtSpawn:weather.current||null,climateMultiplier:weather.climateMultiplier,weatherMultiplier:weather.weatherMultiplier});
    if (forced) break;
  }
  return events;
}

// Read-only planning shares the exact normal conditions and deterministic roll.
export function inspectV39NaturalDisasterTrial(state,mapData,turn){
  const weather=advanceV39Weather(ensureV39ClimateProfile(mapData),state.worldEnvironment?.weather,turn),attempts=[];
  const events=createNaturalDisasters({...state,worldEnvironment:{...state.worldEnvironment,weather}},mapData,turn,'',null,attempts);
  return {turn,weather,events,attempts};
}

function tickDisasterDamage(state, mapData, activeDisasters, turn) {
  const damageEvents = activeDisasters.filter(event => integer(event?.lastTickTurn) < turn && (number(event?.unitDamageRate) > 0 || resolveV39DisasterDamage(event).power > 0))
    .map(event=>({...event,damageTileKeys:resolveV39DisasterDamageTiles(event,turn),damageTickTurn:turn}));
  if (!damageEvents.length) return { players:state.players, enemies:state.enemies, neutralVillages:state.neutralVillages, activeDisasters, entries:[] };
  const damageByKey = new Map();
  const unitDamageByKey = new Map();
  for (const event of damageEvents) for (const key of event.damageTileKeys) {
    damageByKey.set(text(key), Math.max(number(damageByKey.get(text(key))), resolveV39DisasterDamage(event).power>0?0:number(event.unitDamageRate)));
    unitDamageByKey.set(text(key),[...(unitDamageByKey.get(text(key))||[]),resolveV39DisasterDamage(event)]);
  }
  const entries = [];
  const players = (state.players || []).map(player => ({
    ...player,
    factionState:{
      ...player.factionState,
      units:(player?.factionState?.units || []).map(unit => {
        if((unit.worldId||'surface')!==(state.activeWorldId||'surface'))return unit;
        const rate = unitDamageByKey.get(tileKey(unit.x, unit.y)) || 0;
        const result = damageUnit(unit, rate, turn, "災害");
        if (result.entry) entries.push({ ...result.entry, playerId:player.id });
        return result.unit;
      })
    }
  }));
  const enemies = (state.enemies || []).map(unit => {
    const result = damageUnit(unit, unitDamageByKey.get(tileKey(unit.x, unit.y)) || 0, turn, "災害");
    if (result.entry) entries.push(result.entry);
    return result.unit;
  });
  const neutralVillages = (state.neutralVillages || []).map(source => {
    const affectedRate = Math.max(0, ...(source?.territoryTileKeys || [tileKey(source?.x, source?.y)])
      .map(key => number(damageByKey.get(text(key)))));
    const defenseUnits = (source?.defenseUnits || []).map(unit => {
      const result = damageUnit(unit, unitDamageByKey.get(tileKey(unit.x, unit.y)) || 0, turn, "災害");
      if (result.entry) entries.push({ ...result.entry, neutralVillageId:source.id });
      return result.unit;
    });
    const populationBefore = Math.max(1, integer(source?.population, 1));
    const populationLoss = affectedRate > 0 ? Math.min(populationBefore - 1, Math.max(1, Math.ceil(populationBefore * affectedRate))) : 0;
    const damagedVillage = populationLoss > 0
      ? {
        ...source,
        population:populationBefore - populationLoss,
        defenseUnits,
        disasterState:{ turn, populationLoss, rate:affectedRate }
      }
      : { ...source, defenseUnits };
    if (populationLoss > 0) entries.push({
      unitId:`village:${text(source?.id)}`,
      name:text(source?.name, "一般村"),
      damage:populationLoss,
      beforeHp:populationBefore,
      afterHp:populationBefore - populationLoss,
      source:"災害人口被害",
      neutralVillageId:source.id
    });
    return normalizeV39NeutralVillage(damagedVillage, mapData);
  });
  return {
    players,
    enemies,
    neutralVillages,
    entries,
    activeDisasters:activeDisasters.map(event => integer(event?.lastTickTurn) < turn
      ? { ...event, ...damageEvents.find(row=>row.id===event.id), lastTickTurn:turn } : event)
  };
}

function activeTerrainEffectsFromDisasters(events) {
  return events.map(event => ({
    id:`disaster-effect:${event.id}`,
    type:`災害:${event.name}`,
    disasterId:event.disasterId,
    startsAtTurn:event.startsAtTurn,
    expiresAtTurn:event.expiresAtTurn,
    yieldMultiplier:event.yieldMultiplier,
    securityLoss:event.securityLoss,
    tileKeys:[...(event.tileKeys || [])]
  }));
}

function combineEffects(environment, disasters, turn) {
  const nonDisaster = (environment?.activeTerrainEffects || []).filter(effect => (
    !text(effect?.id).startsWith("disaster-effect:")
    && integer(effect?.expiresAtTurn, turn) >= turn
  ));
  return [...nonDisaster, ...activeTerrainEffectsFromDisasters(disasters)];
}

function corpseAmount(groundLoot) {
  return Math.max(0, number(groundLoot?.cargo?.resourcesByType?.死体 ?? groundLoot?.resourcesByType?.死体));
}

function undeadOrigins(state, mapData, activeDisasters) {
  const corpses=new Set(Object.entries(state.groundLootByTile || {}).filter(([,loot])=>corpseAmount(loot)>=V39_FOG_BALANCE.corpseResourcePerBody).map(([key])=>key));
  for(const unit of [...(state.enemies || []),...(state.players || []).flatMap(player=>player.factionState?.units || []),...(state.neutralVillages || []).flatMap(village=>village.defenseUnits || [])])
    if(canV39UnitLeaveOrganicCorpse(unit)&&!isLiving(unit)&&(unit.worldId || 'surface')===(state.activeWorldId || 'surface'))corpses.add(tileKey(unit.x,unit.y));
  return (mapData.unholyUndeadOrigins || []).filter(origin=>!corpses.has(origin.key)).map(origin=>({...origin,source:"不浄",chance:1}));
}
function chooseUndeadCandidate(token) {
  const candidates = V39_UNDEAD_SPAWN_BALANCE.candidates;
  const total = candidates.reduce((sum, candidate) => sum + Math.max(1, integer(candidate?.weight, 1)), 0);
  let cursor = hash(token) % Math.max(1, total);
  for (const candidate of candidates) {
    cursor -= Math.max(1, integer(candidate?.weight, 1));
    if (cursor < 0) return candidate;
  }
  return candidates[0] || null;
}

function consumeCorpse(groundLootByTile, key) {
  const current = groundLootByTile[key];
  const cargo = current?.cargo || current;
  const before = corpseAmount(current);
  if (before < V39_FOG_BALANCE.corpseResourcePerBody) return groundLootByTile;
  const resourcesByType = { ...(cargo?.resourcesByType || {}), 死体:before - V39_FOG_BALANCE.corpseResourcePerBody };
  if (resourcesByType.死体 <= 0) delete resourcesByType.死体;
  return { ...groundLootByTile, [key]:{ ...current, cargo:{ ...cargo, resourcesByType } } };
}

function spawnNaturalUndead(state, mapData, turn, activeDisasters, forcePosition = null) {
  const occupied = occupiedKeys(state);
  const origins = forcePosition
    ? [{ x:integer(forcePosition.x), y:integer(forcePosition.y), key:tileKey(forcePosition.x, forcePosition.y), source:"テスト強制", chance:1 }]
    : undeadOrigins(state, mapData, activeDisasters);
  const cooldown = V39_UNDEAD_SPAWN_BALANCE.sameTileCooldownTurns;
  const history = state?.worldEnvironment?.lastDisasterEvents || [];
  const spawned = [];
  const spawnHistory={...state.worldEnvironment?.undeadSpawnHistoryByTile};
  let groundLootByTile = { ...(state?.groundLootByTile || {}) };
  for (const origin of origins.sort((left, right) => left.key.localeCompare(right.key, "ja"))) {
    if (spawned.length >= V39_UNDEAD_SPAWN_BALANCE.maximumSpawnCountPerTurn && !forcePosition) break;
    const terrain = mapTileText(mapData, origin.x, origin.y);
    if(!forcePosition&&mapData.fogMap?.[origin.y]?.[origin.x]?.createdAtTurn===turn)continue;
    if (terrain.some(value => ["海", "湖", "火山"].includes(value)) || mapData?.lavaMap?.[origin.y]?.[origin.x]) continue;
    if (occupied.has(origin.key)) continue;
    const recent = history.some(event => event?.type === "undead-spawn" && text(event?.anchorKey) === origin.key && integer(event?.turn) > turn - cooldown);
    if (recent || turn-(spawnHistory[origin.key] ?? -Infinity)<cooldown || (!forcePosition && roll(`undead:${origin.key}:T${turn}`) >= number(origin.chance))) continue;
    const candidate = chooseUndeadCandidate(`${origin.key}:T${turn}`);
    if (!candidate) continue;
    const level = integer(candidate.levelMin) + (hash(`undead-level:${origin.key}:T${turn}`) % (integer(candidate.levelMax) - integer(candidate.levelMin) + 1));
    const enemy = createV39EventEnemy({
      id:`undead-${turn}-${origin.key.replace(",", "-")}-${spawned.length + 1}`,
      name:candidate.className,
      race:candidate.race,
      className:candidate.className,
      level,
      x:origin.x,
      y:origin.y,
      metadata:{ spawnType:"アンデッド自然発生", naturalSource:origin.source, naturalSpawnTurn:turn, isUndead:true, aggressive:true }
    });
    if (!enemy) continue;
    spawned.push({ enemy, origin });
    spawnHistory[origin.key]=turn;
    occupied.add(origin.key);
    if (origin.source === "死体") groundLootByTile = consumeCorpse(groundLootByTile, origin.key);
  }
  return { spawned, groundLootByTile, spawnHistory };
}

function spawnDisasterEnemy(state, event, turn) {
  if (event?.spawnEnemy !== true) return null;
  const template = (state?.enemies || []).find(enemy => isLiving(enemy) && enemy?.isUndead !== true);
  if (!template) return null;
  const occupied = occupiedKeys(state);
  const tile = (event?.tileKeys || []).map(key => {
    const [x, y] = String(key).split(",").map(Number);
    return { x, y, key:text(key) };
  }).find(point => Number.isFinite(point.x) && Number.isFinite(point.y) && !occupied.has(point.key));
  if (!tile) return null;
  return createV39EventEnemy({
    id:`disaster-enemy-${turn}-${tile.key.replace(",", "-")}`,
    name:text(template?.name), race:text(template?.race), className:text(template?.className), level:integer(template?.level, 1), x:tile.x, y:tile.y,
    metadata:{ spawnType:"災害発生", naturalSource:event.name, naturalSpawnTurn:turn, aggressive:true }
  });
}

// 駆除依頼を作る段階でそのまま参照できるよう、村の領域内にいる自然発生個体だけを保存する。
function syncNeutralVillageUndeadThreats(villages, enemies, turn) {
  const naturalUndead = (enemies || []).filter(enemy => (
    isLiving(enemy)
    && (enemy?.isUndead === true || enemy?.metadata?.isUndead === true)
    && ["アンデッド自然発生", "死体アンデッド化"].includes(text(enemy?.spawnType || enemy?.metadata?.spawnType))
  ));
  return (villages || []).map(village => {
    const territoryKeys = new Set((village?.territoryTileKeys || [tileKey(village?.x, village?.y)]).map(text));
    const enemyIds = naturalUndead.filter(enemy => territoryKeys.has(tileKey(enemy?.x, enemy?.y))).map(enemy => text(enemy?.id));
    return {
      ...village,
      naturalUndeadThreat:{ turn, enemyIds, count:enemyIds.length }
    };
  });
}

function applyNaturalEvents({ state, mapData, turn, forceDisasterId = "", forceDisasterAt = null, forceUndeadAt = null, skipNaturalDisasters = false, recordDisasterDiagnostics=false } = {}) {
  const environment = {...state?.worldEnvironment,weather:advanceV39Weather(ensureV39ClimateProfile(mapData),state?.worldEnvironment?.weather,turn)};
  state={...state,worldEnvironment:environment};
  const existing = [...(environment.activeDisasters || []).filter(event => !event.persistentHazard&&integer(event?.expiresAtTurn, turn) >= turn),...projectV39HazardEvents(mapData,turn)];
  const ended = (environment.activeDisasters || []).filter(event => !event.persistentHazard&&integer(event?.expiresAtTurn, turn) < turn);
  const diagnostics=recordDisasterDiagnostics&&!skipNaturalDisasters&&!forceDisasterId?[]:null;
  const created = skipNaturalDisasters ? [] : createNaturalDisasters(state, mapData, turn, forceDisasterId, forceDisasterAt,diagnostics);
  const activeDisasters = [...existing, ...created];
  const ticked = tickDisasterDamage(state, mapData, activeDisasters, turn);
  const hazards=tickV39HazardEffects({...state,...ticked},mapData,turn);
  ticked.players=hazards.players;ticked.enemies=hazards.enemies;ticked.neutralVillages=hazards.neutralVillages;ticked.entries.push(...hazards.entries);
  const stateAfterDamage = { ...state, players:ticked.players, enemies:ticked.enemies, neutralVillages:ticked.neutralVillages };
  advanceV39CorpseFog(mapData,stateAfterDamage,turn);
  const spawnedByDisaster = created.map(event => spawnDisasterEnemy(stateAfterDamage, event, turn)).filter(Boolean);
  const undead = spawnNaturalUndead({ ...stateAfterDamage, enemies:[...ticked.enemies, ...spawnedByDisaster] }, mapData, turn, ticked.activeDisasters, forceUndeadAt);
  const enemies = [...ticked.enemies, ...spawnedByDisaster, ...undead.spawned.map(row => row.enemy)];
  const neutralVillages = syncNeutralVillageUndeadThreats(ticked.neutralVillages, enemies, turn);
  const enemySquads = [
    ...(state?.enemySquads || []),
    ...[...spawnedByDisaster, ...undead.spawned.map(row => row.enemy)].map(enemy => ({ id:`enemy-squad-${enemy.id}`, nestId:"", unitIds:[enemy.id], cargo:{ resourcesByType:{}, equipmentInventory:[] } }))
  ];
  const eventHistory = [
    ...(environment.lastDisasterEvents || []),
    ...created,
    ...undead.spawned.map(row => ({ id:`undead-spawn:${turn}:${row.origin.key}`, type:"undead-spawn", name:"アンデッド自然発生", turn, anchorKey:row.origin.key, x:row.origin.x, y:row.origin.y, source:row.origin.source, enemyId:row.enemy.id }))
  ].slice(-120);
  const worldEnvironment = {
    ...environment,
    ...(diagnostics?{disasterDiagnostics:{turn,attempts:diagnostics}}:{}),
    undeadSpawnHistoryByTile:undead.spawnHistory,
    undeadSpawnCountTurn:turn,undeadSpawnCount:undead.spawned.length,
    lastDisasterEvents:eventHistory,
    activeDisasters:ticked.activeDisasters,
    activeTerrainEffects:combineEffects(environment, ticked.activeDisasters, turn),
    lastNaturalEventTurn:turn
  };
  const neutralVillageById = new Map(neutralVillages.map(village => [text(village?.id), village]));
  const settlements = (state?.settlements || []).map(settlement => neutralVillageById.get(text(settlement?.id)) || settlement);
  return { players:ticked.players, enemies, enemySquads, neutralVillages, settlements, groundLootByTile:undead.groundLootByTile, worldEnvironment, created, ended, damageEntries:ticked.entries, undead:undead.spawned, spawnedByDisaster };
}

export function runV39NaturalEvents(options = {}) {
  const state = window.getV39GameState?.();
  const mapData = window.__v39FieldRuntime?.mapData;
  if (!state || !mapData) return { ok:false, reason:"field-not-generated" };
  if(options.forceDisasterId){
    const rule=readRule(text(options.forceDisasterId)),point=options.forceDisasterAt;
    if(!rule || !rule.enabled || rule.id==='災害:火山噴火'||rule.occurrenceMethods.includes('常設'))return {ok:false,reason:'invalid-disaster'};
    if(point&&(!Number.isInteger(point.x)||!Number.isInteger(point.y)||point.x<0||point.y<0||point.x>=mapData.w||point.y>=mapData.h))return {ok:false,reason:'invalid-position'};
    if(mapData.isUnderground)return {ok:false,reason:'underground-disaster-disabled'};
    if(point&&(state.worldEnvironment?.activeDisasters||[]).some(event=>event.disasterId===rule.id&&event.turn===state.timeline?.turnNumber&&event.anchorKey===tileKey(point.x,point.y)))return {ok:false,reason:'already-active'};
  }
  const turn = Math.max(1, integer(options?.turnNumber, state?.timeline?.turnNumber));
  if (options?.force !== true && integer(state?.worldEnvironment?.lastNaturalEventTurn) >= turn) return { ok:false, reason:"already-processed" };
  const result = applyNaturalEvents({
    state,
    mapData,
    turn,
    forceDisasterId:text(options?.forceDisasterId),
    forceDisasterAt:options?.forceDisasterAt || null,
    forceUndeadAt:options?.forceUndeadAt || null,
    skipNaturalDisasters:mapData.isUnderground || options?.skipNaturalDisasters === true,
    recordDisasterDiagnostics:window.isV39TestMode?.()===true
  });
  // Snapshot before damage/state updates change vision; any affected tile is enough.
  const lifecycleNotices=[...result.created.map(event=>({event,phase:'started'})),
    ...result.ended.map(event=>({event,phase:'ended'}))].map(row=>({...row,
      observed:window.__v39BackgroundWorldTurn!==true&&(row.event.tileKeys||[tileKey(row.event.x,row.event.y)])
        .some(key=>{const [x,y]=key.split(',').map(Number);return window.isV39TileInCurrentVision?.(x,y)===true;})
    })).filter(row=>row.observed||window.isV39TestMode?.()===true);
  // Capture visibility before deaths/state normalization can remove a target marker.
  const units=[...(state.players||[]).flatMap(player=>player.factionState?.units||[]),...(state.enemies||[]),
    ...(state.neutralVillages||[]).flatMap(village=>village.defenseUnits||[])];
  const byId=new Map(units.map(unit=>[unit.id,unit]));
  result.damageEntries=result.damageEntries.map(entry=>({...entry,
    visibleAtDamage:window.__v39BackgroundWorldTurn!==true&&!!byId.get(entry.unitId)
      &&(window.isV39TestMode?.()===true||entry.playerId===state.activePlayerId
        ||window.isV39TileInCurrentVision?.(entry.x,entry.y)===true&&window.isV39EntityDetected?.(byId.get(entry.unitId))!==false)}));
  window.setV39GameState?.({
    players:result.players,
    enemies:result.enemies,
    enemySquads:result.enemySquads,
    neutralVillages:result.neutralVillages,
    settlements:result.settlements,
    groundLootByTile:result.groundLootByTile,
    worldEnvironment:result.worldEnvironment
  }, { reason:"natural-events" });
  const allPlayers = (state.players || []).map(player => text(player?.id)).filter(Boolean);
  for(const {event,phase,observed} of lifecycleNotices){
    const message=phase==='started'?`${event.name} 発生中: (${event.x},${event.y}) / ${event.tileKeys.length}マス`
      :`${event.name}が終了: (${event.x},${event.y})`;
    const detail={...event,disasterPhase:phase,worldId:state.activeWorldId||'surface'};
    window.appendV39ActivityLog?.([state.activePlayerId],'災害',message,detail);
    window.pushV39Notification?.(message,{title:'災害',environmentVisibility:{playerId:state.activePlayerId,
      worldId:detail.worldId,observed}});
  }
  const visibleToActive=(x,y)=>window.isV39TestMode?.()===true||window.isV39TileInCurrentVision?.(x,y)===true;
  for(const event of result.worldEnvironment.activeDisasters){
    const previous=state.worldEnvironment?.activeDisasters?.find(row=>row.id===event.id);
    if(event.damageTickTurn!==turn||integer(previous?.lastTickTurn)>=turn
      ||(event.damagePattern??readRule(event.disasterId)?.damagePattern)!=='ランダム')continue;
    for(const key of event.damageTileKeys||[]){
      const [x,y]=key.split(',').map(Number);if(!visibleToActive(x,y))continue;
      window.appendV39ActivityLog?.([state.activePlayerId],'災害',`${event.name}: (${x},${y})へ落雷 / ${event.damageElement} 威力${event.damagePower}`,{...event,strikeKey:key});
    }
  }
  for(const entry of result.damageEntries){
    const viewers=entry.playerId?[entry.playerId]:visibleToActive(entry.x,entry.y)?[state.activePlayerId]:[];
    if(viewers.length)window.appendV39ActivityLog?.(viewers,'災害',`${entry.name}: ${entry.detail?.resistanceKey?.replace('耐性','')||''}${entry.damage}ダメージ`,entry);
  }
  for (const row of result.undead) window.appendV39ActivityLog?.(allPlayers, "自然発生", `${row.enemy.name}が${row.origin.source}から発生: (${row.origin.x},${row.origin.y})`, row);
  window.dispatchEvent(new CustomEvent("v39:natural-events-resolved", { detail:{ worldId:state.activeWorldId||'surface',turnNumber:turn, disasters:result.created, endedDisasters:result.ended, damageEntries:result.damageEntries, undead:result.undead } }));
  return { ok:true, turnNumber:turn, disasters:result.created, endedDisasters:result.ended, damageEntries:result.damageEntries, undead:result.undead };
}

function install() {
  const initializeWeather=()=>{
    const map=window.__v39FieldRuntime?.mapData,state=window.getV39GameState?.({includeWorlds:false});
    if(!map||!state)return;
    const turn=Math.max(1,state.timeline?.turnNumber||1);map.hazardTurn=turn;
    const weather=advanceV39Weather(ensureV39ClimateProfile(map),state.worldEnvironment?.weather,turn);
    const activeDisasters=[...(state.worldEnvironment?.activeDisasters||[]).filter(event=>!event.persistentHazard),...projectV39HazardEvents(map,turn)];
    if(weather!==state.worldEnvironment?.weather||JSON.stringify(activeDisasters)!==JSON.stringify(state.worldEnvironment?.activeDisasters))window.setV39GameState({worldEnvironment:{...state.worldEnvironment,weather,activeDisasters}},{reason:'weather-initialized'});
  };
  window.addEventListener('v39:field-generated',initializeWeather);
  window.addEventListener('v39:save-loaded',initializeWeather);
  window.addEventListener('v39:cave-world-ready',initializeWeather);
  window.inspectV39WeatherAt=(x,y)=>{
    const state=window.getV39GameState?.({includeWorlds:false});
    return inspectV39WeatherAt(window.__v39FieldRuntime?.mapData,state?.worldEnvironment?.weather,Number(x),Number(y));
  };
  window.setV39TestWeatherAt=(x,y,type)=>{
    const state=window.getV39GameState?.(),map=window.__v39FieldRuntime?.mapData;
    if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.()||!state||!map||map.isUnderground)return false;
    const next=setV39WeatherAt(map,state.worldEnvironment?.weather,state.timeline.turnNumber,Number(x),Number(y),type);
    if(!next)return false;
    window.setV39GameState({worldEnvironment:{...state.worldEnvironment,weather:next}},{reason:'weather-test-change'});
    return true;
  };
  initializeWeather();
  window.resolveV39CorpseUndead = turn => {
    const state = window.getV39GameState?.(), map = window.__v39FieldRuntime?.mapData;
    if (!state || !map) return null;
    const result = convertV39CorpsesInDeathFog(state, map, turn, { createEnemy:createV39EventEnemy });
    if (!result) return null;
    const { spawned, ...patch } = result;
    patch.neutralVillages = syncNeutralVillageUndeadThreats(patch.neutralVillages, patch.enemies, turn);
    window.setV39GameState?.(patch, { reason:"corpse-undead-conversion" });
    const playerIds = (state.players || []).map(player => player.id);
    for (const row of spawned) window.appendV39ActivityLog?.(playerIds, "アンデッド化",
      `${row.enemy.name} Lv${row.enemy.level}: (${row.origin.x},${row.origin.y})の死体が変化${row.origin.source ? " / 死の霧発生源" : ""}`, row);
    return { spawned };
  };
  window.addEventListener("v39:turn-stage-world", event => runV39NaturalEvents({ turnNumber:event?.detail?.turnNumber }));
  window.forceV39Disaster = (disasterId, position = null) => runV39NaturalEvents({ force:true, forceDisasterId:disasterId, forceDisasterAt:position });
  window.forceV39UndeadSpawn = position => runV39NaturalEvents({ force:true, forceUndeadAt:position, skipNaturalDisasters:true });
  window.inspectV39NaturalEvents = () => {
    const state = window.getV39GameState?.();
    return {
      rules:disasterRows().map(row => readRule(row)),
      activeDisasters:state?.worldEnvironment?.activeDisasters || [],
      recentEvents:state?.worldEnvironment?.lastDisasterEvents || [],
      diagnostics:state?.worldEnvironment?.disasterDiagnostics || null
    };
  };
}

install();
