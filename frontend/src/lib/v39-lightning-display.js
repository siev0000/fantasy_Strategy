import config from '../../../config/v39-atmosphere-display.json';
export const V39_LIGHTNING_DISPLAY=config.lightning;
export const isV39LightningDisaster=id=>id===config.lightning.disasterId;
const point=key=>{const [x,y]=String(key).split(',').map(Number);return Number.isInteger(x)&&Number.isInteger(y)?{key,x,y}:null;};
export function collectV39LightningTiles(data,state,isVisible=()=>false,testMode=false){
  if(data?.isUnderground||data?.hegemonyInterior)return [];
  const turn=state?.timeline?.turnNumber||1,tiles=new Map();
  for(const event of state?.worldEnvironment?.activeDisasters||[]){
    if(!isV39LightningDisaster(event.disasterId)||(event.startsAtTurn??event.turn??1)>turn||event.expiresAtTurn<turn)continue;
    for(const key of event.tileKeys||[]){
      const tile=point(key);if(tile&&(testMode||isVisible(tile.x,tile.y)))tiles.set(key,tile);
    }
  }
  return [...tiles.values()];
}
// Only new damage ticks generate strikes, never a map repaint or save restoration.
export function collectV39LightningStrikes(state,previousState){
  const turn=state?.timeline?.turnNumber||1,result=[];
  for(const event of state?.worldEnvironment?.activeDisasters||[]){
    if(!isV39LightningDisaster(event.disasterId)||event.damageTickTurn!==turn)continue;
    const previous=previousState?.worldEnvironment?.activeDisasters?.find(row=>row.id===event.id);
    if((previous?.lastTickTurn??-1)>=turn)continue;
    for(const key of new Set(event.damageTileKeys||[])){
      const tile=point(key);if(tile)result.push({...tile,id:`${event.id}:${turn}:${key}`,turn});
    }
  }
  return result;
}
export function v39LightningPaths(tile,time,hex,strike=false){
  const left=tile.x*hex.width+(tile.y%2?hex.oddRowOffsetX:0),top=tile.y*hex.rowStep;
  const phase=Math.floor((time+tile.x*97+tile.y*53)/config.lightning.arcChangeMilliseconds);
  let seed=(Math.imul(tile.x+101,73856093)^Math.imul(tile.y+103,19349663)^Math.imul(phase+107,83492791))>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const world=(x,y)=>({x:left+x*hex.width,y:top+y*hex.height});
  if(strike){
    const main=Array.from({length:9},(_,i)=>world(i === 8 ? 0.5 : 0.5+(random()-.5)*.34,
      -config.lightning.strikeHeightTiles+(config.lightning.strikeHeightTiles+.65)*i/8));
    return [main,...[-1,1].map(side=>[main[6],world(.5+side*.24,.16),world(.5+side*.12,.24),world(.5+side*.32,.45)])];
  }
  const angle=random()*Math.PI*2,center={x:.32+random()*.36,y:.36+random()*.28};
  const along={x:Math.cos(angle)*.48,y:Math.sin(angle)*.4};
  const across={x:-Math.sin(angle)*.12,y:Math.cos(angle)*.12};
  const main=Array.from({length:6},(_,i)=>{
    const t=i/5-.5,jitter=(random()-.5)*2;
    return world(center.x+along.x*t+across.x*jitter,center.y+along.y*t+across.y*jitter);
  });
  const start=main[3],side=random()<.5?-1:1;
  return [main,[start,{x:start.x+across.x*hex.width*side,y:start.y+across.y*hex.height*side},
    {x:start.x+(across.x*side+along.x*.15)*hex.width,y:start.y+(across.y*side+along.y*.15)*hex.height}]];
}
