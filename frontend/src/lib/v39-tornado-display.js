import config from '../../../config/v39-atmosphere-display.json';
export const V39_TORNADO_DISPLAY=config.tornado;
export const isV39TornadoDisaster=id=>id===config.tornado.disasterId;
export function collectV39TornadoFields(data,state,vision,testMode=false){
  if(data.isUnderground||data.hegemonyInterior)return [];
  const turn=state?.timeline?.turnNumber||1;
  return (state?.worldEnvironment?.activeDisasters||[]).filter(event=>isV39TornadoDisaster(event.disasterId)&&(event.startsAtTurn??event.turn??0)<=turn&&event.expiresAtTurn>=turn).flatMap(event=>{
    const tileKeys=(event.tileKeys||[]).filter(key=>testMode||vision?.has(key));
    return tileKeys.length?[{id:event.id,x:event.x,y:event.y,radius:event.radius||0,tileKeys}]:[];
  });
}
