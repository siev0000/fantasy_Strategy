import defaults from '../../../config/v39-forced-movement.json';
import {resolveV39ResistanceReduction} from './v39-resistance-math.js';
import {applyV39PassiveCombatSkills} from './v39-combat-engine.js';
import {applyV39TerrainModifiers} from './v39-terrain-modifiers.js';
import {canUnitEnterV39Tile} from './v39-terrain-traversal.js';
import {getHexOffsetNeighbors,getHexDistance} from './hex-grid.js';
import {v39HexRay} from './v39-combat-ray.js';
import {collectV39MovementOccupancy} from './v39-movement-occupancy-rules.js';
import {applyV39DisasterDamage} from './v39-disaster-damage.js';
const key=point=>`${point.x},${point.y}`;
const alive=unit=>unit.state!=='死亡'&&Number(unit.hp??unit.currentHp)>0;
export const V39_FORCED_MOVEMENT_DEFAULTS=defaults;
export function inspectV39ForcedMovement(unit,request,map){
  const rule={...defaults,...request.configuration};
  const adjusted=applyV39PassiveCombatSkills(applyV39TerrainModifiers(unit,map),{名前:request.source||'強制移動'}).attacker;
  const resistance=Number(adjusted.status?.[rule.resistanceKey]??adjusted.resistances?.[rule.resistanceKey])||0;
  const power=Math.max(0,Number(request.power)||0);
  const reduction=resolveV39ResistanceReduction(power,unit.level??unit.status?.Lv,resistance);
  const effectivePower=reduction.reducedPower*(1-reduction.resistanceRate);
  const distance=effectivePower>0?Math.max(0,Math.min(rule.maximumDistance,Math.ceil(effectivePower/rule.powerPerTile))):0;
  return {power,resistance,...reduction,effectivePower,distance};
}
export function resolveV39ForcedMovementPath(map,unit,request,distance,random=Math.random){
  const mode=request.direction||defaults.direction,origin=request.origin;
  if(!origin||distance<=0)return [];
  if(mode==='toward')return getHexDistance(unit,origin)>0?v39HexRay(map,unit,origin,Math.min(distance,getHexDistance(unit,origin))):[];
  const neighbors=getHexOffsetNeighbors(unit.x,unit.y);
  let target;
  if(mode==='random'||getHexDistance(origin,unit)===0){
    const roll=Number(random());target=neighbors[Math.min(5,Math.floor(Math.max(0,Number.isFinite(roll)?roll:0)*6))];
  }else{
    const pixel=p=>({x:p.x+(p.y%2 ? 0.5 : 0),y:p.y*Math.sqrt(3)/2});
    const source=pixel(origin),center=pixel(unit),dx=center.x-source.x,dy=center.y-source.y;
    target=neighbors.sort((a,b)=>{const pa=pixel(a),pb=pixel(b);return (pb.x-center.x)*dx+(pb.y-center.y)*dy-((pa.x-center.x)*dx+(pa.y-center.y)*dy);})[0];
  }
  return v39HexRay(map,unit,target,distance);
}
export function applyV39ForcedMovement(state,map,requests,random=Math.random){
  const entries=[],damageEntries=[],world=state.activeWorldId||'surface';
  const eligible=requests.filter(request=>Number(request.power)>0);
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
    const options=eligible.filter(request=>(!request.worldId||request.worldId===world)
      &&(request.targetIds?.includes(unit.id)||request.targetKeys?.includes(key(unit))))
      .map(request=>({request,...inspectV39ForcedMovement(unit,request,map)})).sort((a,b)=>b.effectivePower-a.effectivePower);
    const selected=options[0];if(!selected?.distance)return unit;
    const {request,distance}=selected;
    const from={x:unit.x,y:unit.y},path=[];let collision=null;
    for(const point of resolveV39ForcedMovementPath(map,unit,request,distance,random)){
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
      const power=selected.effectivePower,turn=request.turn??state.timeline?.turnNumber??1;
      // Both sides use the same impact power, but their own armor/resistance/protection.
      for(const [victim,other]of [[record,collision],[collision,record]]){
        const result=applyV39DisasterDamage(victim.unit,{power,element:'打撃'},turn,'吹き飛ばし衝突',random);
        replace(victim,result.unit);
        if(result.entry)damageEntries.push({...result.entry,...victim.owner,collisionPower:power,collisionWithUnitId:other.unit.id});
      }
    }
    if(path.length)entries.push({unitId:unit.id,name:unit.name,...owner,from,to,path,distance:path.length,requestedDistance:distance,
      effectivePower:selected.effectivePower,resistance:selected.resistance,source:request.source||'強制移動',direction:request.direction||defaults.direction});
  };
  for(const record of records)move(record);
  // Materialize after all impacts so a later collision can damage an earlier mover.
  const updated=unit=>byOriginal.get(unit)?.unit||unit;
  const players=(state.players||[]).map(player=>({...player,factionState:{...player.factionState,units:(player.factionState?.units||[]).map(updated)}}));
  const enemies=(state.enemies||[]).map(updated);
  const neutralVillages=(state.neutralVillages||[]).map(village=>({...village,defenseUnits:(village.defenseUnits||[]).map(updated)}));
  return {players,enemies,neutralVillages,entries,damageEntries};
}
