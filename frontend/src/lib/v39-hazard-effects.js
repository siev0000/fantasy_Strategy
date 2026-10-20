import {getV39ActiveHazardsAt,isV39HazardFlightAvoided} from './v39-hazard-zones.js';
import {applyV39DisasterDamage} from './v39-disaster-damage.js';
import {changeV39Purification} from './v39-purification-rules.js';

export function tickV39HazardEffects(state,map,turn){
  const entries=[];map.hazardTurn=turn;
  const tick=(unit,playerId)=>{
    if((unit.worldId||'surface')!==(state.activeWorldId||'surface')||Number(unit.hp??unit.currentHp)<=0||unit.state==='死亡'||unit.lastHazardTickTurn>=turn)return unit;
    const hazards=getV39ActiveHazardsAt(map,unit.x,unit.y,turn).filter(({rule})=>!isV39HazardFlightAvoided(unit,rule));
    let poison=unit.environmentPoison;
    if(!hazards.length&&!poison)return unit;
    for(const {rule} of hazards){
      const effect=rule.危険地帯効果||{},resist=Number(unit.status?.毒耐性??unit.resistances?.毒耐性)||0;
      if(effect.poisonPower>0&&resist<100)poison={power:Math.max(Number(poison?.power)||0,effect.poisonPower),
        expiresAtTurn:turn+effect.poisonTurns,source:rule.カテゴリ名};
    }
    const specs=hazards.filter(({rule})=>rule.ダメージ威力>0).map(({rule})=>({power:rule.ダメージ威力,element:rule.ダメージ属性}));
    if(poison?.expiresAtTurn>turn)specs.push({power:poison.power,element:'毒'});else poison=null;
    const source=[...new Set(hazards.map(({rule})=>rule.カテゴリ名).concat(poison?'環境毒':[]))].join('・')||'危険地帯';
    const result=applyV39DisasterDamage(unit,specs,turn,source);
    if(result.entry)entries.push({...result.entry,...(playerId?{playerId}:{})});
    return {...result.unit,environmentPoison:poison,lastHazardTickTurn:turn};
  };
  if(map.lastHazardPurificationTurn<turn||map.lastHazardPurificationTurn==null){
    const losses=new Map();
    for(const zone of map.hazardZones||[])for(const key of zone.tileKeys){
      const [x,y]=key.split(',').map(Number);
      for(const {rule} of getV39ActiveHazardsAt(map,x,y,turn))losses.set(key,Math.max(losses.get(key)||0,Number(rule.危険地帯効果?.purificationLoss)||0));
    }
    for(const [key,loss] of losses)if(loss>0)changeV39Purification(map,key,-loss);
    map.lastHazardPurificationTurn=turn;
  }
  return {players:state.players.map(player=>({...player,factionState:{...player.factionState,units:player.factionState.units.map(unit=>tick(unit,player.id))}})),
    enemies:state.enemies.map(unit=>tick(unit)),neutralVillages:(state.neutralVillages||[]).map(village=>({...village,defenseUnits:(village.defenseUnits||[]).map(unit=>tick(unit))})),entries};
}
