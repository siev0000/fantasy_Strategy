import { getV39DiplomacyRelation, hasV39ActiveTreaty, canV39EnterFactionTerritory } from "./v39-diplomacy-rules.js";

const key=unit=>`${Math.floor(Number(unit.x))},${Math.floor(Number(unit.y))}`;
const alive=unit=>unit?.state!=="死亡"&&Number(unit?.hp??unit?.currentHp)>0;

export function collectV39MovementOccupancy(state, excludedIds=[], mapData=null, { isVisible=null }={}) {
  const excluded=new Set(excludedIds),blocked=new Set(),stopBlocked=new Set(),blockersByTile=new Map();
  const world=state?.activeWorldId||"surface",turn=state?.timeline?.turnNumber||1;
  const add=(unit,friendly,checkWorld=true)=>{
    if(excluded.has(unit.id)||!alive(unit)||(checkWorld&&(unit.worldId||"surface")!==world))return;
    if(!friendly&&isVisible&&!isVisible(unit))return;
    stopBlocked.add(key(unit));
    if(!friendly){
      blocked.add(key(unit));
      const blockers=blockersByTile.get(key(unit))||[];
      blockers.push(unit);blockersByTile.set(key(unit),blockers);
    }
  };
  for(const player of state?.players||[]) {
    const relation=getV39DiplomacyRelation(state,state.activePlayerId,player.id);
    const treaty=relation.treaties?.alliance;
    const friendly=player.id===state.activePlayerId
      ||(relation.status!=="war"&&(treaty?.active===true&&Number(treaty.expiresAtTurn)>turn || hasV39ActiveTreaty(state,state.activePlayerId,player.id,"passage")));
    for(const unit of player.factionState?.units||[])add(unit,friendly);
  }
  if(world==="surface") {
    const movers=(state.players?.find(p=>p.id===state.activePlayerId)?.factionState?.units||[]).filter(u=>excluded.has(u.id));
    for(const [tile,owner] of Object.entries(state.territoryOwnerByTile||{})) {
      if(movers.length && !movers.every(u=>canV39EnterFactionTerritory(state,state.activePlayerId,owner,{unitId:u.id,fromKey:key(u)}))) blocked.add(tile);
    }
  }
  // state.enemiesは表示中マップの個体。生成時にworldIdを持たない敵も対象にする。
  for(const unit of state?.enemies||[])add(unit,false,false);
  if(world==="surface")for(const village of state?.neutralVillages||[])for(const unit of village.defenseUnits||[])add(unit,false);
  if(mapData?.caveEventNpc){blocked.add(key(mapData.caveEventNpc));stopBlocked.add(key(mapData.caveEventNpc));}
  return {blocked,stopBlocked,blockersByTile};
}
