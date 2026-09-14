import { getGameDataRows } from "./game-data-registry.js";

const FOOD_KEYS = Object.freeze(["穀物", "野菜", "肉", "魚"]);
const RARE_KEYS = Object.freeze(["金", "銀", "宝石"]);
const SITE_RATE = 0.02;
const DANGER_REDUCTION_BASE = 15;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const coordKey = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;

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
    yields:Object.fromEntries([...FOOD_KEYS, "木材", "黒木", "特木", "石材", "鉄", "銀鉄", "青金鋼", "赤黒鋼", ...RARE_KEYS]
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
  const terrain = `${text(mapData?.grid?.[y]?.[x])}/${text(mapData?.reliefMap?.[y]?.[x])}/${text(mapData?.specialMap?.[y]?.[x])}`;
  const rocky = ["山", "丘", "峡谷", "洞窟", "火山"].some(label => terrain.includes(label));
  const green = ["森", "平地", "湿地", "沼", "草原"].some(label => terrain.includes(label));
  const hasRareOre = RARE_KEYS.some(key => number(feature?.yields?.[key]) > 0);
  if (hasRareOre) return rocky ? 4 : 1;
  return green ? 3 : 1;
}

export function generateV39ExplorationSites(mapData, options = {}) {
  const definitions = v39ExplorationFeatureDefinitions();
  if (!definitions.length || !mapData?.grid) return {};
  const candidates = [];
  for (let y = 0; y < number(mapData.h); y += 1) for (let x = 0; x < number(mapData.w); x += 1) {
    if (!isPassable(mapData, x, y) || mapData?.lavaMap?.[y]?.[x]) continue;
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

export function inspectV39Survey(state, playerId, unitId, tile) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const faction = player?.factionState;
  const unit = faction?.units?.find(row => text(row?.id) === text(unitId));
  const x = Math.floor(number(tile?.x, Number.NaN));
  const y = Math.floor(number(tile?.y, Number.NaN));
  const key = Number.isFinite(x) && Number.isFinite(y) ? coordKey(x, y) : "";
  const reasons = [];
  if (!player || !unit) reasons.push("調査するキャラクターを選択してください");
  if (!key) reasons.push("マスを選択してください");
  if (unit && (number(unit.hp ?? unit.currentHp) <= 0 || text(unit.state || unit.statusName) === "死亡")) reasons.push("死亡したキャラクターは調査できません");
  if (unit && key && (Math.floor(number(unit.x, -1)) !== x || Math.floor(number(unit.y, -1)) !== y)) reasons.push("キャラクターと同じマスで実行してください");
  if (unit?.surveyTask) reasons.push("すでに調査中です");
  if (faction?.exploration?.surveyedTileKeys?.includes(key)) reasons.push("調査済みです");
  return { available:reasons.length === 0, reasons, player, faction, unit, x, y, key };
}

export function startV39SurveyTask(state, playerId, unitId, tile) {
  const check = inspectV39Survey(state, playerId, unitId, tile);
  if (!check.available) return { ok:false, reason:check.reasons.join(" / "), state };
  const turn = Math.max(1, Math.floor(number(state?.timeline?.turnNumber, 1)));
  const task = { key:check.key, x:check.x, y:check.y, startedTurn:turn, remainingTurns:1, totalTurns:1 };
  const players = state.players.map(player => player.id !== check.player.id ? player : ({
    ...player,
    factionState:{ ...player.factionState, units:player.factionState.units.map(unit => unit.id === check.unit.id ? { ...unit, surveyTask:task } : unit) }
  }));
  return { ok:true, state:{ ...state, players }, task, unit:check.unit };
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
  const players = (state?.players || []).map(player => {
    const faction = player?.factionState || {};
    const exploration = faction.exploration || { discoveredFeaturesByTile:{}, surveyedTileKeys:[], history:[], lastProcessedTurn:0 };
    if (number(exploration.lastProcessedTurn) >= turn) return player;
    const discoveredFeaturesByTile = { ...(exploration.discoveredFeaturesByTile || {}) };
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
      const site = state?.explorationSitesByTile?.[task.key] || null;
      const feature = site ? v39ExplorationFeatureDefinitions().find(row => row.id === site.featureId) : null;
      if (site && feature) discoveredFeaturesByTile[task.key] = { ...site, discoveredTurn:turn, discoveredByUnitId:unit.id };
      surveyed.add(task.key);
      const beforeDanger = Math.max(0, number(dangerPercentByTile[task.key]));
      const level = Math.max(1, Math.floor(number(unit.level, 1)));
      const reduction = Math.max(1, Math.round(DANGER_REDUCTION_BASE * level / Math.max(1, Math.ceil(beforeDanger / 10))));
      dangerPercentByTile[task.key] = Math.max(0, beforeDanger - reduction);
      const hasLivingEnemy = (state?.enemies || []).some(enemy => number(enemy.hp ?? enemy.currentHp) > 0 && coordKey(enemy.x, enemy.y) === task.key);
      const claimed = dangerPercentByTile[task.key] <= 0 && !territoryOwnerByTile[task.key] && !hasLivingEnemy;
      if (claimed) {
        territoryOwnerByTile[task.key] = player.id;
        territoryStateByTile[task.key] = "領土";
      }
      const foundText = feature ? feature.name : "異常なし";
      const report = { type:"survey-completed", playerId:player.id, unitId:unit.id, unitName:unit.name, key:task.key, featureId:feature?.id || "", featureName:feature?.name || "", dangerBefore:beforeDanger, dangerAfter:dangerPercentByTile[task.key], claimed, turn, message:`調査完了: ${text(unit.name) || "キャラクター"} (${task.key}) / ${foundText}${claimed ? " / 領地化" : ""}` };
      reports.push(report); history.push(report); activityLog = appendLog({ activityLog }, report);
      const { surveyTask, ...rest } = unit;
      return rest;
    });
    const territoryTileModeMap = { ...(faction?.village?.territoryTileModeMap || {}) };
    for (const report of reports.filter(row => row.playerId === player.id && row.claimed)) territoryTileModeMap[report.key] = "resource";
    const village = faction?.village ? { ...faction.village, territoryTileModeMap } : faction?.village;
    return { ...player, factionState:{ ...faction, village, units, activityLog, exploration:{ discoveredFeaturesByTile, surveyedTileKeys:[...surveyed], history:history.slice(-200), lastProcessedTurn:turn } } };
  });
  return { state:{ ...state, players, dangerPercentByTile, territoryOwnerByTile, territoryStateByTile }, reports };
}

export function getV39DiscoveredFeature(faction, key) {
  const site = faction?.exploration?.discoveredFeaturesByTile?.[text(key)];
  if (!site) return null;
  const definition = v39ExplorationFeatureDefinitions().find(row => row.id === site.featureId || row.name === site.featureName);
  return definition ? { ...site, definition } : null;
}

export const V39_EXPLORATION_RULES = Object.freeze({ siteRate:SITE_RATE, requiredTurns:1, dangerReductionBase:DANGER_REDUCTION_BASE });
