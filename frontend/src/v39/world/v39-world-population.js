import { getGameDataRows } from "../../lib/game-data-registry.js";
import { getHexNeighborCoords } from "../../lib/hex-grid.js";
import { getSelectedSettlement, replaceFactionSettlement } from "../../lib/settlement-state.js";
import {
  acceptV39NeutralVillageQuest,
  advanceV39NeutralVillages,
  completeV39NeutralVillageQuest,
  getV39NeutralVillageRelation,
  getV39RelationLabel,
  improveV39NeutralVillageRelation,
  normalizeV39NeutralVillage,
  raidV39NeutralVillage,
  vassalizeV39NeutralVillage
} from "../../lib/v39-neutral-village-rules.js";
import { V39_NEUTRAL_VILLAGE_BALANCE } from "../../lib/v39-gameplay-balance.js";

const WANDERER_TILES_PER_GROUP = 300;
const MAX_WANDERER_GROUPS = 20;
let selectedTile = null;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const keyOf = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;
const normalizedRaceName = value => text(value) === "人間" ? "只人" : text(value);

function hash(value) {
  let result = 0;
  for (const char of String(value || "")) result = Math.imul(result ^ char.charCodeAt(0), 2654435761) >>> 0;
  return result;
}

function passableTiles(mapData) {
  const rows = [];
  for (let y = 0; y < number(mapData?.h); y += 1) for (let x = 0; x < number(mapData?.w); x += 1) {
    if (["海", "湖", "火山"].includes(text(mapData?.grid?.[y]?.[x])) || mapData?.lavaMap?.[y]?.[x]) continue;
    rows.push({ x, y, key:keyOf(x, y), terrain:text(mapData?.specialMap?.[y]?.[x]) || text(mapData?.grid?.[y]?.[x]) });
  }
  return rows;
}

function raceDefinitions() {
  return getGameDataRows("勢力").filter(row => text(row?.種族)).map(row => ({
    race:normalizedRaceName(row.種族),
    dataName:text(row.種族),
    preferredTerrain:text(row.土地),
    initialPopulation:Math.max(1, Math.floor(number(row.初期人数, 50)))
  }));
}

function terrainMatchesRace(tile, race) {
  const terrain = text(tile?.terrain);
  const preferredTerrains = text(race?.preferredTerrain).split(",").map(text).filter(Boolean);
  return preferredTerrains.some(preferred => terrain === preferred || terrain.includes(preferred) || preferred.includes(terrain));
}

function playerRaces(state) {
  return new Set((Array.isArray(state?.players) ? state.players : [])
    .map(player => normalizedRaceName(player?.race))
    .filter(Boolean));
}

function selectVillageRace(tile, races, usedRaces) {
  const unassigned = races.filter(race => !usedRaces.has(race.race));
  const terrainMatches = races.filter(race => terrainMatchesRace(tile, race));
  const candidates = unassigned.filter(race => terrainMatchesRace(tile, race)).length
    ? unassigned.filter(race => terrainMatchesRace(tile, race))
    : (unassigned.length ? unassigned : (terrainMatches.length ? terrainMatches : races));
  return candidates[hash(`${tile.key}:race`) % candidates.length];
}

function initialClasses() {
  return getGameDataRows("クラス").filter(row => text(row?.種類) === "職業" && text(row?.条件Lv) === "初期" && text(row?.名前));
}

function farFromOwned(tile, state, minimum = 5) {
  const occupied = Object.keys(state?.territoryOwnerByTile || {}).map(key => key.split(",").map(Number));
  return occupied.every(([x, y]) => Math.hypot(tile.x - x, tile.y - y) >= minimum);
}

