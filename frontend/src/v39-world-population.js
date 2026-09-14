import { getGameDataRows } from "./lib/game-data-registry.js";

const VILLAGE_TILES_PER_SITE = 450;
const WANDERER_TILES_PER_GROUP = 300;
const MAX_NEUTRAL_VILLAGES = 8;
const MAX_WANDERER_GROUPS = 20;
let selectedTile = null;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const keyOf = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;

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
    race:text(row.種族) === "人間" ? "只人" : text(row.種族),
    dataName:text(row.種族),
    preferredTerrain:text(row.土地),
    initialPopulation:Math.max(1, Math.floor(number(row.初期人数, 50)))
  }));
}

function initialClasses() {
  return getGameDataRows("クラス").filter(row => text(row?.種類) === "職業" && text(row?.条件Lv) === "初期" && text(row?.名前));
}

function farFromOwned(tile, state, minimum = 5) {
  const occupied = Object.keys(state?.territoryOwnerByTile || {}).map(key => key.split(",").map(Number));
  return occupied.every(([x, y]) => Math.hypot(tile.x - x, tile.y - y) >= minimum);
}

function buildNeutralVillage(tile, index, races, classes) {
  const race = races[hash(`${tile.key}:race`) % races.length];
  const preferred = races.filter(row => tile.terrain.includes(row.preferredTerrain));
  const selectedRace = preferred.length ? preferred[hash(`${tile.key}:preferred`) % preferred.length] : race;
  const villageLevel = 1 + (hash(`${tile.key}:level`) % 3);
  const population = Math.max(10, Math.floor(selectedRace.initialPopulation * (0.6 + (hash(`${tile.key}:population`) % 81) / 100)));
  const classRow = classes[hash(`${tile.key}:class`) % Math.max(1, classes.length)];
  const researchLevels = Object.fromEntries(["鍛冶Lv", "魔法Lv", "信仰Lv", "軍事Lv", "経済Lv"].map((name, levelIndex) => [name, hash(`${tile.key}:${levelIndex}`) % (villageLevel + 1)]));
  return {
    id:`neutral-village-${index + 1}-${tile.key}`,
    name:`${selectedRace.race}の村`, type:"村", neutral:true, placed:true,
    x:tile.x, y:tile.y, race:selectedRace.race, population, level:villageLevel,
    className:text(classRow?.名前) || "ファイター", researchLevels,
    relationsByPlayerId:{}, vassalPlayerId:"", directlyRuledByPlayerId:""
  };
}

function buildWanderer(tile, index, races) {
  const race = races[hash(`${tile.key}:wanderer-race`) % races.length];
  return {
    id:`wanderer-${index + 1}-${tile.key}`, x:tile.x, y:tile.y, race:race.race,
    population:1 + (hash(`${tile.key}:wanderer-population`) % 20),
    createdTurn:1, discoveredByPlayerIds:[], sourceVillageId:""
  };
}

export function generateV39WorldPopulation(state, mapData) {
  const races = raceDefinitions();
  const classes = initialClasses();
  if (!races.length || !mapData?.grid) return { neutralVillages:[], wandererGroups:[] };
  const tiles = passableTiles(mapData).filter(tile => farFromOwned(tile, state)).sort((a, b) => hash(a.key) - hash(b.key));
  const villageCount = Math.min(MAX_NEUTRAL_VILLAGES, Math.max(1, Math.floor(tiles.length / VILLAGE_TILES_PER_SITE)));
  const neutralVillages = [];
  for (const tile of tiles) {
    if (neutralVillages.some(row => Math.hypot(row.x - tile.x, row.y - tile.y) < 7)) continue;
    neutralVillages.push(buildNeutralVillage(tile, neutralVillages.length, races, classes));
    if (neutralVillages.length >= villageCount) break;
  }
  const villageKeys = new Set(neutralVillages.map(row => keyOf(row.x, row.y)));
  const wandererCount = Math.min(MAX_WANDERER_GROUPS, Math.max(1, Math.floor(tiles.length / WANDERER_TILES_PER_GROUP)));
  const wandererGroups = tiles.filter(tile => !villageKeys.has(tile.key)).slice(0, wandererCount).map((tile, index) => buildWanderer(tile, index, races));
  return { neutralVillages, wandererGroups };
}

function neighbors(mapData, x, y) {
  const offsets = y % 2 ? [[-1,0],[1,0],[0,-1],[1,-1],[0,1],[1,1]] : [[-1,0],[1,0],[-1,-1],[0,-1],[-1,1],[0,1]];
  return offsets.map(([dx, dy]) => ({ x:x+dx, y:y+dy })).filter(tile => tile.x >= 0 && tile.y >= 0 && tile.x < mapData.w && tile.y < mapData.h && !["海", "湖", "火山"].includes(text(mapData.grid?.[tile.y]?.[tile.x])) && !mapData?.lavaMap?.[tile.y]?.[tile.x]);
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
  const neutralVillages = (state?.neutralVillages || []).map(village => ({
    ...village,
    researchExp:Math.max(0, number(village.researchExp)) + 10,
    lastProcessedTurn:turn
  }));
  return { ...state, neutralVillages, wandererGroups };
}

