import { disasterData, terrainData } from "../../lib/game-data-registry.js";
import { getHexDistance } from "../../lib/hex-grid.js";
import {
  V39_PROVISIONAL_DISASTER_BALANCE,
  V39_UNDEAD_SPAWN_BALANCE
} from "../../lib/v39-gameplay-balance.js";
import { createV39EventEnemy } from "../ai/v39-enemy-spawn.js";
import { normalizeV39NeutralVillage } from "../../lib/v39-neutral-village-rules.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const tileKey = (x, y) => `${integer(x)},${integer(y)}`;
const isLiving = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state) !== "死亡";

// スプレッドシートの空欄・nullは0ではなく未設定として暫定値へフォールバックする。
function configuredNumber(value, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  return number(value, fallback);
}

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
  return mapTiles(mapData).filter(tile => getHexDistance(anchor, tile) <= distance);
}

function disasterRows() {
  return (Array.isArray(disasterData) ? disasterData : [])
    .filter(row => text(row?.ID) && text(row?.ID) !== "災害:火山噴火");
}

function readRule(row) {
  const fallback = V39_PROVISIONAL_DISASTER_BALANCE.rulesById[text(row?.ID)] || {};
  const terrain = text(row?.対象地形);
  return {
    id:text(row?.ID),
    name:text(row?.カテゴリ名),
    description:text(row?.効果),
    icon:text(row?.アイコン) || text(fallback.icon) || "!",
    chance:Math.max(0, configuredNumber(row?.基本発生率, number(fallback.chance))),
    targetTerrain:terrain ? terrain.split(/[、,，|/]/u).map(text).filter(Boolean) : (fallback.targetTerrain || []),
    targetMode:text(row?.対象種別) || text(fallback.targetMode) || "terrain",
    radius:Math.max(0, integer(configuredNumber(row?.影響半径, fallback.radius))),
    duration:Math.max(1, integer(configuredNumber(row?.効果継続ターン, fallback.duration || 1))),
    yieldMultiplier:Math.max(0, configuredNumber(row?.周囲産出倍率, number(fallback.yieldMultiplier, 1))),
    securityLoss:Math.max(0, configuredNumber(row?.治安減少, number(fallback.securityLoss))),
    unitDamageRate:Math.max(0, configuredNumber(row?.最大HP割合ダメージ, number(fallback.unitDamageRate))),
    spawnEnemy:row?.敵生成 === true || fallback.spawnEnemy === true,
    undeadBonus:row?.アンデッド発生補正 === true || fallback.undeadBonus === true
  };
}

function recentSameEvent(environment, rule, key, turn) {
  const cooldown = V39_PROVISIONAL_DISASTER_BALANCE.sameTileCooldownTurns;
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

function chooseAnchor(state, mapData, rule, turn, forcedPosition = null) {
  if (forcedPosition && Number.isFinite(Number(forcedPosition.x)) && Number.isFinite(Number(forcedPosition.y))) {
    return { x:integer(forcedPosition.x), y:integer(forcedPosition.y), key:tileKey(forcedPosition.x, forcedPosition.y) };
  }
  const source = rule.targetMode === "settlement"
    ? settlementAnchors(state)
    : mapTiles(mapData, rule.targetTerrain);
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
    spawnEnemy:rule.spawnEnemy,
    undeadBonus:rule.undeadBonus,
    lastTickTurn:turn - 1
  };
}

function createNaturalDisasters(state, mapData, turn, forceRuleId = "", forcedPosition = null) {
  const environment = state?.worldEnvironment || {};
  const events = [];
  for (const row of disasterRows()) {
    const rule = readRule(row);
    const forced = text(forceRuleId) === rule.id;
    // テスト強制時は選択した1種だけを発生させ、同ターンの通常抽選を混ぜない。
    if (forceRuleId && !forced) continue;
    if (!forced && events.length >= V39_PROVISIONAL_DISASTER_BALANCE.maximumNaturalEventsPerTurn) continue;
    const anchor = chooseAnchor(state, mapData, rule, turn, forced ? forcedPosition : null);
    if (!anchor || (!forced && recentSameEvent(environment, rule, anchor.key, turn))) continue;
    const terrainAffinity = terrainAffinityMultiplier(rule, anchor.terrain || mapTileText(mapData, anchor.x, anchor.y));
    if (!forced && roll(`${rule.id}:T${turn}`) >= rule.chance * terrainAffinity) continue;
    events.push(buildDisasterEvent(rule, mapData, anchor, turn, forced, terrainAffinity));
    if (forced) break;
  }
  return events;
}

