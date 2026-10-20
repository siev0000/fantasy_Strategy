import { V39_VICTORY_CONDITION_BALANCE } from "./v39-gameplay-balance.js";
import {canV39FactionAttack} from './v39-diplomacy-rules.js';

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));

function landmarkKeys(state) {
  return Object.keys(state?.victoryLandmarksByTile || {}).sort();
}

function landmarkControlledBy(state, key, playerId) {
  const landmark = state?.victoryLandmarksByTile?.[key];
  const occupied = Array.isArray(landmark?.occupiedTileKeys) && landmark.occupiedTileKeys.length
    ? landmark.occupiedTileKeys.map(text).filter(Boolean)
    : [key];
  return occupied.every(tileKey => text(state?.territoryOwnerByTile?.[tileKey]) === playerId);
}

function normalizeProgress(value = {}) {
  const counters=map=>Object.fromEntries(Object.entries(map||{}).filter(([key])=>text(key)).map(([key,count])=>[text(key),Math.max(0,integer(count))]));
  return {
    controlledLandmarkKeys:Array.isArray(value?.controlledLandmarkKeys) ? [...new Set(value.controlledLandmarkKeys.map(text).filter(Boolean))].sort() : [],
    controlStartedTurnByTile:Object.fromEntries(Object.entries(value?.controlStartedTurnByTile || {})
      .filter(([key]) => text(key))
      .map(([key, turn]) => [text(key), Math.max(1, integer(turn, 1))])),
    securedTurnsByTile:counters(value.securedTurnsByTile),
    lastProgressTurnByTile:counters(value.lastProgressTurnByTile),
    interferedLandmarkKeys:Array.isArray(value.interferedLandmarkKeys)?[...new Set(value.interferedLandmarkKeys.map(text).filter(Boolean))].sort():[]
  };
}

export function isV39VictoryLandmarkInterfered(state,key,playerId){
  const landmark=state?.victoryLandmarksByTile?.[key];if(!landmark)return false;
  const tiles=new Set(landmark.occupiedTileKeys?.length?landmark.occupiedTileKeys:[key]);
  const inside=unit=>number(unit.hp??unit.currentHp)>0&&!['死亡','死体'].includes(unit.state)
    &&(unit.worldId||'surface')===(landmark.worldId||'surface')&&tiles.has(`${unit.x},${unit.y}`);
  const players=state.players||[],ownIds=new Set(players.find(p=>p.id===playerId)?.factionState?.units?.map(unit=>unit.id)||[]);
  if(players.some(player=>player.id!==playerId&&canV39FactionAttack(state,player.id,playerId)
    &&player.factionState?.units?.some(inside)))return true;
  const hostile=unit=>{
    const owner=text(unit.ownerPlayerId||unit.playerId||unit.summon?.playerId);
    if(owner&&players.some(player=>player.id===owner))return owner!==playerId&&canV39FactionAttack(state,owner,playerId);
    if(unit.villageIncidentTargetPlayerId)return unit.villageIncidentTargetPlayerId===playerId;
    return unit.aggressive===true||unit.metadata?.aggressive===true||unit.victoryGuard===true||!!unit.nestId||ownIds.has(unit.aggroTargetUnitId);
  };
  return [...(state.enemies||[]),...(state.neutralVillages||[]).flatMap(village=>village.defenseUnits||[])].some(unit=>inside(unit)&&hostile(unit));
}

export function getV39VictoryLandmarkStatus(state,key,playerId){
  const progress=normalizeProgress(state?.victory?.progressByPlayerId?.[playerId]);
  return {controlled:landmarkControlledBy(state,key,playerId),securedTurns:progress.securedTurnsByTile[key]||0,
    requiredTurns:Math.max(1,integer(V39_VICTORY_CONDITION_BALANCE.requiredHoldTurns,5)),interfered:isV39VictoryLandmarkInterfered(state,key,playerId)};
}

export function normalizeV39VictoryState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    completed:source?.completed === true,
    winnerPlayerId:text(source?.winnerPlayerId),
    achievedTurn:Math.max(0, integer(source?.achievedTurn)),
    reason:text(source?.reason),
    progressByPlayerId:Object.fromEntries(Object.entries(source?.progressByPlayerId || {})
      .filter(([playerId]) => text(playerId))
      .map(([playerId, progress]) => [text(playerId), normalizeProgress(progress)]))
  };
}

// 支配者・維持ターンを共通状態から判定する。NPCもプレイヤーも同じ処理を使う。
export function evaluateV39Victory(state, turnNumber = state?.timeline?.turnNumber, {advanceProgress=true} = {}) {
  const turn = Math.max(1, integer(turnNumber, 1));
  const current = normalizeV39VictoryState(state?.victory);
  const keys = landmarkKeys(state);
  const requiredCount = Math.max(1, Math.min(keys.length || 1, integer(V39_VICTORY_CONDITION_BALANCE.requiredLandmarkCount, 1)));
  const requiredHoldTurns = Math.max(1, integer(V39_VICTORY_CONDITION_BALANCE.requiredHoldTurns, 1));
  if(current.completed)return {state:{...state,victory:current},changed:false,victory:current,requiredCount,requiredHoldTurns};
  const progressByPlayerId = {};
  let winnerPlayerId = current.winnerPlayerId;

  for (const player of state?.players || []) {
    const playerId = text(player?.id);
    if (!playerId) continue;
    const previous = normalizeProgress(current.progressByPlayerId?.[playerId]);
    const controlled = keys.filter(key => landmarkControlledBy(state, key, playerId));
    const controlledSet = new Set(controlled);
    const controlStartedTurnByTile = {},securedTurnsByTile={},lastProgressTurnByTile={},interferedLandmarkKeys=[];
    for(const key of controlled){
      const continuing=previous.controlledLandmarkKeys.includes(key);
      controlStartedTurnByTile[key]=continuing?previous.controlStartedTurnByTile[key]||turn:turn;
      const blocked=isV39VictoryLandmarkInterfered(state,key,playerId);
      if(blocked)interferedLandmarkKeys.push(key);
      let secured=continuing?previous.securedTurnsByTile[key]||0:0;
      let last=continuing?previous.lastProgressTurnByTile[key]??turn:turn;
      // Do not invent missing turns from a jump/load, or count the acquisition turn.
      if(advanceProgress&&turn>last){secured=Math.max(0,Math.min(requiredHoldTurns,secured+(blocked?-1:1)));last=turn;}
      securedTurnsByTile[key]=secured;lastProgressTurnByTile[key]=last;
    }
    const progress = { controlledLandmarkKeys:controlled, controlStartedTurnByTile,securedTurnsByTile,lastProgressTurnByTile,interferedLandmarkKeys };
    progressByPlayerId[playerId] = progress;
    if (!advanceProgress || winnerPlayerId || controlledSet.size < requiredCount) continue;
    const heldKeys = controlled.filter(key => !interferedLandmarkKeys.includes(key)&&securedTurnsByTile[key]>=requiredHoldTurns);
    if (heldKeys.length >= requiredCount) winnerPlayerId = playerId;
  }

  const completed = !!winnerPlayerId;
  const victory = {
    completed,
    winnerPlayerId,
    achievedTurn:completed ? (current.completed ? current.achievedTurn : turn) : 0,
    reason:completed ? (current.completed?current.reason:`勝利対象土地を${requiredCount}地点、妨害を退けて${requiredHoldTurns}ターン確保`) : "",
    progressByPlayerId
  };
  return { state:{ ...state, victory }, changed:JSON.stringify(victory) !== JSON.stringify(current), victory, requiredCount, requiredHoldTurns };
}