export function recruitV39Wanderer(state, playerId, groupId) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const group = state?.wandererGroups?.find(row => text(row?.id) === text(groupId));
  const faction = player?.factionState;
  const village = faction?.village;
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
  const players = state.players.map(row => row.id === player.id ? { ...row, factionState:{ ...row.factionState, village:nextVillage } } : row);
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
  section.innerHTML = `<div><span id="v39-world-contact-kind"></span><b id="v39-world-contact-detail"></b></div><button type="button" id="v39-world-contact-button"></button>`;
  panel.appendChild(section);
  section.querySelector("button")?.addEventListener("click", runContactAction);
}

function renderWorldActions() {
  ensureWorldActions();
  const section = document.getElementById("v39-world-contact-actions");
  const kind = document.getElementById("v39-world-contact-kind");
  const detail = document.getElementById("v39-world-contact-detail");
  const button = document.getElementById("v39-world-contact-button");
  if (!section || !kind || !detail || !button || !selectedTile) { if (section) section.hidden = true; return; }
  const state = window.getV39GameState?.();
  const playerId = state?.activePlayerId;
  const key = keyOf(selectedTile.x, selectedTile.y);
  const wanderer = state?.wandererGroups?.find(row => keyOf(row.x, row.y) === key && row.discoveredByPlayerIds?.includes(playerId));
  const village = state?.neutralVillages?.find(row => keyOf(row.x, row.y) === key);
  section.hidden = !wanderer && !village;
  if (wanderer) {
    section.dataset.action = "recruit"; section.dataset.targetId = wanderer.id;
    kind.textContent = "放浪者"; detail.textContent = `${wanderer.race} / ${wanderer.population}人`; button.textContent = "勧誘"; button.hidden = false;
  } else if (village) {
    section.dataset.action = "village"; section.dataset.targetId = village.id;
    kind.textContent = "一般村"; detail.textContent = `${village.name} / Lv${village.level} / ${village.population}人`; button.hidden = true;
  }
}

function runContactAction() {
  const section = document.getElementById("v39-world-contact-actions");
  if (section?.dataset.action !== "recruit") return;
  const state = window.getV39GameState?.();
  const result = recruitV39Wanderer(state, state?.activePlayerId, section.dataset.targetId);
  if (!result.ok) { window.showV39TurnBanner?.(`勧誘不可: ${result.reason}`); return; }
  window.setV39GameState?.({ players:result.state.players, wandererGroups:result.state.wandererGroups }, { reason:"wanderer-recruited" });
  window.showV39TurnBanner?.(result.message);
  window.appendV39ActivityLog?.(state.activePlayerId, "放浪者", result.message, { chance:result.chance, roll:result.roll, joined:result.joined });
  renderWorldActions();
}

function installStyles() {
  if (document.getElementById("v39-world-population-style")) return;
  const style = document.createElement("style");
  style.id = "v39-world-population-style";
  style.textContent = `#v39-world-contact-actions{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:6px;align-items:center;padding:6px;border:1px solid #786542;border-radius:7px;background:#282515}#v39-world-contact-actions[hidden]{display:none}#v39-world-contact-actions span,#v39-world-contact-actions b{display:block}#v39-world-contact-actions span{font-size:11px;color:#c0aa77}#v39-world-contact-actions b{font-size:14px}#v39-world-contact-button{min-height:36px;border:1px solid #d4af58;border-radius:6px;background:#493a18;color:#ffe6a0;font-size:14px;font-weight:800}`;
  document.head.appendChild(style);
}

function initialize(event) {
  if (event?.detail?.restored) return;
  const state = window.getV39GameState?.();
  const mapData = event?.detail?.mapData || window.__v39FieldRuntime?.mapData;
  if (!state || !mapData || state.neutralVillages?.length) return;
  const generated = generateV39WorldPopulation(state, mapData);
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
  const settlements = (state.settlements || []).map(row => neutralById.get(row.id) || row);
  window.setV39GameState?.({ neutralVillages:next.neutralVillages, wandererGroups:next.wandererGroups, settlements }, { reason:"world-population-turn" });
}

window.addEventListener("v39:field-generated", clearForNewField);
window.addEventListener("v39:initial-placement-complete", initialize);
window.addEventListener("v39:turn-stage-world", advance);
window.addEventListener("v39:tile-selected", event => { selectedTile = event.detail || null; renderWorldActions(); });
window.addEventListener("v39:game-state-changed", renderWorldActions);
window.generateV39WorldPopulation = generateV39WorldPopulation;
window.recruitV39Wanderer = groupId => { const state = window.getV39GameState?.(); return recruitV39Wanderer(state, state?.activePlayerId, groupId); };
window.getV39WorldPopulationRules = () => ({ villageTilesPerSite:VILLAGE_TILES_PER_SITE, wandererTilesPerGroup:WANDERER_TILES_PER_GROUP, maxNeutralVillages:MAX_NEUTRAL_VILLAGES, maxWandererGroups:MAX_WANDERER_GROUPS });
installStyles();
ensureWorldActions();
