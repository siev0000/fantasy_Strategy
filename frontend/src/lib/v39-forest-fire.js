import terrainConfig from '../../../config/v39-terrain-destruction.json';
import {resolveV39CityAtTile,resolveV39SettlementDisasterTileDamage} from './v39-city-specialization-rules.js';
const FOREST_NAMES=new Set(['森','森林']);
const key=(x,y)=>`${x},${y}`;

export function damageV39ForestByFire(map,events,maxHp=terrainConfig.forestFire.maxHp,state={}){
  if(!map||map.isUnderground)return [];
  const old=map.terrainDamage||{};
  const cells={...(old.fireForestByTile||{})};
  const reports=[];
  let grid=map.grid,specialMap=map.specialMap;
  for(const event of events||[]){
    if(event.disasterId!=='山火事')continue;
    const power=Math.max(0,Number(event.damagePower)||0);
    const rawDamage=Math.floor(power*Math.max(0,Number(event.stationaryDamageMultiplier??1)||0));
    if(!rawDamage)continue;
    for(const tileKey of event.damageTileKeys||event.tileKeys||[]){
      const [x,y]=tileKey.split(',').map(Number);
      if(!Number.isInteger(x)||!Number.isInteger(y)||!map.grid?.[y]?.[x])continue;
      const terrain=String(map.specialMap?.[y]?.[x]||map.grid[y][x]);
      if(!FOREST_NAMES.has(terrain))continue;
      const base=resolveV39CityAtTile(state,tileKey).base||(state.neutralVillages||[]).find(village=>
        village.placed!==false&&(village.worldId||'surface')===(state.activeWorldId||'surface')&&
        ((village.territoryTileKeys||[]).includes(tileKey)||Object.hasOwn(village.tileFacilityMap||{},tileKey)));
      const damage=resolveV39SettlementDisasterTileDamage(base,tileKey,rawDamage,event.disasterId,'炎',state.activeWorldId||'surface');
      if(!damage)continue;
      const current=cells[key(x,y)]||{hp:maxHp,maxHp,originalGrid:map.grid[y][x],originalSpecial:map.specialMap?.[y]?.[x]??null};
      const hp=Math.max(0,current.hp-damage);
      cells[key(x,y)]={...current,hp};
      reports.push({kind:hp?'forest-damaged':'forest-withered',x,y,power,damage:current.hp-hp,hp,maxHp});
      if(!hp){
        if(grid===map.grid)grid=map.grid.map(row=>[...row]);
        grid[y][x]='荒野';
        if(map.specialMap?.[y]){
          if(specialMap===map.specialMap)specialMap=map.specialMap.map(row=>[...row]);
          specialMap[y][x]=null;
        }
      }
    }
  }
  if(reports.length){map.grid=grid;if(specialMap!==map.specialMap)map.specialMap=specialMap;map.terrainDamage={...old,fireForestByTile:cells};}
  return reports;
}

export function restoreV39WitheredForest(map,x,y){
  const old=map?.terrainDamage,cell=old?.fireForestByTile?.[key(x,y)];
  if(!cell||cell.hp>0&&cell.hp<cell.maxHp)return false;
  const grid=map.grid.map(row=>[...row]);grid[y][x]=cell.originalGrid;
  map.grid=grid;
  if(map.specialMap){const special=map.specialMap.map(row=>[...row]);special[y][x]=cell.originalSpecial;map.specialMap=special;}
  const cells={...old.fireForestByTile};delete cells[key(x,y)];
  map.terrainDamage={...old,fireForestByTile:cells};
  return true;
}

export function healV39Forest(map,tileKeys,amount){
  const heal=Math.max(0,Math.round(Number(amount)||0)),reports=[];
  if(!heal||!map||map.isUnderground)return reports;
  for(const tileKey of new Set(tileKeys||[])){
    const cell=map.terrainDamage?.fireForestByTile?.[tileKey];
    if(!cell||cell.hp>=cell.maxHp)continue;
    const [x,y]=tileKey.split(',').map(Number),beforeHp=cell.hp;
    const hp=Math.min(cell.maxHp,beforeHp+heal);
    map.terrainDamage={...map.terrainDamage,fireForestByTile:{...map.terrainDamage.fireForestByTile,
      [tileKey]:{...cell,hp}}};
    const restored=hp>=cell.maxHp&&restoreV39WitheredForest(map,x,y);
    reports.push({kind:restored?'forest-restored':'forest-healed',x,y,healing:hp-beforeHp,hp,maxHp:cell.maxHp});
  }
  return reports;
}
