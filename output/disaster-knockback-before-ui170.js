import {resolveV39DisasterRule} from './v39-disaster-rules.js';
import {resolveV39ResistanceReduction} from './v39-resistance-math.js';
import {applyV39PassiveCombatSkills} from './v39-combat-engine.js';
import {applyV39TerrainModifiers} from './v39-terrain-modifiers.js';
import {canUnitEnterV39Tile} from './v39-terrain-traversal.js';
import {getHexOffsetNeighbors} from './hex-grid.js';
import {v39HexRay} from './v39-combat-ray.js';
import {collectV39MovementOccupancy} from './v39-movement-occupancy-rules.js';
import {applyV39DisasterDamage} from './v39-disaster-damage.js';
const key=point=>`${point.x},${point.y}`;
const alive=unit=>unit.state!=='死亡'&&Number(unit.hp??unit.currentHp)>0;
const configFor=event=>event.details?.knockback??resolveV39DisasterRule(event.disasterId)?.details?.knockback;
export function inspectV39DisasterKnockback(unit,event,map){
  const rule=configFor(event);if(!rule)return {power:0,distance:0};
  const adjusted=applyV39PassiveCombatSkills(applyV39TerrainModifiers(unit,map),{名前:event.name||'災害',攻撃手段:'災害'}).attacker;
  const resistance=Number(adjusted.status?.[rule.resistanceKey]??adjusted.resistances?.[rule.resistanceKey])||0;
  const power=Number(event.damagePower??resolveV39DisasterRule(event.disasterId)?.damagePower)||0;
  const reduction=resolveV39ResistanceReduction(power,unit.level??unit.status?.Lv,resistance);
  const effectivePower=reduction.reducedPower*(1-reduction.resistanceRate);
  const distance=effectivePower>0?Math.min(rule.maximumDistance,Math.ceil(effectivePower/rule.powerPerTile)):0;
  return {power,resistance,...reduction,effectivePower,distance};
}
export function applyV39DisasterKnockback(state,map,events,random=Math.random){
  const entries=[],damageEntries=[],world=state.activeWorldId||'surface';
  const eligible=events.filter(event=>configFor(event));
  if(!eligible.length)return {players:state.players,enemies:state.enemies,neutralVillages:state.neutralVillages,entries,damageEntries};
  // Stop at any unit, regardless of ownership. Reserve landing tiles as units move.
  const occupied=collectV39MovementOccupancy(state,[],map).stopBlocked;
  const records=[],byOriginal=new Map(),counts=new Map();
  const present=unit=>alive(unit)&&(unit.worldId||world)===world;
  const register=(unit,owner={})=>{
    const record={unit,owner};records.push(record);byOriginal.set(unit,record);
    if(present(unit))counts.set(key(unit),(counts.get(key(unit))||0)+1);
  };
  for(const player of state.players||[])for(const unit of player.factionState?.units||[])register(unit,{playerId:player.id});
  for(const unit of state.enemies||[])register(unit);
  for(const village of state.neutralVillages||[])for(const unit of village.defenseUnits||[])register(unit,{neutralVillageId:village.id});
  const staticBlocked=new Set([...occupied].filter(tile=>!counts.has(tile)));
  const replace=(record,unit)=>{
    if(present(record.unit)){
      const tile=key(record.unit),remaining=(counts.get(tile)||1)-1;counts.set(tile,remaining);
      if(!remaining&&!staticBlocked.has(tile))occupied.delete(tile);
    }
    record.unit=unit;
    if(present(unit)){counts.set(key(unit),(counts.get(key(unit))||0)+1);occupied.add(key(unit));}
  };
  const move=record=>{
    const {unit,owner}=record;
    if(!alive(unit)||(unit.worldId||world)!==world)return unit;
    const options=eligible.filter(event=>event.damageTileKeys?.includes(key(unit))).map(event=>({event,...inspectV39DisasterKnockback(unit,event,map)})).sort((a,b)=>b.effectivePower-a.effectivePower);
    const selected=options[0];if(!selected?.distance)return unit;
    const {event,distance}=selected;
    const neighbors=getHexOffsetNeighbors(unit.x,unit.y);
    let target;
    if(event.x===unit.x&&event.y===unit.y)target=neighbors[Number.isInteger(event.direction)?event.direction:0];
    else {
      const pixel=p=>({x:p.x+(p.y%2 ? 0.5 : 0),y:p.y*Math.sqrt(3)/2});
      const source=pixel(event),origin=pixel(unit),dx=origin.x-source.x,dy=origin.y-source.y;
      target=neighbors.sort((a,b)=>{const pa=pixel(a),pb=pixel(b);return (pb.x-origin.x)*dx+(pb.y-origin.y)*dy-((pa.x-origin.x)*dx+(pa.y-origin.y)*dy);})[0];
    }
    const from={x:unit.x,y:unit.y},path=[];let collision=null;
    for(const point of v39HexRay(map,from,target,distance)){
      if(!canUnitEnterV39Tile(map,point.x,point.y,unit))break;
      if(occupied.has(key(point))){
        collision=records.find(other=>other!==record&&present(other.unit)&&key(other.unit)===key(point));
        break;
      }
      path.push(point);
    }
    const to=path.at(-1)||from;
    if(path.length)replace(record,{...unit,...to,position:[to.x,to.y]});
    if(collision){
      const power=selected.effectivePower,turn=event.damageTickTurn??state.timeline?.turnNumber??1;
      // Both sides use the same impact power, but their own armor/resistance/protection.
      for(const [victim,other]of [[record,collision],[collision,record]]){
        const result=applyV39DisasterDamage(victim.unit,{power,element:'打撃'},turn,'吹き飛ばし衝突',random);
        replace(victim,result.unit);
        if(result.entry)damageEntries.push({...result.entry,...victim.owner,collisionPower:power,collisionWithUnitId:other.unit.id});
      }
    }
    if(path.length)entries.push({unitId:unit.id,name:unit.name,...owner,from,to,path,distance:path.length,requestedDistance:distance,
      effectivePower:selected.effectivePower,resistance:selected.resistance,source:event.name||'竜巻'});
  };
  for(const record of records)move(record);
  // Materialize after all impacts so a later collision can damage an earlier mover.
  const updated=unit=>byOriginal.get(unit)?.unit||unit;
  const players=(state.players||[]).map(player=>({...player,factionState:{...player.factionState,units:(player.factionState?.units||[]).map(updated)}}));
  const enemies=(state.enemies||[]).map(updated);
  const neutralVillages=(state.neutralVillages||[]).map(village=>({...village,defenseUnits:(village.defenseUnits||[]).map(updated)}));
  return {players,enemies,neutralVillages,entries,damageEntries};
}
