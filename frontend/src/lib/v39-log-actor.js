import {resolveV39PlayerColor,v39PlayerColorHex} from './v39-player-colors.js';

export function resolveV39LogActor(state,unitId){
  const id=String(unitId??'').trim();
  if(!id)return null;
  for(const player of state?.players||[]){
    const unit=player.factionState?.units?.find(row=>String(row.id)===id);
    if(unit)return {name:String(unit.name||''),color:v39PlayerColorHex(resolveV39PlayerColor(state,player.id)),playerId:player.id};
  }
  for(const village of state?.neutralVillages||[]){
    const unit=village.defenseUnits?.find(row=>String(row.id)===id);
    if(unit)return {name:String(unit.name||''),color:'#e0c46c'};
  }
  const enemy=state?.enemies?.find(row=>String(row.id)===id);
  return enemy?{name:String(enemy.name||''),color:'#ff6b6b'}:null;
}

export function resolveV39LogActorColor(state,playerId,fallback){
  return playerId&&state?.players?.some(player=>player.id===playerId)
    ?v39PlayerColorHex(resolveV39PlayerColor(state,playerId))
    :fallback;
}

export function stripV39LogActorPrefix(message,name){
  const value=String(message??''),actor=String(name??'').trim();
  if(!actor)return value;
  const rest=value.startsWith(actor)?value.slice(actor.length).replace(/^ Lv\d+/u,''):'';
  for(const separator of ['：',':',' / '])if(rest.startsWith(separator))return rest.slice(separator.length).trimStart();
  return value;
}
