import {hegemonyZoneAt} from './v39-hegemony-areas.js';
import {applyV39DisasterDamage} from './v39-disaster-damage.js';

export function tickV39HegemonyArea(state,map,turn){
  const entries=[],recoveries=[];
  if(!map.hegemonyInterior)return {players:state.players,enemies:state.enemies,neutralVillages:state.neutralVillages||[],entries,recoveries};
  const tick=(unit,playerId)=>{
    const world=state.activeWorldId||'surface';
    if(!map.hegemonyInterior||(unit.worldId||'surface')!==world||unit.state==='死亡'||Number(unit.hp??unit.currentHp)<=0
      ||unit.hegemonyTick?.worldId===world&&unit.hegemonyTick.turn>=turn)return unit;
    const area=hegemonyZoneAt(map,unit.x,unit.y);
    let next=unit;
    if(area?.power){
      const result=applyV39DisasterDamage(unit,{power:area.power,element:area.element},turn,area.zoneName);
      next=result.unit;
      if(result.entry)entries.push({...result.entry,...(playerId?{playerId}:{})});
    }
    if(area?.healing){
      const hp=Number(next.hp??next.currentHp),max=Number(next.maxHp??next.status?.HP??hp),amount=Math.max(0,Math.min(area.healing,max-hp));
      if(amount){next={...next,hp:hp+amount,currentHp:hp+amount};recoveries.push({unitId:unit.id,name:unit.name,amount,x:unit.x,y:unit.y,playerId});}
    }
    return {...next,hegemonyTick:{worldId:world,turn}};
  };
  return {players:state.players.map(player=>({...player,factionState:{...player.factionState,units:player.factionState.units.map(unit=>tick(unit,player.id))}})),
    enemies:state.enemies.map(unit=>tick(unit)),neutralVillages:(state.neutralVillages||[]).map(village=>({...village,defenseUnits:(village.defenseUnits||[]).map(unit=>tick(unit))})),entries,recoveries};
}
