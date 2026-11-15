import {terrainData} from './game-data-registry.js';
import {resolveV39DisasterRule} from './v39-disaster-rules.js';

const forest=new Set(['森','森林']);
const woodByTerrain=new Map(terrainData.map(row=>[String(row.地形),Number(row.木材)||0]));
const key=(x,y)=>`${x},${y}`;

function stableRoll(value){
  let hash=2166136261;
  for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0)/4294967296;
}

export function v39IgnitionChance(terrain,power){
  if(!forest.has(terrain)&&(!woodByTerrain.has(terrain)||woodByTerrain.get(terrain)<=0))return 0;
  return Math.min(1,(forest.has(terrain)?0.2:0.1)*Math.max(0,Number(power)||0)/100);
}

export function igniteV39FireTiles(map,activeDisasters,tiles,power,turn,source,roll=Math.random){
  if(!map||map.isUnderground||!Number.isFinite(Number(power))||Number(power)<=0)return [];
  const rule=resolveV39DisasterRule('山火事');
  if(!rule?.enabled)return [];
  const burning=new Set((activeDisasters||[]).filter(event=>event.disasterId==='山火事').flatMap(event=>event.tileKeys||[]));
  const fires=[];
  for(const tile of new Set(tiles||[])){
    const [x,y]=String(tile).split(',').map(Number);
    if(!Number.isInteger(x)||!Number.isInteger(y)||burning.has(tile))continue;
    const terrain=String(map.specialMap?.[y]?.[x]||map.grid?.[y]?.[x]||'');
    const chance=v39IgnitionChance(terrain,power);
    if(!chance||roll(`${source}:${turn}:${tile}`)>=chance)continue;
    const id=`disaster:災害:山火事:${turn}:${tile}:${source}`;
    fires.push({id,disasterId:rule.id,name:rule.name,description:rule.description,icon:rule.icon,
      imageFile:rule.imageFile,imageSlot:rule.imageSlot,origin:'ignition',ignitionSource:source,
      x,y,anchorKey:tile,tileKeys:[key(x,y)],radius:0,turn,startsAtTurn:turn,
      expiresAtTurn:turn+rule.duration-1,lastTickTurn:turn-1,
      yieldMultiplier:rule.yieldMultiplier,securityLoss:rule.securityLoss,
      damageElement:rule.damageElement,
      damagePower:rule.damagePower,movementDamagePower:rule.movementDamagePower,
      damagePattern:rule.damagePattern,details:structuredClone(rule.details)});
    burning.add(tile);
  }
  return fires;
}

export function igniteV39DisasterTiles(map,events,turn,roll=stableRoll){
  const fires=[];
  for(const event of events||[]){
    if(event.disasterId==='山火事'||Number(event.lastTickTurn)>=turn)continue;
    if(!String(event.damageElement||'').split(/[、,，|/]/u).some(element=>element==='炎'||element==='雷'))continue;
    const power=Math.max(0,Number(event.ignitionPower??event.damagePower)||0);
    const tiles=event.damageTileKeys||event.tileKeys||[];
    fires.push(...igniteV39FireTiles(map,[...events,...fires],tiles,power,turn,event.id,roll));
  }
  return fires;
}
