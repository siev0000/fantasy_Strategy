import config from '../../../config/v39-atmosphere-display.json';
export const V39_VORTEX_DISPLAY=config.vortex;
export const isV39VortexDisaster=id=>id===config.vortex.disasterId;
export function collectV39VortexFields(data,state,vision,testMode=false){
  if(data.isUnderground||data.hegemonyInterior)return [];
  const turn=state?.timeline?.turnNumber||1;
  return (state?.worldEnvironment?.activeDisasters||[]).filter(event=>isV39VortexDisaster(event.disasterId)&&event.startsAtTurn<=turn&&event.expiresAtTurn>=turn).flatMap(event=>{
    const keys=(event.tileKeys||[]).filter(key=>testMode||vision?.has(key));
    return keys.length?[{id:event.id,x:event.x,y:event.y,radius:event.radius||0,tileKeys:keys}]:[];
  });
}
export function v39VortexPlacement(field,hex){
  return {x:field.x*hex.width+(field.y%2?hex.oddRowOffsetX:0)+hex.width/2,y:field.y*hex.rowStep+hex.height/2,
    diameter:Math.max(hex.width*(field.radius*2+1),hex.height+hex.rowStep*field.radius*2)};
}