function buildNeutralVillage(tile, index, races, classes, mapData, usedRaces) {
  const selectedRace = selectVillageRace(tile, races, usedRaces);
  const villageLevel = 1 + (hash(`${tile.key}:level`) % 3);
  const population = Math.max(10, Math.floor(selectedRace.initialPopulation * (0.6 + (hash(`${tile.key}:population`) % 81) / 100)));
  const classRow = classes[hash(`${tile.key}:class`) % Math.max(1, classes.length)];
  const researchLevels = Object.fromEntries(["鍛冶Lv", "魔法Lv", "信仰Lv", "軍事Lv", "経済Lv"].map((name, levelIndex) => [name, hash(`${tile.key}:${levelIndex}`) % (villageLevel + 1)]));
  return normalizeV39NeutralVillage({
    id:`neutral-village-${index + 1}-${tile.key}`,
    name:`${selectedRace.race}の村`, type:"村", neutral:true, placed:true,
    x:tile.x, y:tile.y, race:selectedRace.race, population, level:villageLevel,
    className:text(classRow?.名前) || "ファイター", researchLevels,
    relationsByPlayerId:{}, vassalPlayerId:"", directlyRuledByPlayerId:""
  }, mapData);
}

function buildWanderer(tile, index, races) {
  const race = races[hash(`${tile.key}:wanderer-race`) % races.length];
  return {
    id:`wanderer-${index + 1}-${tile.key}`, x:tile.x, y:tile.y, race:race.race,
    population:1 + (hash(`${tile.key}:wanderer-population`) % 20),
    createdTurn:1, discoveredByPlayerIds:[], sourceVillageId:""
  };
}

export function generateV39WorldPopulation(state, mapData, options = {}) {
  const races = raceDefinitions();
  const classes = initialClasses();
  if (!races.length || !mapData?.grid) return { neutralVillages:[], wandererGroups:[] };
  const tiles = passableTiles(mapData).filter(tile => farFromOwned(tile, state)).sort((a, b) => hash(a.key) - hash(b.key));
  const configuredVillageCount = Math.max(0, Math.min(
    V39_NEUTRAL_VILLAGE_BALANCE.maxInitialVillageCount,
    Math.floor(number(options?.neutralVillageCount, V39_NEUTRAL_VILLAGE_BALANCE.initialVillageCount))
  ));
  const usedRaces = playerRaces(state);
  const neutralVillages = [];
  for (const tile of tiles) {
    if (neutralVillages.length >= configuredVillageCount) break;
    if (neutralVillages.some(row => Math.hypot(row.x - tile.x, row.y - tile.y) < 7)) continue;
    const village = buildNeutralVillage(tile, neutralVillages.length, races, classes, mapData, usedRaces);
    neutralVillages.push(village);
    usedRaces.add(village.race);
  }
  const villageKeys = new Set(neutralVillages.map(row => keyOf(row.x, row.y)));
  const wandererCount = Math.min(MAX_WANDERER_GROUPS, Math.max(1, Math.floor(tiles.length / WANDERER_TILES_PER_GROUP)));
  const wandererGroups = tiles.filter(tile => !villageKeys.has(tile.key)).slice(0, wandererCount).map((tile, index) => buildWanderer(tile, index, races));
  return { neutralVillages, wandererGroups };
}

function neighbors(mapData, x, y) {
  return getHexNeighborCoords(mapData.w, mapData.h, x, y, false)
    .filter(tile => !["海", "湖", "火山"].includes(text(mapData.grid?.[tile.y]?.[tile.x])) && !mapData?.lavaMap?.[tile.y]?.[tile.x]);
}

export function advanceV39WorldPopulation(state, mapData, turnNumber) {
  const turn = Math.max(1, Math.floor(number(turnNumber, state?.timeline?.turnNumber || 1)));
  const occupied = new Set((state?.enemies || []).map(row => keyOf(row.x, row.y)));
  for (const village of state?.neutralVillages || []) occupied.add(keyOf(village.x, village.y));
  const wandererGroups = (state?.wandererGroups || []).map(group => {
    const options = neighbors(mapData, group.x, group.y).filter(tile => !occupied.has(keyOf(tile.x, tile.y)));
    const next = options.length ? options[hash(`${group.id}:T${turn}`) % options.length] : group;
    occupied.add(keyOf(next.x, next.y));
    const discovered = new Set(group.discoveredByPlayerIds || []);
    for (const player of state?.players || []) if ((player?.factionState?.units || []).some(unit => number(unit.hp ?? unit.currentHp) > 0 && keyOf(unit.x, unit.y) === keyOf(next.x, next.y))) discovered.add(player.id);
    return { ...group, x:next.x, y:next.y, discoveredByPlayerIds:[...discovered], lastMovedTurn:turn };
  });
  return advanceV39NeutralVillages({ ...state, wandererGroups }, mapData, turn).state;
}

