import {describeV39VillagePlan} from '../../lib/v39-village-plans.js';
import {hasV39VillageContact,recordV39VillageContact} from '../../lib/v39-village-contacts.js';
import {focusV39MapTile} from '../map/v39-map-focus.js';
import { getGameDataRows } from "../../lib/game-data-registry.js";
import {isV39RacePlayable,normalizeV39RaceName} from '../../lib/v39-race-definitions.js';
import { getHexNeighborCoords } from "../../lib/hex-grid.js";
import { getSelectedSettlement, replaceFactionSettlement } from "../../lib/settlement-state.js";
import {getV39VictoryLandmarkStatus} from '../../lib/v39-victory-rules.js';
import {
  acceptV39NeutralVillageQuest,
  advanceV39NeutralVillages,
  completeV39NeutralVillageQuest,
  getV39NeutralVillageRelation,
  getV39RelationLabel,
  listV39NeutralVillageQuests,
  improveV39NeutralVillageRelation,
  normalizeV39NeutralVillage,
  raidV39NeutralVillage,
  vassalizeV39NeutralVillage
} from "../../lib/v39-neutral-village-rules.js";
import { getV39GuardianProgress, listV39GuardianQuests, acceptV39GuardianQuest, completeV39GuardianQuest, transferV39GuardianLand,inspectV39GuardianQuest,getV39GuardianTrialStatus } from "../../lib/v39-guardian-quests.js";
import { V39_QUEST_BALANCE, V39_VICTORY_CONDITION_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { V39_NEUTRAL_VILLAGE_BALANCE } from "../../lib/v39-gameplay-balance.js";
import restBalance from '../../../../config/v39-village-rest.json';
import {resettleV39AbandonedVillage} from '../../lib/v39-abandoned-villages.js';
import {getV39HegemonyGuards} from '../../lib/v39-hegemony-land-rules.js';
import incidentFixture from '../../../../config/v39-village-incident-test.json';
import {restAtIncidentVillage} from '../../lib/v39-village-incidents.js';
import {receiveV39VillageSacrifice} from '../../lib/v39-village-sacrifice.js';
import {advanceV39SpecialVillageContracts} from '../../lib/v39-special-villages.js';
import {recordV39Conversation} from './v39-negotiation-conversation.js';
import { isV39BaseClassRow } from "../../lib/v39-class-rules.js";
import {villageHubMarkup,renderV39VillageHub,resetV39VillageHub,villageHubOwnsEscape} from './v39-village-hub.js';
import {getV39VillageQuests} from '../../lib/v39-village-quest-log.js';
import {installTradeLayout} from './v39-trade-layout.js';

const WANDERER_TILES_PER_GROUP = 300;
const MAX_WANDERER_GROUPS = 20;
let selectedTile = null;
let menuVillageId='';

function closeVillageMenu() {
  resetV39VillageHub();
  menuVillageId='';
  const root=document.getElementById('v39-village-menu');
  if(root)root.hidden=true;
  renderWorldActions();
}
function openVillageMenu(villageId) {
  const state=window.getV39GameState(),village=state.neutralVillages?.find(row=>row.id===villageId);
  if(!village||(state.activeWorldId||'surface')!=='surface')return;
  const contacted=recordV39VillageContact(state,villageId,state.activePlayerId);
  if(contacted)window.setV39GameState({neutralVillages:contacted},{reason:'village-contact-recorded'});
  let root=document.getElementById('v39-village-menu');
  if(!root){root=document.createElement('div');root.id='v39-village-menu';root.hidden=true;
    root.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="v39-village-menu-title">${villageHubMarkup()}</section>`;
    document.body.append(root);installTradeLayout(root);
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','wheel'])root.addEventListener(type,event=>event.stopPropagation());
    root.addEventListener('click',event=>{if(event.target===root)closeVillageMenu();});}
  menuVillageId=villageId;root.hidden=false;ensureWorldActions();
  root.querySelector('.v39-village-menu-body').scrollTop=0;
  if(!root.querySelector('output').textContent)root.querySelector('output').textContent='依頼を選んで受注します。受注中は納品・報告から進められます。';
  renderWorldActions();window.dispatchEvent(new CustomEvent('v39:village-menu-opened'));
}
function restVillage(villageId) {
  const state=window.getV39GameState(),village=state.neutralVillages?.find(row=>row.id===villageId);
  if(village?.abandoned){window.showV39TurnBanner?.('廃村では休息できません');return {ok:false,reason:'廃村です'};}
  if(window.isV39MapInputLocked?.())return {ok:false,reason:'処理完了後に休息してください'};
  const result=restAtIncidentVillage(state,state.activePlayerId,villageId,village?.incidentTest?incidentFixture.balance:restBalance);
  if(result.ok){window.setV39GameState(result.state,{reason:'village-rest'});window.appendV39ActivityLog?.(state.activePlayerId,'村',result.message);}
  window.showV39TurnBanner?.(result.message||result.reason);
  const output=document.querySelector('#v39-village-menu .v39-hub-footer > output');if(output)output.textContent=result.message||result.reason;
  return result;
}
window.openV39VillageMenu=openVillageMenu;
window.closeV39VillageMenu=closeVillageMenu;
window.restV39VillageParty=restVillage;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const keyOf = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;
const normalizedRaceName = normalizeV39RaceName;

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
  return getGameDataRows("勢力").filter(row => isV39RacePlayable(row.種族)).map(row => ({
    race:normalizedRaceName(row.種族),
    dataName:text(row.種族),
    combatRaceName:text(row?.カナ) || normalizedRaceName(row.種族),
    armyRate:Math.max(0, Math.min(1, number(row?.軍隊) > 1 ? number(row?.軍隊) / 100 : number(row?.軍隊))),
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
  return getGameDataRows("クラス").filter(isV39BaseClassRow);
}

function farFromOwned(tile, state, minimum = 5) {
  const occupied = Object.keys(state?.territoryOwnerByTile || {}).map(key => key.split(",").map(Number));
  return occupied.every(([x, y]) => Math.hypot(tile.x - x, tile.y - y) >= minimum);
}

function initialOccupiedUnitTiles(state) {
  const occupied = new Set();
  const add = row => {
    if (!row || !Number.isFinite(Number(row?.x)) || !Number.isFinite(Number(row?.y))) return;
    occupied.add(keyOf(row.x, row.y));
  };
  for (const player of state?.players || []) for (const unit of player?.factionState?.units || []) add(unit);
  for (const enemy of state?.enemies || []) add(enemy);
  for (const nest of state?.enemyNests || []) add(nest);
  for (const settlement of state?.settlements || []) add(settlement);
  return occupied;
}

function buildNeutralVillage(tile, index, races, classes, mapData, usedRaces, occupiedTileKeys) {
  const selectedRace = selectVillageRace(tile, races, usedRaces);
  const villageLevel = 1 + (hash(`${tile.key}:level`) % 3);
  const population = Math.max(10, Math.floor(selectedRace.initialPopulation * (0.6 + (hash(`${tile.key}:population`) % 81) / 100)));
  const classRow = classes[hash(`${tile.key}:class`) % Math.max(1, classes.length)];
  const researchLevels = Object.fromEntries(["鍛冶Lv", "魔法Lv", "信仰Lv", "軍事Lv", "経済Lv"].map((name, levelIndex) => [name, hash(`${tile.key}:${levelIndex}`) % (villageLevel + 1)]));
  return normalizeV39NeutralVillage({
    id:`neutral-village-${index + 1}-${tile.key}`,
    name:`${selectedRace.race}の村`, type:"村", neutral:true, placed:true,
    x:tile.x, y:tile.y, race:selectedRace.race, population, level:villageLevel,
    factionDataName:selectedRace.dataName,
    combatRaceName:selectedRace.combatRaceName,
    armyRate:selectedRace.armyRate,
    className:text(classRow?.名前) || "ファイター", researchLevels,
    relationsByPlayerId:{}, vassalPlayerId:"", directlyRuledByPlayerId:""
  }, mapData, { occupiedTileKeys });
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
  const occupiedTileKeys = initialOccupiedUnitTiles(state);
  const neutralVillages = [];
  for (const tile of tiles) {
    if (neutralVillages.length >= configuredVillageCount) break;
    if (neutralVillages.some(row => Math.hypot(row.x - tile.x, row.y - tile.y) < 7)) continue;
    if (occupiedTileKeys.has(tile.key)) continue;
    occupiedTileKeys.add(tile.key);
    const village = buildNeutralVillage(tile, neutralVillages.length, races, classes, mapData, usedRaces, occupiedTileKeys);
    neutralVillages.push(village);
    for (const unit of village.defenseUnits || []) occupiedTileKeys.add(keyOf(unit.x, unit.y));
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

export function advanceV39WorldPopulation(state, mapData, turnNumber, {includeReports=false}={}) {
  const turn = Math.max(1, Math.floor(number(turnNumber, state?.timeline?.turnNumber || 1)));
  const occupied = new Set((state?.enemies || []).map(row => keyOf(row.x, row.y)));
  for (const player of state?.players || []) {
    for (const unit of player?.factionState?.units || []) occupied.add(keyOf(unit.x, unit.y));
  }
  for (const village of state?.neutralVillages || []) {
    occupied.add(keyOf(village.x, village.y));
    for (const unit of village?.defenseUnits || []) occupied.add(keyOf(unit.x, unit.y));
  }
  const wandererGroups = (state?.wandererGroups || []).map(group => {
    const options = neighbors(mapData, group.x, group.y).filter(tile => !occupied.has(keyOf(tile.x, tile.y)));
    const next = options.length ? options[hash(`${group.id}:T${turn}`) % options.length] : group;
    occupied.add(keyOf(next.x, next.y));
    const discovered = new Set(group.discoveredByPlayerIds || []);
    for (const player of state?.players || []) if ((player?.factionState?.units || []).some(unit => number(unit.hp ?? unit.currentHp) > 0 && keyOf(unit.x, unit.y) === keyOf(next.x, next.y))) discovered.add(player.id);
    return { ...group, x:next.x, y:next.y, discoveredByPlayerIds:[...discovered], lastMovedTurn:turn };
  });
  const contracts=advanceV39SpecialVillageContracts({...state,wandererGroups},turn);
  const result=advanceV39NeutralVillages(contracts.state, mapData, turn);
  result.reports.unshift(...contracts.reports);
  return includeReports?result:result.state;
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
  (document.getElementById('v39-interaction-actions') || panel).appendChild(section);
  section.addEventListener("click", runContactAction);
  const host=document.getElementById('v39-interaction-actions');
  if(host&&!document.getElementById('v39-village-contacts')){
    const list=document.createElement('section');list.id='v39-village-contacts';host.append(list);
    list.addEventListener('click',event=>{
      const button=event.target.closest('[data-village-focus]');if(!button)return;
      const state=window.getV39GameState?.({includeWorlds:false});
      const village=state?.neutralVillages?.find(row=>row.id===button.dataset.villageFocus);
      if(!village||!hasV39VillageContact(village,state.activePlayerId))return;
      if(!focusV39MapTile(village,{worldId:'surface',select:true}))window.showV39TurnBanner?.('地上で、処理完了後に位置を確認できます');
    });
  }
}

function renderVillageContacts() {
  const host=document.getElementById('v39-village-contacts');if(!host)return;
  const state=window.getV39GameState?.({includeWorlds:false}),playerId=state?.activePlayerId;
  const villages=(state?.neutralVillages||[]).filter(row=>hasV39VillageContact(row,playerId));
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const html='<strong>交流した村</strong>'+(villages.length?villages.map(village=>{
    const pending=getV39VillageQuests(village,playerId).filter(row=>row.accepted&&!row.completed).length;
    return `<button type="button" data-village-focus="${escape(village.id)}" aria-label="${escape(village.name)}の位置へ移動"><b>${escape(village.name)}${village.abandoned?'（廃村）':''}</b><small>(${village.x},${village.y}) / 友好度 ${getV39NeutralVillageRelation(village,playerId)}${pending?' / 受注中 '+pending+'件':''}</small></button>`;
  }).join(''):'<p>まだ交流した村はありません。</p>');
  if(host.__markup!==html){host.innerHTML=html;host.__markup=html;}
}

function renderWorldActions() {
  ensureWorldActions();
  renderVillageContacts();
  const section = document.getElementById("v39-world-contact-actions");
  const kind = document.getElementById("v39-world-contact-kind");
  const detail = document.getElementById("v39-world-contact-detail");
  const subdetail = document.getElementById("v39-world-contact-subdetail");
  const buttons = document.getElementById("v39-world-contact-buttons");
  if(section?.__planStatus){section.__planStatus.remove();section.__planStatus=null;}
  if (!section || !kind || !detail || !subdetail || !buttons || (!selectedTile&&!menuVillageId)) { if (section) section.hidden = true; return; }
  const state = window.getV39GameState?.({includeWorlds:false});
  const playerId = state?.activePlayerId;
  const pinned=menuVillageId&&state?.neutralVillages?.find(row=>row.id===menuVillageId);
  if(menuVillageId&&(!pinned||(state.activeWorldId||'surface')!=='surface')){closeVillageMenu();return;}
  const tile=pinned||selectedTile;if(!tile){closeVillageMenu();return;}
  const key = keyOf(tile.x, tile.y);
  const wanderer = state?.wandererGroups?.find(row => keyOf(row.x, row.y) === key && row.discoveredByPlayerIds?.includes(playerId));
  const village = state?.neutralVillages?.find(row => keyOf(row.x, row.y) === key || row?.territoryTileKeys?.includes(key));
  const landmark=Object.values(state?.victoryLandmarksByTile||{}).find(row=>row.key===key||row.occupiedTileKeys?.includes(key));
  // Guardian UI only reads remote worlds; do not clone every saved map on each refresh.
  if(landmark?.hegemonyWorldId)state.explorationWorlds=window.getV39EnemyTurnState?.()?.explorationWorlds;
  const discovered=landmark && state.players?.find(row=>row.id===playerId)?.factionState?.exploration?.discoveredFeaturesByTile?.[landmark.key];
  section.hidden = !wanderer && !village && !discovered;
  const empty = document.querySelector('[data-interaction-empty]');
  if (empty) empty.hidden = !section.hidden;
  section.dataset.kind="village";
  if (wanderer) {
    section.dataset.kind='wanderer';
    section.dataset.targetId = wanderer.id;
    kind.textContent = "放浪者"; detail.textContent = `${wanderer.race} / ${wanderer.population}人`; subdetail.textContent = "";
    buttons.innerHTML = `<button type="button" data-world-action="recruit">勧誘</button>`;
  } else if (village) {
    const relation = getV39NeutralVillageRelation(village, playerId);
    const pending=getV39VillageQuests(village,playerId).filter(quest=>quest.accepted&&!quest.completed);
    section.dataset.targetId = village.id;
    kind.textContent = "一般村";
    detail.textContent = `${village.name} / Lv${village.level} / ${village.population}人 / ${getV39RelationLabel(relation)} ${relation}`;
    subdetail.textContent = `${village.vassalPlayerId ? '属国: '+village.vassalPlayerId : '独立'} / 守備${(village.defenseUnits||[]).filter(row=>number(row.hp??row.currentHp)>0&&row.state!=='死亡').reduce((sum,row)=>sum+number(row.count),0)}人 / 受注中 ${pending.length}件`;
    buttons.innerHTML = '<button type="button" data-world-action="village-menu">村で会話・依頼</button>';
    if(village.abandoned){
      if(menuVillageId)closeVillageMenu();
      kind.textContent='廃村';detail.textContent=village.name;subdetail.textContent='拠点は残っています。住民5人で再入植できます。';
      buttons.innerHTML='<button type="button" data-world-action="village-resettle">廃村へ再入植（住民5人）</button>';return;
    }
    if(village.defenseTraining){
      subdetail.textContent+=` / 守備軍訓練 ⌛${Math.max(0,village.defenseTraining.readyTurn-state.timeline.turnNumber)}`;
    }
    const plan=village.planSchedule?.active;
    if(plan||village.planSchedule?.lastCompleted||village.buildings?.length){
      const status=document.createElement('small');status.dataset.villagePlanStatus='';status.textContent=describeV39VillagePlan(village);
      buttons.before(status);
      section.__planStatus=status;
    }
    if(menuVillageId){
      const faction=state.players.find(p=>p.id===playerId).factionState;
      const units=faction.units.filter(unit=>Number(unit.hp??unit.currentHp)>0&&(unit.worldId||'surface')==='surface'&&village.territoryTileKeys?.includes(`${unit.x},${unit.y}`));
      const actor=units.find(unit=>unit.id===faction.selectedUnitId)||units[0];
      section.hidden=true;
      renderV39VillageHub({root:document.getElementById('v39-village-menu'),state,village,actor,units,relation,relationLabel:getV39RelationLabel(relation),
        choices:listV39NeutralVillageQuests(state,playerId,village.id,window.__v39FieldRuntime?.mapData),
        onActorChange:id=>window.updateV39ActiveFactionState({selectedUnitId:id},{reason:'negotiator-selected'}),
        onAction:(action,eventId,label)=>performContactAction(action,eventId,label,village.id),onRefresh:renderWorldActions,onClose:closeVillageMenu});
    }
  } else if(discovered) {
    const progress=getV39GuardianProgress(state,playerId,landmark.key),quest=progress.quest;
    section.dataset.kind="guardian";section.dataset.targetId=landmark.key;
    kind.textContent="覇権地 / 守護者";
    const trials=getV39GuardianTrialStatus(state,playerId,landmark.key);
    detail.textContent=`${landmark.name} / 試練 ${trials.completed}/${trials.required}達成 / 友好度 ${progress.relation}`;
    const requirement=inspectV39GuardianQuest(state,playerId,landmark.key).description;
    const secure=getV39VictoryLandmarkStatus(state,landmark.key,playerId);
    subdetail.textContent=`勝利条件: ${V39_VICTORY_CONDITION_BALANCE.requiredLandmarkCount}地点を${secure.requiredTurns}ターン確保`+
      (secure.controlled?` / 確保 ${secure.securedTurns}/${secure.requiredTurns}${secure.interfered?'（妨害中：毎ターン−1）':''}`:' / 取得後に開始')+
      (quest&&!quest.completed?` / 受注中: ${quest.名前} / ${requirement}`:"");
    buttons.innerHTML=quest&&!quest.completed?'<button type="button" data-world-action="guardian-complete">依頼を報告</button>':"";
    if(!quest||quest.completed) for(const choice of listV39GuardianQuests(state,playerId,landmark.key)) {
      const card=document.createElement('div');card.className='v39-guardian-trial-choice';
      addQuestButton(card,choice.ID,choice.名前);
      const description=document.createElement('small');description.textContent=choice.説明;card.append(description);buttons.append(card);
    }
    const transfer=document.createElement("button");transfer.type="button";transfer.dataset.worldAction="guardian-transfer";
    transfer.textContent="守護者を引き継ぐ（3試練達成）";transfer.disabled=!trials.ready||!!landmark.peacefulOwnerPlayerId;buttons.append(transfer);
    if(landmark.hegemonyWorldId&&!secure.controlled){
      const claim=document.createElement('button');claim.type='button';claim.dataset.worldAction='guardian-claim';claim.textContent='奥地攻略後に覇権地を取得';buttons.append(claim);
      const guards=getV39HegemonyGuards(state,landmark);claim.disabled=guards.length>0;
      subdetail.textContent+=` / 奥地の守護者・配下 ${guards.length}体`;
    }
  }
}

function addQuestButton(container,eventId,label) {
  const button=document.createElement("button");button.type="button";
  button.dataset.worldAction="quest";button.dataset.eventId=eventId;button.textContent=label;container.append(button);
}

function runContactAction(event) {
  const section = document.getElementById("v39-world-contact-actions");
  const button=event?.target instanceof Element?event.target.closest('[data-world-action]'):null;
  if(button)performContactAction(button.dataset.worldAction,button.dataset.eventId||'',button.textContent,section.dataset.targetId,section.dataset.kind);
}
function performContactAction(action,eventId='',label='',targetId='',kind='village') {
  if (!action) return;
  const state = window.getV39GameState?.();
  const playerId = state?.activePlayerId;
  let result;
  if(window.isV39MapInputLocked?.()||state?.timeline?.phase!=='player'){window.showV39TurnBanner?.('処理完了後、操作ターンに実行してください');return;}
  if(action==='village-menu'){openVillageMenu(targetId);return;}
  if(action==='village-resettle'){
    result=resettleV39AbandonedVillage(state,playerId,targetId);
    if(result.ok)window.setV39GameState(result.state,{reason:'village-resettled'});
    window.showV39TurnBanner?.(result.message||result.reason);renderWorldActions();return;
  }
  if(action==='village-rest'){return restVillage(targetId);}
  if(action==='sacrifice-receive'){
    result=receiveV39VillageSacrifice(state,playerId,targetId,{unitId:state.players.find(player=>player.id===playerId)?.factionState.selectedUnitId});
    if(result.ok){window.setV39GameState(result.state,{reason:'village-sacrifice-received'});window.depositV39PlayerCargo?.(playerId);window.appendV39ActivityLog?.(playerId,'村',result.message);}
    window.showV39TurnBanner?.(result.message||result.reason);renderWorldActions();return result;
  }
  if(kind==="guardian") {
    if(action==="quest") result=acceptV39GuardianQuest(state,playerId,targetId,eventId);
    else if(action==="guardian-complete") result=completeV39GuardianQuest(state,playerId,targetId);
    else if(action==="guardian-transfer") result=transferV39GuardianLand(state,playerId,targetId);
    else if(action==="guardian-claim") result=transferV39GuardianLand(state,playerId,targetId,{conquest:true});
    if(!result) return;
    if(!result.ok) {window.showV39TurnBanner?.(result.reason);return;}
    window.setV39GameState?.(result.state,{reason:`guardian-${action}`});
    window.showV39TurnBanner?.(result.message);window.appendV39ActivityLog?.(playerId,"守護者",result.message);
    if(action==="guardian-transfer"||action==='guardian-claim') window.resolveV39Victory?.();
    renderWorldActions();return;
  }
  if (action === "recruit") result = recruitV39Wanderer(state, playerId, targetId);
  else if (action === "relation") result = improveV39NeutralVillageRelation(state, playerId, targetId);
  else if (action === "vassal") result = vassalizeV39NeutralVillage(state, playerId, targetId);
  else if (action === "raid") result = raidV39NeutralVillage(state, playerId, targetId);
  if (!result) return;
  const output=document.querySelector('#v39-village-menu .v39-hub-footer > output');if(output)output.textContent=result.message||result.reason;
  if(menuVillageId){
    const success=result.ok&&result.success!==false;
    const speechColumn=result.ok?(['relation','vassal'].includes(action)?(success?'交渉成功':'交渉失敗'):undefined):undefined;
    recordV39Conversation(targetId,label,result.message||result.reason,{speechColumn,replyColumn:action==='raid'?'挑発':undefined});
  }
  if (!result.ok) { window.showV39TurnBanner?.(`実行不可: ${result.reason}`);renderWorldActions();return result; }
  window.setV39GameState?.(result.state, { reason:`world-contact-${action}` });
  window.showV39TurnBanner?.(result.message);
  window.appendV39ActivityLog?.(state.activePlayerId, action === "recruit" ? "放浪者" : "一般村", result.message, { chance:result.chance, roll:result.roll, joined:result.joined });
  if(action==='raid')closeVillageMenu();else renderWorldActions();
  return result;
}

function installStyles() {
  if (document.getElementById("v39-world-population-style")) return;
  const style = document.createElement("style");
  style.id = "v39-world-population-style";
  style.textContent = `#v39-world-contact-actions{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,1fr);gap:6px;align-items:center;padding:6px;border:1px solid #786542;border-radius:7px;background:#282515}#v39-world-contact-actions[hidden]{display:none}.v39-world-contact-copy span,.v39-world-contact-copy b,.v39-world-contact-copy small{display:block}.v39-world-contact-copy span,.v39-world-contact-copy small{font-size:var(--font-secondary);color:#c0aa77}.v39-world-contact-copy b{font-size:var(--font-body)}#v39-world-contact-buttons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px}#v39-world-contact-buttons button{min-height:34px;border:1px solid #d4af58;border-radius:6px;background:#493a18;color:#ffe6a0;padding:4px 8px;font-size:var(--font-secondary);font-weight:800}#v39-world-contact-buttons button:disabled{opacity:.45}@media(max-width:620px){#v39-world-contact-actions{grid-template-columns:1fr}#v39-world-contact-buttons{justify-content:flex-start}}`;
  style.textContent+=`#v39-village-contacts{display:grid;gap:4px;min-width:0;margin-top:6px}#v39-village-contacts>button{display:grid;gap:2px;text-align:left;min-width:0;padding:5px 8px;border:1px solid #56747a;border-radius:6px;background:#142a30;color:#e7f4f4;font-size:var(--font-body)}#v39-village-contacts small{font-size:var(--font-secondary);color:#bdd1d2}#v39-village-contacts p{margin:3px 0;color:#bdd1d2}#v39-village-contacts>button:focus-visible{outline:2px solid #ffdd72}`;
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
  const {state:next,reports}=advanceV39WorldPopulation(state,mapData,event?.detail?.turnNumber,{includeReports:true});
  const neutralById = new Map(next.neutralVillages.map(row => [row.id, row]));
  const settlements = (next.settlements || state.settlements || []).map(row => neutralById.get(row.id) || row);
  window.setV39GameState?.({ players:next.players, neutralVillages:next.neutralVillages, wandererGroups:next.wandererGroups, settlements,
    ...(next.explorationWorlds?{explorationWorlds:next.explorationWorlds}:{}),
    facilitiesByTile:next.facilitiesByTile,territoryOwnerByTile:next.territoryOwnerByTile }, { reason:"world-population-turn" });
  for(const report of reports){
    if(report.type==='special-village-maintained'||report.type==='special-village-suspended'){
      window.appendV39ActivityLog?.(report.playerId,'特殊村',report.message,report);continue;
    }
    if(report.type!=='village-construction-completed')continue;
    const [x,y]=report.tileKey.split(',').map(Number);
    if(!window.isV39TestMode?.()&&window.isV39TileInCurrentVision?.(x,y)!==true)continue;
    window.appendV39ActivityLog?.([state.activePlayerId],'建設',`${report.villageName}: ${report.facilityName}が完成（${report.tileKey}）`,report);
  }
}

window.addEventListener("v39:field-generated", clearForNewField);
window.addEventListener("v39:initial-placement-complete", initialize);
window.addEventListener("v39:turn-stage-world", advance);
window.addEventListener("v39:tile-selected", event => { selectedTile = event.detail || null; renderWorldActions(); });
window.addEventListener("v39:game-state-changed", renderWorldActions);
window.addEventListener('v39:conversation-updated',renderWorldActions);
window.generateV39WorldPopulation = generateV39WorldPopulation;
window.recruitV39Wanderer = groupId => { const state = window.getV39GameState?.(); return recruitV39Wanderer(state, state?.activePlayerId, groupId); };
window.getV39WorldPopulationRules = () => ({
  advanceV39NeutralVillages,
  listV39NeutralVillageQuests,acceptV39NeutralVillageQuest,completeV39NeutralVillageQuest,
  initialVillageCount:V39_NEUTRAL_VILLAGE_BALANCE.initialVillageCount,
  maxNeutralVillages:V39_NEUTRAL_VILLAGE_BALANCE.maxInitialVillageCount,
  wandererTilesPerGroup:WANDERER_TILES_PER_GROUP,
  maxWandererGroups:MAX_WANDERER_GROUPS
});
installStyles();
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuVillageId&&!event.defaultPrevented&&!villageHubOwnsEscape(document.getElementById('v39-village-menu')))closeVillageMenu();});
ensureWorldActions();
