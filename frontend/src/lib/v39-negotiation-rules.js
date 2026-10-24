import config from '../../../config/v39-negotiation.json';
import {resolveV39CityUnitModifiers} from './v39-city-specialization-rules.js';
export const V39_NEGOTIATION_AP=config.apCost;
export function chargeV39Negotiation(state,playerId,unitId,targetId,terms,context={}) {
  const player=state.players.find(row=>row.id===playerId),unit=player?.factionState.units.find(row=>row.id===unitId);
  const turn=context.aiTurn ? Number(context.turnNumber)||Number(state.timeline?.turnNumber)||1 : Number(state.timeline?.turnNumber)||1;
  const allowed=context.aiTurn ? player?.isPlayer===false&&['player','resolution'].includes(state.timeline?.phase) : state.activePlayerId===playerId&&state.timeline?.phase==='player';
  if(!allowed||!(Number(unit?.hp??unit?.currentHp)>0)||(unit.worldId||'surface')!=='surface')return {ok:false,state,reason:'地上の操作中プレイヤーの交渉役を選択してください'};
  const key=JSON.stringify([targetId,terms]),attempts=(player.factionState.negotiationAttempts||[]).filter(row=>row.turn===turn);
  if(attempts.some(row=>row.key===key))return {ok:false,state,reason:'同じ条件ではこのターンに交渉済みです'};
  if(unit.waitTurnNumber===turn)return {ok:false,state,reason:'このターンは待機済みです'};
  if(Number(unit.ap??unit.currentAp)<config.apCost)return {ok:false,state,reason:`交渉役にAP${config.apCost}が必要です`};
  return {ok:true,state:{...state,players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:{...row.factionState,
    negotiationAttempts:[...attempts,{turn,key,unitId}],units:row.factionState.units.map(actor=>actor.id!==unitId?actor:{...actor,ap:Number(actor.ap??actor.currentAp)-config.apCost,currentAp:Number(actor.ap??actor.currentAp)-config.apCost,lastActionTurn:turn})}})}};
}
export function resolveV39NegotiationSkill(state,playerId,unit,key) {
  const effects=state.players.find(row=>row.id===playerId)?.factionState.combatRuntime?.activeEffectsByUnitId?.[unit.id]||[];
  return (Number(unit.skillLevels?.[key])||0)+(key==='交渉'?resolveV39CityUnitModifiers(state.players.find(row=>row.id===playerId),unit).skills.交渉:0)
    +effects.filter(row=>!row.expiresAtTurn||row.expiresAtTurn>state.timeline.turnNumber).reduce((sum,row)=>sum+(Number(row.modifiers?.[key])||0),0);
}