export function recruitV39Wanderer(state, playerId, groupId) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const group = state?.wandererGroups?.find(row => text(row?.id) === text(groupId));
  const faction = player?.factionState;
  const village = getSelectedSettlement(faction);
  const selectedUnit = faction?.units?.find(row => text(row?.id) === text(faction?.selectedUnitId));
  const reasons = [];
  if (!player || !group || !village?.placed) reasons.push("対象データがありません");
  if (group && !group.discoveredByPlayerIds?.includes(playerId)) reasons.push("放浪者を発見していません");
  if (group && selectedUnit && keyOf(group.x, group.y) !== keyOf(selectedUnit.x, selectedUnit.y)) reasons.push("選択キャラクターと同じマスではありません");
  if (!selectedUnit || number(selectedUnit.hp ?? selectedUnit.currentHp) <= 0) reasons.push("生存中のキャラクターを選択してください");
  if (reasons.length) return { ok:false, reason:reasons.join(" / "), state };
  const sameRace = text(group.race) === text(player.race);
  const happiness = number(village?.cityModifiers?.幸福度) >= 10 ? 10 : 0;
  const chance = Math.max(0, Math.min(100, 50 + (sameRace ? 20 : -20) + happiness));
  const turn = Math.max(1, Math.floor(number(state?.timeline?.turnNumber, 1)));
  const roll = hash(`${group.id}:${player.id}:T${turn}:recruit`) % 100;
  const success = roll < chance;
  const joinRate = 30 + (hash(`${group.id}:join`) % 41);
  const joined = success ? Math.max(1, Math.floor(number(group.population) * joinRate / 100)) : 0;
  const remaining = Math.max(0, number(group.population) - (success ? joined : Math.max(1, Math.ceil(number(group.population) * 0.1))));
  const populationByRace = { ...(village.populationByRace || {}) };
  if (joined > 0) populationByRace[group.race] = Math.max(0, number(populationByRace[group.race])) + joined;
  const nextVillage = { ...village, populationByRace, population:Object.values(populationByRace).reduce((sum, value) => sum + number(value), 0) };
  const players = state.players.map(row => row.id === player.id ? {
    ...row,
    factionState:replaceFactionSettlement(row.factionState, nextVillage, { ownerPlayerId:row.id })
  } : row);
  const wandererGroups = state.wandererGroups.map(row => row.id !== group.id ? row : { ...row, population:remaining }).filter(row => number(row.population) > 0);
  const message = success ? `${group.race}の放浪者${joined}人が加入` : `${group.race}の放浪者の勧誘に失敗 / ${number(group.population) - remaining}人が離散`;
  return { ok:true, success, chance, roll:roll + 1, joined, remaining, message, state:{ ...state, players, wandererGroups } };
}

function ensureWorldActions() {
  const panel = document.getElementById("footTile");
  if (!(panel instanceof HTMLElement) || document.getElementById("v39-world-contact-actions")) return;
  const section = document.createElement("div");
  section.id = "v39-world-contact-actions";
  section.hidden = true;
  section.innerHTML = `<div class="v39-world-contact-copy"><span id="v39-world-contact-kind"></span><b id="v39-world-contact-detail"></b><small id="v39-world-contact-subdetail"></small></div><div id="v39-world-contact-buttons"></div>`;
  panel.appendChild(section);
  section.addEventListener("click", runContactAction);
}

