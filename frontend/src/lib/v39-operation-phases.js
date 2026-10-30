import {normalizeGameStartSettings} from './game-start-settings.js';

export const usesV39OperationPhases=state=>state?.gameSettings?.turnProgressionMode==='phased';
export function normalizeV39OperationTimeline(value={}){
  return {operationPhase:value.operationPhase==='expedition'?'expedition':'territory',
    expeditionTurns:Math.max(0,Math.floor(Number(value.expeditionTurns)||0)),
    territoryReadyPlayerIds:Array.isArray(value.territoryReadyPlayerIds)?[...new Set(value.territoryReadyPlayerIds.map(String))]:[]};
}
export const isV39TerritoryPhase=state=>usesV39OperationPhases(state)&&normalizeV39OperationTimeline(state.timeline).operationPhase==='territory';
export const canV39UseExpeditionActions=state=>!isV39TerritoryPhase(state);
export function advanceV39OperationCycle(state){
  const fields=normalizeV39OperationTimeline(state.timeline);
  if(!usesV39OperationPhases(state))return fields;
  const elapsed=fields.expeditionTurns+1,limit=normalizeGameStartSettings(state.gameSettings).maxCombatTurnsPerWorldTurn;
  return {operationPhase:elapsed>=limit?'territory':'expedition',expeditionTurns:elapsed>=limit?0:elapsed,territoryReadyPlayerIds:[]};
}
export function finishV39TerritoryPlanning(state){
  if(!isV39TerritoryPhase(state)||state.timeline?.phase!=='player')return {ok:false,state};
  const humans=(state.players||[]).filter(player=>player.isPlayer!==false).map(player=>player.id);
  const ordered=(state.timeline.playerTurnOrder||[]).filter(id=>humans.includes(id));
  const ids=[...new Set([...ordered,...humans])];
  if(!ids.includes(state.activePlayerId))return {ok:false,state};
  const ready=[...new Set([...normalizeV39OperationTimeline(state.timeline).territoryReadyPlayerIds,state.activePlayerId])];
  const next=ids.find(id=>!ready.includes(id)),timeline={...state.timeline,
    operationPhase:next?'territory':'expedition',territoryReadyPlayerIds:next?ready:[],
    activeTurnPlayerId:next||ids[0],endedPlayerIds:[]};
  return {ok:true,state:{...state,activePlayerId:next||ids[0],timeline}};
}
