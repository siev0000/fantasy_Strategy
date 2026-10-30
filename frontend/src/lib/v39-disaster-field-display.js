import config from '../../../config/v39-atmosphere-display.json';
import {v39VortexPlacement} from './v39-vortex-display.js';


export const V39_DISASTER_FIELD_ARTWORK=config.fieldArtwork;
export const isV39DisasterFieldArtwork=id=>!!config.fieldArtwork.disasters[id];
export function collectV39DisasterFieldImages(state,{isVisible=()=>true,testMode=false,opacity=()=>1}={}){
  const turn=state?.timeline?.turnNumber||1,result=new Map();
  for(const event of state?.worldEnvironment?.activeDisasters||[]){
    const style=config.fieldArtwork.disasters[event.disasterId];
    if(!style||(event.startsAtTurn??event.turn??0)>turn||event.expiresAtTurn<turn)continue;
    const center=Number.isInteger(event.x)&&Number.isInteger(event.y)?`${event.x},${event.y}`:event.anchorKey||(event.tileKeys||[])[0];
    if(style.singleImage){
      const tileKeys=(event.tileKeys||[]).filter(key=>{const [x,y]=key.split(',').map(Number);return testMode||isVisible(x,y);});
      if(tileKeys.length&&center){
        const [x,y]=center.split(',').map(Number);
        const id=event.id||`${event.disasterId}:${center}:${event.startsAtTurn}`;
        result.set(id,{id,key:center,x,y,event,style,alpha:style.opacity??1,tileKeys});
      }
      continue;
    }
    const keys=style.centerOnly?(center?[center]:[]):event.tileKeys||[];
    for(const key of keys){
      const [x,y]=String(key).split(',').map(Number);
      if(!Number.isInteger(x)||!Number.isInteger(y))continue;
      const visible=isVisible(x,y);if(!visible&&!testMode)continue;
      const alpha=(visible?1:.6)*(style.opacity??1)*(style.opacityKind?opacity(style.opacityKind):1);
      if(alpha<=0)continue;
      const id=`${event.disasterId}:${key}`;
      result.set(id,{id,key,x,y,event,style,alpha});
    }
  }
  return [...result.values()];
}
export function positionV39DisasterFieldImage(marker,hex,frameWidth,frameHeight){
  if(marker.style.singleImage){
    const p=v39VortexPlacement({...marker,radius:marker.event.radius||0},hex);
    return {x:p.x,y:p.y,width:p.diameter,height:p.diameter*frameHeight/frameWidth};
  }
  const width=hex.width*marker.style.widthTiles;
  return {x:marker.x*hex.width+(marker.y%2?hex.oddRowOffsetX:0)+hex.width/2,
    y:marker.y*hex.rowStep+hex.height*marker.style.bottom,width,height:width*frameHeight/frameWidth};
}