function renderWorldActions() {
  ensureWorldActions();
  const section = document.getElementById("v39-world-contact-actions");
  const kind = document.getElementById("v39-world-contact-kind");
  const detail = document.getElementById("v39-world-contact-detail");
  const subdetail = document.getElementById("v39-world-contact-subdetail");
  const buttons = document.getElementById("v39-world-contact-buttons");
  if (!section || !kind || !detail || !subdetail || !buttons || !selectedTile) { if (section) section.hidden = true; return; }
  const state = window.getV39GameState?.();
  const playerId = state?.activePlayerId;
  const key = keyOf(selectedTile.x, selectedTile.y);
  const wanderer = state?.wandererGroups?.find(row => keyOf(row.x, row.y) === key && row.discoveredByPlayerIds?.includes(playerId));
  const village = state?.neutralVillages?.find(row => keyOf(row.x, row.y) === key || row?.territoryTileKeys?.includes(key));
  section.hidden = !wanderer && !village;
  if (wanderer) {
    section.dataset.targetId = wanderer.id;
    kind.textContent = "放浪者"; detail.textContent = `${wanderer.race} / ${wanderer.population}人`; subdetail.textContent = "";
    buttons.innerHTML = `<button type="button" data-world-action="recruit">勧誘</button>`;
  } else if (village) {
    const relation = getV39NeutralVillageRelation(village, playerId);
    const quest = village.questsByPlayerId?.[playerId];
    section.dataset.targetId = village.id;
    kind.textContent = "一般村";
    detail.textContent = `${village.name} / Lv${village.level} / ${village.population}人 / ${getV39RelationLabel(relation)} ${relation}`;
    subdetail.textContent = `${village.vassalPlayerId ? `属国: ${village.vassalPlayerId}` : "独立"} / 守備${(village.defenseUnits || []).reduce((sum, row) => sum + number(row.count), 0)}人${quest?.accepted && !quest.completed ? ` / 依頼: ${quest.label} ${quest.required}` : ""}`;
    buttons.innerHTML = [
      `<button type="button" data-world-action="relation">交流</button>`,
      quest?.accepted && !quest.completed
        ? `<button type="button" data-world-action="quest-complete">依頼完了</button>`
        : `<button type="button" data-world-action="quest">依頼</button>`,
      `<button type="button" data-world-action="vassal"${village.vassalPlayerId ? " disabled" : ""}>属国化</button>`,
      `<button type="button" data-world-action="raid">襲撃</button>`
    ].join("");
  }
}

function runContactAction(event) {
  const section = document.getElementById("v39-world-contact-actions");
  const action = event?.target instanceof Element ? event.target.closest("[data-world-action]")?.dataset.worldAction : "";
  if (!action) return;
  const state = window.getV39GameState?.();
  const playerId = state?.activePlayerId;
  let result;
  if (action === "recruit") result = recruitV39Wanderer(state, playerId, section.dataset.targetId);
  else if (action === "relation") result = improveV39NeutralVillageRelation(state, playerId, section.dataset.targetId);
  else if (action === "quest") result = acceptV39NeutralVillageQuest(state, playerId, section.dataset.targetId);
  else if (action === "quest-complete") result = completeV39NeutralVillageQuest(state, playerId, section.dataset.targetId);
  else if (action === "vassal") result = vassalizeV39NeutralVillage(state, playerId, section.dataset.targetId);
  else if (action === "raid") result = raidV39NeutralVillage(state, playerId, section.dataset.targetId);
  if (!result) return;
  if (!result.ok) { window.showV39TurnBanner?.(`実行不可: ${result.reason}`); return; }
  window.setV39GameState?.(result.state, { reason:`world-contact-${action}` });
  window.showV39TurnBanner?.(result.message);
  window.appendV39ActivityLog?.(state.activePlayerId, action === "recruit" ? "放浪者" : "一般村", result.message, { chance:result.chance, roll:result.roll, joined:result.joined });
  renderWorldActions();
}

