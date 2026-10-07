import { getV39DiplomacyRelation } from "./v39-diplomacy-rules.js";

const key=unit=>`${Math.floor(Number(unit.x))},${Math.floor(Number(unit.y))}`;
const alive=unit=>unit?.state!=="死亡"&&Number(unit?.hp??unit?.currentHp)>0;

export function collectV39MovementOccupancy(state, excludedIds=[], mapData=null) {
  const excluded=new Set(excludedIds),blocked=new Set(),stopBlocked=new Set();
  const world=state?.activeWorldId||"surface",turn=state?.timeline?.turnNumber||1;
  const add=(unit,friendly,checkWorld=true)=>{
    if(excluded.has(unit.id)||!alive(unit)||(checkWorld&&(unit.worldId||"surface")!==world))return;
    stopBlocked.add(key(unit));
    if(!friendly)blocked.add(key(unit));
  };
  for(const player of state?.players||[]) {
    const relation=getV39DiplomacyRelation(state,state.activePlayerId,player.id);
    const treaty=relation.treaties?.alliance;
    const friendly=player.id===state.activePlayerId
      ||(relation.status!=="war"&&treaty?.active===true&&Number(treaty.expiresAtTurn)>turn);
    for(const unit of player.factionState?.units||[])add(unit,friendly);
  }
  // state.enemiesは表示中マップの個体。生成時にworldIdを持たない敵も対象にする。
  for(const unit of state?.enemies||[])add(unit,false,false);
  if(world==="surface")for(const village of state?.neutralVillages||[])for(const unit of village.defenseUnits||[])add(unit,false);
  if(mapData?.caveEventNpc){blocked.add(key(mapData.caveEventNpc));stopBlocked.add(key(mapData.caveEventNpc));}
  return {blocked,stopBlocked};
}
