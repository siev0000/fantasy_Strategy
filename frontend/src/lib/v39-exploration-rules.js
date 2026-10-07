import { getGameDataRows } from "./game-data-registry.js";
import { V39_SURVEY_BALANCE } from "./v39-gameplay-balance.js";
import { isV39UnitWaiting } from "./v39-unit-action-rules.js";
import { resolveV39UnitVisionRange } from "./v39-detection-rules.js";
import { getHexNeighborCoords } from "./hex-grid.js";
import { isV39UnitInWorld } from "./v39-cave-spatial-rules.js";
import { getSelectedSettlement, replaceFactionSettlement } from "./settlement-state.js";
import { getV39VictoryLandmarkDefinition, isV39VictoryLandmark } from "./v39-victory-landmarks.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const RESOURCE_ROWS = getGameDataRows("都市基本データ")
  .filter(row => text(row?.データ分類) && text(row?.分類));
const resourceKeysFor = categories => Object.freeze([...new Set(RESOURCE_ROWS
  .filter(row => categories.includes(text(row?.分類)))
  .map(row => text(row?.データ分類)))]);
const FOOD_KEYS = resourceKeysFor(["食料"]);
const RARE_KEYS = resourceKeysFor(["貴金属", "宝石", "特殊資源"]);
const ALL_RESOURCE_KEYS = resourceKeysFor(["食料", "木材", "石材", "金属", "貴金属", "宝石", "特殊資源"]);
const TERRAIN_DEFINITION_BY_NAME = new Map(getGameDataRows("地形")
  .map(row => [text(row?.地形), row])
  .filter(([name]) => name));
const SITE_RATE = 0.02;
const DANGER_REDUCTION_BASE = 15;

const coordKey = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;

function occupiedFeatureKeys(feature, fallbackKey) {
  if (!isV39VictoryLandmark(feature)) return [fallbackKey];
  const keys = Array.isArray(feature?.occupiedTileKeys) ? feature.occupiedTileKeys.map(text).filter(Boolean) : [];
  return [...new Set(keys.length ? keys : [fallbackKey])];
}