function installStyles() {
  if (document.getElementById("v39-world-population-style")) return;
  const style = document.createElement("style");
  style.id = "v39-world-population-style";
  style.textContent = `#v39-world-contact-actions{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,1fr);gap:6px;align-items:center;padding:6px;border:1px solid #786542;border-radius:7px;background:#282515}#v39-world-contact-actions[hidden]{display:none}.v39-world-contact-copy span,.v39-world-contact-copy b,.v39-world-contact-copy small{display:block}.v39-world-contact-copy span,.v39-world-contact-copy small{font-size:13px;color:#c0aa77}.v39-world-contact-copy b{font-size:15px}#v39-world-contact-buttons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px}#v39-world-contact-buttons button{min-height:34px;border:1px solid #d4af58;border-radius:6px;background:#493a18;color:#ffe6a0;padding:4px 8px;font-size:13px;font-weight:800}#v39-world-contact-buttons button:disabled{opacity:.45}@media(max-width:620px){#v39-world-contact-actions{grid-template-columns:1fr}#v39-world-contact-buttons{justify-content:flex-start}}`;
  document.head.appendChild(style);
}

function initialize(event) {
  if (event?.detail?.restored) return;
  const state = window.getV39GameState?.();
  const mapData = event?.detail?.mapData || window.__v39FieldRuntime?.mapData;
  if (!state || !mapData || state.neutralVillages?.length) return;
  const generated = generateV39WorldPopulation(state, mapData, {
    neutralVillageCount:window.__v39FieldRuntime?.settings?.neutralVillageCount
  });
  const settlements = [...(state.settlements || []).filter(row => !row?.neutral), ...generated.neutralVillages];
  window.setV39GameState?.({ ...generated, settlements }, { reason:"world-population-generated" });
  window.dispatchEvent(new CustomEvent("v39:world-population-generated", { detail:{ villages:generated.neutralVillages.length, wanderers:generated.wandererGroups.length } }));
}

function clearForNewField(event) {
  if (event?.detail?.restored) return;
  const state = window.getV39GameState?.();
  if (!state) return;
  const settlements = (state.settlements || []).filter(row => !row?.neutral);
  if (!state.neutralVillages?.length && !state.wandererGroups?.length && settlements.length === (state.settlements || []).length) return;
  window.setV39GameState?.({ neutralVillages:[], wandererGroups:[], settlements }, { reason:"world-population-cleared" });
}

function advance(event) {
  const state = window.getV39GameState?.();
  const mapData = window.__v39FieldRuntime?.mapData;
  if (!state || !mapData) return;
  const next = advanceV39WorldPopulation(state, mapData, event?.detail?.turnNumber);
  const neutralById = new Map(next.neutralVillages.map(row => [row.id, row]));
  const settlements = (next.settlements || state.settlements || []).map(row => neutralById.get(row.id) || row);
  window.setV39GameState?.({ players:next.players, neutralVillages:next.neutralVillages, wandererGroups:next.wandererGroups, settlements }, { reason:"world-population-turn" });
}

window.addEventListener("v39:field-generated", clearForNewField);
window.addEventListener("v39:initial-placement-complete", initialize);
window.addEventListener("v39:turn-stage-world", advance);
window.addEventListener("v39:tile-selected", event => { selectedTile = event.detail || null; renderWorldActions(); });
window.addEventListener("v39:game-state-changed", renderWorldActions);
window.generateV39WorldPopulation = generateV39WorldPopulation;
window.recruitV39Wanderer = groupId => { const state = window.getV39GameState?.(); return recruitV39Wanderer(state, state?.activePlayerId, groupId); };
window.getV39WorldPopulationRules = () => ({
  initialVillageCount:V39_NEUTRAL_VILLAGE_BALANCE.initialVillageCount,
  maxNeutralVillages:V39_NEUTRAL_VILLAGE_BALANCE.maxInitialVillageCount,
  wandererTilesPerGroup:WANDERER_TILES_PER_GROUP,
  maxWandererGroups:MAX_WANDERER_GROUPS
});
installStyles();
ensureWorldActions();
