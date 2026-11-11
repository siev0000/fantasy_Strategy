import config from '../../../config/v39-atmosphere-display.json';
import {resolveV39DefenseFootprint} from './v39-defense-rules.js';
import {isV39SustainedTornado} from './v39-sustained-effects.js';
export const V39_TORNADO_DISPLAY=config.tornado;
export const isV39TornadoDisaster=id=>id===config.tornado.disasterId;
export function collectV39TornadoFields(data,state,vision,testMode=false){
  const turn=state?.timeline?.turnNumber||1;
  const natural=(data.isUnderground||data.hegemonyInterior?[]:state?.worldEnvironment?.activeDisasters||[]).filter(event=>isV39TornadoDisaster(event.disasterId)&&(event.startsAtTurn??event.turn??0)<=turn&&event.expiresAtTurn>=turn).flatMap(event=>{
    const tileKeys=(event.tileKeys||[]).filter(key=>testMode||vision?.has(key));
    return tileKeys.length?[{id:event.id,x:event.x,y:event.y,radius:event.radius||0,tileKeys}]:[];
  });
  const magical=(state?.players||[]).flatMap(player=>Object.entries(player.factionState?.combatRuntime?.activeEffectsByUnitId||{}).flatMap(([unitId,effects])=>(effects||[]).filter(effect=>isV39SustainedTornado(effect.skillRow)&&effect.area&&effect.area.worldId===(state.activeWorldId||'surface')).flatMap(effect=>{
    const {center,facing}=effect.area;
    const tiles=resolveV39DefenseFootprint(data,center,{範囲:'三角形'},facing);
    const tileKeys=tiles.map(tile=>`${tile.x},${tile.y}`).filter(key=>testMode||vision?.has(key));
    return tileKeys.length?[{id:`magic:${unitId}:${effect.skillName}`,x:center.x,y:center.y,radius:1,tileKeys}]:[];
  })));
  return [...natural,...magical];
}