function claimFeatureTerritory(feature, fallbackKey, playerId, settlementId, territoryOwnerByTile, territoryStateByTile) {
  const keys = occupiedFeatureKeys(feature, fallbackKey);
  for (const key of keys) {
    territoryOwnerByTile[key] = playerId;
    territoryStateByTile[key] = { status:"領土", settlementId };
  }
  return keys;
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isFeatureDefinition(row) {
  if (!text(row?.地形) || row?.移動コスト !== null) return false;
  const rare = RARE_KEYS.some(key => number(row?.[key]) > 0);
  const restorativeFood = number(row?.回復) > 0 && FOOD_KEYS.some(key => number(row?.[key]) > 0);
  return rare || restorativeFood;
}

export function v39ExplorationFeatureDefinitions() {
  return getGameDataRows("地形").filter(isFeatureDefinition).map(row => ({
    id:`地形:${text(row.地形)}`,
    name:text(row.地形),
    yields:Object.fromEntries(ALL_RESOURCE_KEYS
      .map(key => [key, Math.max(0, number(row?.[key]))]).filter(([, value]) => value > 0)),
    recoveryPercent:Math.max(0, number(row?.回復)),
    dangerPercent:Math.max(0, number(row?.モンスター危険度) * 100),
    source:row
  }));
}

function isPassable(mapData, x, y) {
  return !["海", "湖"].includes(text(mapData?.grid?.[y]?.[x]));
}

function terrainAffinity(feature, mapData, x, y) {
  const specialName = text(mapData?.specialMap?.[y]?.[x]);
  const terrainName = specialName || text(mapData?.grid?.[y]?.[x]);
  const terrainRow = TERRAIN_DEFINITION_BY_NAME.get(terrainName);
  if (!terrainRow) return 1;
  const matchingYield = Object.keys(feature?.yields || {})
    .reduce((sum, key) => sum + Math.max(0, number(terrainRow?.[key])), 0);
  return 1 + Math.min(3, Math.floor(matchingYield / 50));
}

export function generateV39ExplorationSites(mapData, options = {}) {
  const definitions = v39ExplorationFeatureDefinitions();
  if (!definitions.length || !mapData?.grid) return {};
  const reservedTileKeys = new Set(Array.isArray(options?.reservedTileKeys) ? options.reservedTileKeys.map(text) : []);
  const candidates = [];
  for (let y = 0; y < number(mapData.h); y += 1) for (let x = 0; x < number(mapData.w); x += 1) {
    if (!isPassable(mapData, x, y) || mapData?.lavaMap?.[y]?.[x] || reservedTileKeys.has(coordKey(x, y))) continue;
    const key = coordKey(x, y);
    candidates.push({ x, y, key, score:hashText(`${options.seed || "v39"}:${key}:${text(mapData.grid[y][x])}`) });
  }
  candidates.sort((a, b) => a.score - b.score);
  const count = Math.max(definitions.length, Math.floor(candidates.length * SITE_RATE));
  const sites = {};
  for (const tile of candidates.slice(0, Math.min(count, candidates.length))) {
    const weighted = definitions.flatMap(definition => Array.from({ length:terrainAffinity(definition, mapData, tile.x, tile.y) }, () => definition));
    const definition = weighted[hashText(`${tile.key}:feature`) % weighted.length];
    sites[tile.key] = { id:`site:${tile.key}`, key:tile.key, x:tile.x, y:tile.y, featureId:definition.id, featureName:definition.name };
  }
  return sites;
}

function resolveExplorationSiteDefinition(site) {
  if (isV39VictoryLandmark(site)) return getV39VictoryLandmarkDefinition(site?.landmarkId || site?.featureId);
  return v39ExplorationFeatureDefinitions().find(row => row.id === site?.featureId);
}

export function getV39SurveyTileKeys(unit, map = window.__v39FieldRuntime?.mapData) {
  const x = Math.floor(number(unit?.x, -1)), y = Math.floor(number(unit?.y, -1));
  if (x < 0 || y < 0) return [];
  const queue = [{ x, y, distance:0 }];
  const visited = new Set([coordKey(x, y)]);
  if (!map?.w || !map?.h) return [...visited];
  if (x >= map.w || y >= map.h) return [];
  const range = resolveV39UnitVisionRange(unit);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.distance >= range) continue;
    for (const tile of getHexNeighborCoords(map.w, map.h, current.x, current.y, !!map.worldWrapEnabled)) {
      if (visited.has(tile.key)) continue;
      visited.add(tile.key); queue.push({ ...tile, distance:current.distance + 1 });
    }
  }
  return [...visited];
}

