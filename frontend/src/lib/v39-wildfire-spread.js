import {getHexOffsetNeighbors} from './hex-grid.js';

const FORESTS=new Set(['森','森林']);
const tileKey=(x,y)=>`${x},${y}`;

function chanceAt(key,turn){
  let hash=2166136261;
  for(const char of `${turn}:${key}`){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0)/4294967296;
}

export function spreadV39Wildfires(map,events,turn,roll=chanceAt){
  if(!map||map.isUnderground)return [];
  const fires=(events||[]).filter(event=>event.disasterId==='山火事');
  const burning=new Set(fires.flatMap(event=>event.tileKeys||[]));
  const attempted=new Set();
  const spread=[];
  for(const fire of fires){
    if(fire.spreadFrom&&Number(fire.startsAtTurn)>=turn)continue;
    for(const sourceKey of fire.tileKeys||[]){
      const [x,y]=sourceKey.split(',').map(Number);
      if(!Number.isInteger(x)||!Number.isInteger(y))continue;
      if(!FORESTS.has(String(map.specialMap?.[y]?.[x]||map.grid?.[y]?.[x]||'')))continue;
      for(const target of getHexOffsetNeighbors(x,y)){
        const key=tileKey(target.x,target.y);
        if(burning.has(key)||attempted.has(key))continue;
        if(!FORESTS.has(String(map.specialMap?.[target.y]?.[target.x]||map.grid?.[target.y]?.[target.x]||'')))continue;
        attempted.add(key);
        if(roll(key,turn)>=0.1)continue;
        const duration=Math.max(1,Number(fire.expiresAtTurn)-Number(fire.startsAtTurn)+1||1);
        spread.push({...fire,id:`disaster:災害:山火事:${turn}:${key}`,x:target.x,y:target.y,anchorKey:key,
          tileKeys:[key],radius:0,turn,startsAtTurn:turn,expiresAtTurn:turn+duration-1,lastTickTurn:turn-1,
          forced:false,spreadFrom:sourceKey});
        burning.add(key);
      }
    }
  }
  return spread;
}