function damageUnit(unit, amount, turn, source) {
  if (!isLiving(unit) || amount <= 0) return { unit, entry:null };
  const hp = Math.max(0, number(unit?.hp ?? unit?.currentHp));
  const maxHp = Math.max(1, number(unit?.maxHp ?? unit?.status?.HP, hp));
  const damage = Math.min(hp, Math.max(1, Math.ceil(maxHp * amount)));
  const nextHp = Math.max(0, hp - damage);
  return {
    unit:{ ...unit, hp:nextHp, currentHp:nextHp, ...(nextHp <= 0 ? { state:"死亡", deathCause:source, deathTurn:turn } : {}) },
    entry:{ unitId:text(unit?.id), name:text(unit?.name, "ユニット"), damage, beforeHp:hp, afterHp:nextHp, source }
  };
}

function tickDisasterDamage(state, mapData, activeDisasters, turn) {
  const damageEvents = activeDisasters.filter(event => integer(event?.lastTickTurn) < turn && number(event?.unitDamageRate) > 0);
  if (!damageEvents.length) return { players:state.players, enemies:state.enemies, neutralVillages:state.neutralVillages, activeDisasters, entries:[] };
  const damageByKey = new Map();
  for (const event of damageEvents) for (const key of event.tileKeys || []) {
    damageByKey.set(text(key), Math.max(number(damageByKey.get(text(key))), number(event.unitDamageRate)));
  }
  const entries = [];
  const players = (state.players || []).map(player => ({
    ...player,
    factionState:{
      ...player.factionState,
      units:(player?.factionState?.units || []).map(unit => {
        const rate = damageByKey.get(tileKey(unit.x, unit.y)) || 0;
        const result = damageUnit(unit, rate, turn, "災害");
        if (result.entry) entries.push({ ...result.entry, playerId:player.id });
        return result.unit;
      })
    }
  }));
  const enemies = (state.enemies || []).map(unit => {
    const result = damageUnit(unit, damageByKey.get(tileKey(unit.x, unit.y)) || 0, turn, "災害");
    if (result.entry) entries.push(result.entry);
    return result.unit;
  });
  const neutralVillages = (state.neutralVillages || []).map(source => {
    const affectedRate = Math.max(0, ...(source?.territoryTileKeys || [tileKey(source?.x, source?.y)])
      .map(key => number(damageByKey.get(text(key)))));
    const defenseUnits = (source?.defenseUnits || []).map(unit => {
      const result = damageUnit(unit, damageByKey.get(tileKey(unit.x, unit.y)) || 0, turn, "災害");
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
    activeDisasters:activeDisasters.map(event => integer(event?.lastTickTurn) < turn ? { ...event, lastTickTurn:turn } : event)
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
  const origins = [];
  for (const tile of mapTiles(mapData)) {
    const terrain = mapTileText(mapData, tile.x, tile.y);
    if (terrain.some(value => value.includes("死の霧"))) origins.push({ ...tile, source:"死の霧", chance:V39_UNDEAD_SPAWN_BALANCE.deathMistChancePerTile });
  }
  for (const [key, loot] of Object.entries(state?.groundLootByTile || {})) {
    if (corpseAmount(loot) < 1) continue;
    const [x, y] = key.split(",").map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) origins.push({ x, y, key:tileKey(x, y), source:"死体", chance:V39_UNDEAD_SPAWN_BALANCE.corpseChancePerTile });
  }
  for (const event of activeDisasters || []) {
    if (event?.undeadBonus !== true) continue;
    for (const key of event?.tileKeys || []) {
      const [x, y] = String(key).split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) origins.push({ x, y, key:tileKey(x, y), source:event.name, chance:V39_UNDEAD_SPAWN_BALANCE.disasterBonusChancePerTile });
    }
  }
  return [...new Map(origins.map(origin => [origin.key, origin])).values()];
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
  if (before < 1) return groundLootByTile;
  const resourcesByType = { ...(cargo?.resourcesByType || {}), 死体:before - 1 };
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
  let groundLootByTile = { ...(state?.groundLootByTile || {}) };
  for (const origin of origins.sort((left, right) => left.key.localeCompare(right.key, "ja"))) {
    if (spawned.length >= V39_UNDEAD_SPAWN_BALANCE.maximumSpawnCountPerTurn && !forcePosition) break;
    const terrain = mapTileText(mapData, origin.x, origin.y);
    if (terrain.some(value => ["海", "湖", "火山"].includes(value)) || mapData?.lavaMap?.[origin.y]?.[origin.x]) continue;
    if (occupied.has(origin.key)) continue;
    const recent = history.some(event => event?.type === "undead-spawn" && text(event?.anchorKey) === origin.key && integer(event?.turn) > turn - cooldown);
    if (recent || (!forcePosition && roll(`undead:${origin.key}:T${turn}`) >= number(origin.chance))) continue;
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
    occupied.add(origin.key);
    if (origin.source === "死体") groundLootByTile = consumeCorpse(groundLootByTile, origin.key);
  }
  return { spawned, groundLootByTile };
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
    && enemy?.metadata?.isUndead === true
    && text(enemy?.metadata?.spawnType) === "アンデッド自然発生"
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

function applyNaturalEvents({ state, mapData, turn, forceDisasterId = "", forceDisasterAt = null, forceUndeadAt = null, skipNaturalDisasters = false } = {}) {
  const environment = state?.worldEnvironment || {};
  const existing = (environment.activeDisasters || []).filter(event => integer(event?.expiresAtTurn, turn) >= turn);
  const created = skipNaturalDisasters ? [] : createNaturalDisasters(state, mapData, turn, forceDisasterId, forceDisasterAt);
  const activeDisasters = [...existing, ...created];
  const ticked = tickDisasterDamage(state, mapData, activeDisasters, turn);
  const stateAfterDamage = { ...state, players:ticked.players, enemies:ticked.enemies, neutralVillages:ticked.neutralVillages };
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
    lastDisasterEvents:eventHistory,
    activeDisasters:ticked.activeDisasters,
    activeTerrainEffects:combineEffects(environment, ticked.activeDisasters, turn),
    lastNaturalEventTurn:turn
  };
  const neutralVillageById = new Map(neutralVillages.map(village => [text(village?.id), village]));
  const settlements = (state?.settlements || []).map(settlement => neutralVillageById.get(text(settlement?.id)) || settlement);
  return { players:ticked.players, enemies, enemySquads, neutralVillages, settlements, groundLootByTile:undead.groundLootByTile, worldEnvironment, created, damageEntries:ticked.entries, undead:undead.spawned, spawnedByDisaster };
}

export function runV39NaturalEvents(options = {}) {
  const state = window.getV39GameState?.();
  const mapData = window.__v39FieldRuntime?.mapData;
  if (!state || !mapData) return { ok:false, reason:"field-not-generated" };
  const turn = Math.max(1, integer(options?.turnNumber, state?.timeline?.turnNumber));
  if (options?.force !== true && integer(state?.worldEnvironment?.lastNaturalEventTurn) >= turn) return { ok:false, reason:"already-processed" };
  const result = applyNaturalEvents({
    state,
    mapData,
    turn,
    forceDisasterId:text(options?.forceDisasterId),
    forceDisasterAt:options?.forceDisasterAt || null,
    forceUndeadAt:options?.forceUndeadAt || null,
    skipNaturalDisasters:mapData.isUnderground || options?.skipNaturalDisasters === true
  });
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
  for (const event of result.created) window.appendV39ActivityLog?.(allPlayers, "災害", `${event.name}が発生: (${event.x},${event.y}) / ${event.tileKeys.length}マス`, event);
  for (const row of result.undead) window.appendV39ActivityLog?.(allPlayers, "自然発生", `${row.enemy.name}が${row.origin.source}から発生: (${row.origin.x},${row.origin.y})`, row);
  window.dispatchEvent(new CustomEvent("v39:natural-events-resolved", { detail:{ turnNumber:turn, disasters:result.created, damageEntries:result.damageEntries, undead:result.undead } }));
  return { ok:true, turnNumber:turn, disasters:result.created, damageEntries:result.damageEntries, undead:result.undead };
}

function install() {
  window.addEventListener("v39:turn-stage-world", event => runV39NaturalEvents({ turnNumber:event?.detail?.turnNumber }));
  window.forceV39Disaster = (disasterId, position = null) => runV39NaturalEvents({ force:true, forceDisasterId:disasterId, forceDisasterAt:position });
  window.forceV39UndeadSpawn = position => runV39NaturalEvents({ force:true, forceUndeadAt:position, skipNaturalDisasters:true });
  window.inspectV39NaturalEvents = () => {
    const state = window.getV39GameState?.();
    return {
      rules:disasterRows().map(row => readRule(row)),
      activeDisasters:state?.worldEnvironment?.activeDisasters || [],
      recentEvents:state?.worldEnvironment?.lastDisasterEvents || []
    };
  };
}

install();