export function inspectV39Survey(state, playerId, unitId, tile, map) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const faction = player?.factionState;
  const unit = faction?.units?.find(row => text(row?.id) === text(unitId));
  const x = Math.floor(number(tile?.x, Number.NaN));
  const y = Math.floor(number(tile?.y, Number.NaN));
  const key = Number.isFinite(x) && Number.isFinite(y) ? coordKey(x, y) : "";
  const reasons = [];
  if (!player || !unit) reasons.push("調査するキャラクターを選択してください");
  if(unit&&!isV39UnitInWorld(unit,state?.activeWorldId))reasons.push("このキャラクターは別のマップにいます");
  if(state?.timeline?.phase&&state.timeline.phase!=="player")reasons.push("操作ターンに実行してください");
  if (!key) reasons.push("マスを選択してください");
  if (unit && (number(unit.hp ?? unit.currentHp) <= 0 || text(unit.state || unit.statusName) === "死亡")) reasons.push("死亡したキャラクターは調査できません");
  if (unit && key && (Math.floor(number(unit.x, -1)) !== x || Math.floor(number(unit.y, -1)) !== y)) reasons.push("キャラクターと同じマスで実行してください");
  const apCost = Math.max(0, number(unit?.ap ?? unit?.currentAp ?? unit?.actionPoint));
  if (unit && apCost <= 0) reasons.push("APがありません");
  if (unit && isV39UnitWaiting(unit, state?.timeline?.turnNumber)) reasons.push("このターンは待機済みです");
  if (unit?.surveyTask && (unit.surveyTask.key !== key || number(unit.surveyTask.progressAp, V39_SURVEY_BALANCE.requiredAp) >= V39_SURVEY_BALANCE.requiredAp)) reasons.push("すでに調査中です");
  const groundLoot = state?.groundLootByTile?.[key];
  const groundLootDiscovered = groundLoot?.discoveredByPlayerIds?.includes(text(playerId));
  const hasUndiscoveredGroundLoot = !!groundLoot && !groundLootDiscovered;
  const tileKeys = getV39SurveyTileKeys(unit, map);
  const surveyed = new Set(faction?.exploration?.surveyedTileKeys || []);
  const hasUnsurveyed = tileKeys.some(key => !surveyed.has(key)
    || (state?.groundLootByTile?.[key] && !state.groundLootByTile[key].discoveredByPlayerIds?.includes(text(playerId)))
    || (state?.specialtiesByTile?.[key] && !faction?.exploration?.discoveredSpecialtiesByTile?.[key]));
  if (!hasUnsurveyed && !hasUndiscoveredGroundLoot) reasons.push("索敵範囲は調査済みです");
  return { available:reasons.length === 0, reasons, player, faction, unit, x, y, key, apCost, tileKeys };
}

export function startV39SurveyTask(state, playerId, unitId, tile, map) {
  const check = inspectV39Survey(state, playerId, unitId, tile, map);
  if (!check.available) return { ok:false, reason:check.reasons.join(" / "), state };
  const turn = Math.max(1, Math.floor(number(state?.timeline?.turnNumber, 1)));
  const progressAp = Math.min(V39_SURVEY_BALANCE.requiredAp, number(check.unit.surveyTask?.progressAp) + check.apCost);
  const task = { key:check.key, x:check.x, y:check.y, startedTurn:check.unit.surveyTask?.startedTurn ?? turn,
    tileKeys:check.unit.surveyTask?.tileKeys || check.tileKeys,
    remainingTurns:1, totalTurns:1, progressAp, progressPercent:progressAp / V39_SURVEY_BALANCE.requiredAp * 100 };
  const players = state.players.map(player => player.id !== check.player.id ? player : ({
    ...player,
    factionState:{ ...player.factionState, units:player.factionState.units.map(unit => unit.id === check.unit.id ? { ...unit, surveyTask:task, ap:0, currentAp:0, actionPoint:0, lastAction:"調査", lastActionTurn:turn } : unit) }
  }));
  return { ok:true, state:{ ...state, players }, task, unit:check.unit, apCost:check.apCost };
}

function appendLog(faction, entry) {
  return [...(Array.isArray(faction?.activityLog) ? faction.activityLog : []), entry].slice(-200);
}

export function advanceV39ExplorationTurn(state, turnNumber) {
  const turn = Math.max(1, Math.floor(number(turnNumber, state?.timeline?.turnNumber || 1)));
  const reports = [];
  const dangerPercentByTile = { ...(state?.dangerPercentByTile || {}) };
  const territoryOwnerByTile = { ...(state?.territoryOwnerByTile || {}) };
  const territoryStateByTile = { ...(state?.territoryStateByTile || {}) };
  const groundLootByTile = Object.fromEntries(Object.entries(state?.groundLootByTile || {})
    .map(([key, value]) => [key, { ...value, discoveredByPlayerIds:[...(value?.discoveredByPlayerIds || [])] }]));
  const players = (state?.players || []).map(player => {
    const faction = player?.factionState || {};
    const selectedSettlement = getSelectedSettlement(faction);
    const exploration = faction.exploration || { discoveredFeaturesByTile:{}, surveyedTileKeys:[], history:[], lastProcessedTurn:0 };
    if (number(exploration.lastProcessedTurn) >= turn) return player;
    const discoveredFeaturesByTile = { ...(exploration.discoveredFeaturesByTile || {}) };
    const discoveredSpecialtiesByTile = { ...(exploration.discoveredSpecialtiesByTile || {}) };
    const surveyed = new Set(exploration.surveyedTileKeys || []);
    const history = [...(exploration.history || [])];
    let activityLog = [...(faction.activityLog || [])];
    const units = (faction.units || []).map(unit => {
      const task = unit?.surveyTask;
      if (!task) return unit;
      const alive = number(unit.hp ?? unit.currentHp) > 0 && text(unit.state || unit.statusName) !== "死亡";
      const present = Math.floor(number(unit.x, -1)) === Math.floor(number(task.x)) && Math.floor(number(unit.y, -1)) === Math.floor(number(task.y));
      if (!alive || !present) {
        const report = { type:"survey-cancelled", playerId:player.id, unitId:unit.id, unitName:unit.name, key:task.key, turn, message:`調査中断: ${text(unit.name) || "キャラクター"} (${task.key})` };
        reports.push(report); history.push(report); activityLog = appendLog({ activityLog }, report);
        const { surveyTask, ...rest } = unit;
        return rest;
      }
      // 旧セーブのAP項目がない1T調査は従来どおり完了する。
      if (number(task.progressAp, V39_SURVEY_BALANCE.requiredAp) < V39_SURVEY_BALANCE.requiredAp) return unit;
      // 開始時の索敵範囲を固定。途中で索敵値が変化しても進捗の対象を変えない。
      for (const key of task.tileKeys?.length ? task.tileKeys : [task.key]) {
        const site = state?.explorationSitesByTile?.[key] || null;
        const feature = site ? resolveExplorationSiteDefinition(site) : null;
        if (site && feature) discoveredFeaturesByTile[key] = { ...site, discoveredTurn:turn, discoveredByUnitId:unit.id };
        const specialty = state?.specialtiesByTile?.[key];
        if (specialty) discoveredSpecialtiesByTile[key] = { ...specialty, discoveredTurn:turn, discoveredByUnitId:unit.id };
        const groundLoot = groundLootByTile[key];
        const groundLootDiscovered = !!groundLoot;
        if (groundLootDiscovered && !groundLoot.discoveredByPlayerIds.includes(text(player.id))) {
          groundLoot.discoveredByPlayerIds.push(text(player.id));
        }
        const alreadySurveyed = surveyed.has(key);
        surveyed.add(key);
        const beforeDanger = Math.max(0, number(dangerPercentByTile[key]));
        const level = Math.max(1, Math.floor(number(unit.level, 1)));
        const reduction = Math.max(1, Math.round(DANGER_REDUCTION_BASE * level / Math.max(1, Math.ceil(beforeDanger / 10))));
        dangerPercentByTile[key] = Math.max(0, beforeDanger - (alreadySurveyed ? 0 : reduction));
        const hasLivingEnemy = (state?.enemies || []).some(enemy => number(enemy.hp ?? enemy.currentHp) > 0 && coordKey(enemy.x, enemy.y) === key);
        // 通常土地の取得は拠点の開拓へ分離。勝利対象の専用獲得条件は維持する。
        const claimed = key === task.key && isV39VictoryLandmark(site) && dangerPercentByTile[key] <= 0 && !territoryOwnerByTile[key] && !hasLivingEnemy;
        let claimedTileKeys = [];
        if (claimed) {
          claimedTileKeys = claimFeatureTerritory(
            site,
            key,
            player.id,
            text(selectedSettlement?.settlementId || selectedSettlement?.id),
            territoryOwnerByTile,
            territoryStateByTile
          );
        }
        const foundText = [feature?.name, specialty?.name, groundLootDiscovered ? "残留品" : ""].filter(Boolean).join(" / ") || "異常なし";
        const report = { type:"survey-completed", playerId:player.id, unitId:unit.id, unitName:unit.name, key, claimedTileKeys, specialtyName:specialty?.name || "", featureId:feature?.id || "", featureName:feature?.name || "", groundLootDiscovered, dangerBefore:beforeDanger, dangerAfter:dangerPercentByTile[key], claimed, turn, message:`調査完了: ${text(unit.name) || "キャラクター"} (${key}) / ${foundText}${claimed ? " / 領地化" : ""}` };
        reports.push(report); history.push(report); activityLog = appendLog({ activityLog }, report);
      }
      const { surveyTask, ...rest } = unit;
      return rest;
    });
    // 勝利対象は守護排除後に同じ地点へ再調査できないため、発見済み・到達済みなら通常領土化を再判定する。
    const occupiedByLivingUnit = new Set(units
      .filter(unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state || unit?.statusName) !== "死亡")
      .map(unit => coordKey(unit?.x, unit?.y)));
    for (const [key, feature] of Object.entries(discoveredFeaturesByTile)) {
      if (!isV39VictoryLandmark(feature) || territoryOwnerByTile[key] || !occupiedByLivingUnit.has(key)) continue;
      const hasLivingEnemy = (state?.enemies || []).some(enemy => number(enemy?.hp ?? enemy?.currentHp) > 0 && coordKey(enemy.x, enemy.y) === key);
      if (number(dangerPercentByTile[key]) > 0 || hasLivingEnemy) continue;
      const claimedTileKeys = claimFeatureTerritory(
        feature,
        key,
        player.id,
        text(selectedSettlement?.settlementId || selectedSettlement?.id),
        territoryOwnerByTile,
        territoryStateByTile
      );
      const report = { type:"victory-landmark-claimed", playerId:player.id, key, claimedTileKeys, featureId:feature?.id || "", featureName:feature?.name || "", claimed:true, turn, message:`勝利対象を領土化: ${text(feature?.name) || key}` };
      reports.push(report); history.push(report); activityLog = appendLog({ activityLog }, report);
    }
    const territoryTileModeMap = { ...(selectedSettlement?.territoryTileModeMap || {}) };
    for (const report of reports.filter(row => row.playerId === player.id && row.claimed)) {
      for (const key of (report.claimedTileKeys?.length ? report.claimedTileKeys : [report.key])) territoryTileModeMap[key] = "resource";
    }
    const factionState = selectedSettlement
      ? replaceFactionSettlement({ ...faction, units, activityLog, exploration:{ ...exploration, discoveredFeaturesByTile, discoveredSpecialtiesByTile, surveyedTileKeys:[...surveyed], history:history.slice(-200), lastProcessedTurn:turn } }, { ...selectedSettlement, territoryTileModeMap }, { ownerPlayerId:player.id })
      : { ...faction, units, activityLog, exploration:{ ...exploration, discoveredFeaturesByTile, discoveredSpecialtiesByTile, surveyedTileKeys:[...surveyed], history:history.slice(-200), lastProcessedTurn:turn } };
    return { ...player, factionState };
  });
  return { state:{ ...state, players, dangerPercentByTile, territoryOwnerByTile, territoryStateByTile, groundLootByTile }, reports };
}

export function getV39DiscoveredFeature(faction, key) {
  const site = faction?.exploration?.discoveredFeaturesByTile?.[text(key)];
  if (!site) return null;
  const definition = resolveExplorationSiteDefinition(site);
  return definition ? { ...site, definition } : null;
}

export const V39_EXPLORATION_RULES = Object.freeze({ siteRate:SITE_RATE, requiredTurns:1, requiredAp:V39_SURVEY_BALANCE.requiredAp, dangerReductionBase:DANGER_REDUCTION_BASE });
