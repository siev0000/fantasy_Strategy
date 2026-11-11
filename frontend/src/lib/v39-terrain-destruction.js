import {V39_TERRAIN_DESTRUCTION_RULES as rules} from './v39-terrain-disaster-rules.js';
import {getHexOffsetNeighbors,getHexDistance} from './hex-grid.js';
import {isV39SurfaceCaveEntrance} from './v39-cave-entrance-rules.js';
export {rules as V39_TERRAIN_DESTRUCTION_RULES};
export {resolveV39PowerEffectScale} from './v39-effect-power-scale.js';
const key=p=>`${p.x},${p.y}`;
const number=v=>Number.isFinite(Number(v))?Number(v):0;
function isV39VillageTile(tile,state){
  return [...(state.settlements||[]),...(state.neutralVillages||[]),...(state.players||[]).flatMap(player=>player.factionState?.settlements||[])]
    .some(village=>village.x===tile.x&&village.y===tile.y);
}
function landslidePath(map,height,tile,state,settings){
  const path=[tile],seen=new Set([key(tile)]),limit=Math.max(1,Math.floor(number(settings.maxFlowTiles)));
  while(path.length<limit){
    const from=path.at(-1),fromHeight=number(height?.[from.y]?.[from.x]);
    const next=getHexOffsetNeighbors(from.x,from.y)
      .filter(p=>p.x>0&&p.y>0&&p.x<map.w-1&&p.y<map.h-1&&map.grid?.[p.y]?.[p.x]&&!seen.has(key(p))&&(!isV39ProtectedGround(map,p,state)||isV39VillageTile(p,state)))
      .map(p=>({...p,height:number(height?.[p.y]?.[p.x])}))
      .filter(p=>p.height<fromHeight)
      .sort((a,b)=>a.height-b.height||a.y-b.y||a.x-b.x)[0];
    if(!next)break;
    path.push(next);seen.add(key(next));
  }
  return path;
}
export function applyV39NaturalLandslide(map,event,state={},settings=rules){
  if(event?.disasterId!=='災害:土砂崩れ'||!settings.landslide||!map||map.isUnderground)return event;
  const {x,y}=event,terrain=String(map.specialMap?.[y]?.[x]||map.grid?.[y]?.[x]||map.reliefMap?.[y]?.[x]||'');
  const category=/山|岩/.test(terrain)?'山岳':/丘/.test(terrain)?'丘陵':terrain;
  const volume=Math.max(0,Math.round(number(settings.landslide.baseVolumeByTerrain?.[category])));
  const path=landslidePath(map,map.heightLevelMap,{x,y},state,settings.landslide);
  const weights=path.map((_,index)=>Math.max(0,number(settings.landslide.volumeShare?.[index])));
  const weightSum=weights.reduce((sum,value)=>sum+value,0);
  const previous=map.terrainDamage||{},rubble={...previous.rubbleByTile},volumes=[];
  let allocated=0;
  for(const [index,point] of path.entries()){
    const amount=index===path.length-1?volume-allocated:Math.round(volume*(weightSum?weights[index]/weightSum:1/path.length));
    allocated+=amount;
    volumes.push({x:point.x,y:point.y,amount});
    if(amount<=0||isV39ProtectedGround(map,point,state))continue;
    const k=key(point),hp=number(rubble[k]?.hp)+amount;
    rubble[k]={hp,maxHp:Math.max(hp,number(rubble[k]?.maxHp))};
  }
  if(volume>0)map.terrainDamage={...previous,rubbleByTile:rubble};
  return {...event,tileKeys:path.map(key),landslideVolumes:volumes};
}
export const getV39Rubble=(map,x,y)=>map?.terrainDamage?.rubbleByTile?.[`${x},${y}`];
export function damageV39CaveEntrances(map,area,power,settings=rules){
  const config=settings.caveEntrance;
  if(!config?.maxHp||!config?.rubbleDurability||!map||map.isUnderground)return {map,reports:[]};
  const previous=map.terrainDamage||{},cells={...previous.cells},rubble={...previous.rubbleByTile},reports=[];
  for(const [k,scale] of area){
    const [x,y]=k.split(',').map(Number);
    if(!isV39SurfaceCaveEntrance(map,x,y))continue;
    const rule=settings.rubble;
    const attackPower=Math.floor(Math.max(0,number(typeof power==='function'?power(rule):power))*Math.max(0,number(scale)));
    if(!attackPower)continue;
    if(rubble[k]){
      const beforeHp=rubble[k].hp,damage=Math.floor(Math.max(0,attackPower-(rule?.powerThreshold||0))*(rule?.damageMultiplier||1));
      const hp=Math.max(0,beforeHp-damage);
      if(!damage)continue;
      if(hp)rubble[k]={...rubble[k],hp};else delete rubble[k];
      reports.push({kind:hp?'rubble-damaged':'rubble-cleared',x,y,power:attackPower,damage:beforeHp-hp,hp});
      continue;
    }
    const beforeHp=cells[k]?.entranceHp??config.maxHp,hp=Math.max(0,beforeHp-attackPower);
    cells[k]={...cells[k],entranceHp:hp||config.maxHp};
    if(!hp)rubble[k]={hp:config.rubbleDurability,maxHp:config.rubbleDurability};
    reports.push({kind:hp?'entrance-damaged':'entrance-broken',x,y,power:attackPower,damage:beforeHp-hp,hp});
  }
  return {map:reports.length?{...map,terrainDamage:{...previous,cells,rubbleByTile:rubble}}:map,reports};
}
export function isV39ProtectedGround(map,tile,state={}){
  const {x,y}=tile,k=key(tile);
  if(x<=0||y<=0||x>=map.w-1||y>=map.h-1||!map.grid?.[y]?.[x])return true;
  const points=[...(map.entrances||[]),map.stairsDown,map.stairsUp,map.caveEventNpc,map.entryTarget,...(map.caveSites||[]).filter(p=>p.important||/event|exit|stairs/i.test(p.kind||''))];
  if(points.some(p=>p&&p.x===x&&p.y===y)||(map.protectedTileKeys||[]).includes(k))return true;
  return !!state.victoryLandmarksByTile?.[k]||!!state.facilitiesByTile?.[k]?.length
    ||[...(state.settlements||[]),...(state.neutralVillages||[]),...(state.players||[]).flatMap(p=>p.factionState?.settlements||[])].some(p=>p.x===x&&p.y===y);
}
// Returns a new map; callers commit only after the attack's old geometry has resolved.
export function damageV39Ground(map,area,power,turn,state={},settings=rules){
  const rules=settings;
  if(!rules.enabled||!map)return {map,reports:[]};
  const previous=map.terrainDamage||{},cells={...previous.cells},rubble={...previous.rubbleByTile},pending={...previous.pendingByTile};
  let grid=map.grid,height=map.heightLevelMap,changed=false;const reports=[];
  for(const [k,scale]of area){
    const [x,y]=k.split(',').map(Number),tile={x,y};
    const terrain=String(map.specialMap?.[y]?.[x]||map.grid?.[y]?.[x]||'');
    const groundRule=rules.terrainRulesByName[terrain],rubbleRule=rubble[k]?rules.rubble:null;
    if((!groundRule&&!rubbleRule)||isV39ProtectedGround(map,tile,state))continue;
    const hit=rule=>Math.floor(Math.max(0,number(typeof power==='function'?power(rule):power))*Math.max(0,number(scale)));
    if(rubble[k]&&!settings.skipRubbleDamage){
      const attackPower=hit(rubbleRule),beforeHp=rubble[k].hp;
      const damage=Math.floor(Math.max(0,attackPower-rubbleRule.powerThreshold)*rubbleRule.damageMultiplier);
      if(damage){
        const hp=Math.max(0,beforeHp-damage);if(hp)rubble[k]={...rubble[k],hp};else delete rubble[k];
        changed=true;reports.push({kind:hp?'rubble-damaged':'rubble-cleared',x,y,power:attackPower,damage:beforeHp-hp,hp});
      }
    }
    if(!groundRule)continue;
    const max=groundRule.maxHp;
    const oldBroken=cells[k]?.broken===true;
    const canReopenOldCell=oldBroken&&!map.isUnderground&&!map.hegemonyInterior&&number(height?.[y]?.[x])>0;
    if(!max||oldBroken&&!canReopenOldCell)continue;
    const attackPower=hit(groundRule),beforeHp=canReopenOldCell?max:cells[k]?.hp??max;
    const damage=settings.groundDamageMode==='direct'?attackPower:Math.floor(Math.max(0,attackPower-groundRule.powerThreshold)*groundRule.damageMultiplier);if(!damage)continue;
    const hp=Math.max(0,beforeHp-damage);changed=true;
    cells[k]={hp,maxHp:max,terrain,broken:false,collapseCount:cells[k]?.collapseCount||0};
    reports.push({kind:hp?'ground-damaged':'ground-broken',x,y,power:attackPower,damage:beforeHp-hp,hp});
    if(hp)continue;
    if(map.isUnderground||map.hegemonyInterior){
      if(!groundRule.replacementTerrain)continue;
      if(grid===map.grid)grid=map.grid.map(row=>[...row]);grid[y][x]=groundRule.replacementTerrain;
      if(map.heightLevelMap?.[y]){
        if(height===map.heightLevelMap)height=map.heightLevelMap.map(row=>[...row]);
        const floor=getHexOffsetNeighbors(x,y).filter(p=>map.grid?.[p.y]?.[p.x]===groundRule.replacementTerrain).map(p=>number(map.heightLevelMap?.[p.y]?.[p.x]));
        height[y][x]=floor.length?Math.min(...floor):0;
      }
    }else if(groundRule.maximumHeightLoss>0&&map.heightLevelMap?.[y]){
      if(height===map.heightLevelMap)height=map.heightLevelMap.map(row=>[...row]);
      height[y][x]=Math.max(0,number(height[y][x])-Math.floor(groundRule.maximumHeightLoss));
    }
    const canCollapseAgain=!map.isUnderground&&!map.hegemonyInterior&&number(height?.[y]?.[x])>0;
    cells[k]={hp:canCollapseAgain?max:0,maxHp:max,terrain,broken:!canCollapseAgain,collapseCount:(cells[k]?.collapseCount||0)+1};
    // Enemy/AI resolution must leave the next player action phase to escape.
    const reactionTurn=settings.noReactionDelay?0:state.timeline?.phase&&state.timeline.phase!=='player'?1:0;
    if(!map.isUnderground&&!map.hegemonyInterior&&rules.landslide?.basePower>0){
      const spec=rules.landslide,path=landslidePath(map,height,tile,state,spec);
      const totalVolume=Math.max(0,Math.round(number(spec.baseVolumeByTerrain?.[terrain])));
      const weights=path.map((_,index)=>Math.max(0,number(spec.volumeShare?.[index]))),weightSum=weights.reduce((sum,value)=>sum+value,0);
      let allocated=0;
      for(const [index,point]of path.entries()){
        const volume=index===path.length-1?totalVolume-allocated:Math.round(totalVolume*(weightSum?weights[index]/weightSum:1/path.length));
        allocated+=volume;
        const drop=Math.max(0,number(height?.[y]?.[x])-number(height?.[point.y]?.[point.x]));
        const rockSize=Math.max(0,totalVolume/Math.max(1,number(spec.referenceVolume))-1);
        const power=spec.basePower+drop*Math.max(0,number(spec.powerPerHeightDifference))+Math.round(rockSize*Math.max(0,number(spec.powerPerBaseVolume)));
        const old=pending[key(point)];
        pending[key(point)]={...point,kind:'landslide',resolvesAtTurn:Math.max(old?.resolvesAtTurn||0,turn+(rules.collapse?.delayTurns??1)+reactionTurn),
          power:Math.max(old?.power||0,power),element:spec.element,rubbleDurability:(old?.rubbleDurability||0)+volume};
      }
    }else{
      const candidates=(map.isUnderground||map.hegemonyInterior)?getHexOffsetNeighbors(x,y).filter(p=>map.grid?.[p.y]?.[p.x]==='洞窟').concat(tile):[tile];
      const target=candidates.find(p=>!isV39ProtectedGround(map,p,state)&&!pending[key(p)]);
      if(target&&rules.collapse)pending[key(target)]={...target,kind:'rockfall',resolvesAtTurn:turn+rules.collapse.delayTurns+reactionTurn,power:rules.collapse.power,element:rules.collapse.element,rubbleDurability:rules.rubbleDurability};
    }
  }
  return {map:changed?{...map,grid,heightLevelMap:height,terrainDamage:{...previous,cells,rubbleByTile:rubble,pendingByTile:pending}}:map,reports};
}
export function damageV39EarthquakeGround(map,event,turn,state={},settings=rules){
  if(event?.disasterId!=='災害:地震'||!map||map.isUnderground)return {map,reports:[]};
  const area=new Map((event.tileKeys||[]).map(tileKey=>[tileKey,1]));
  return damageV39Ground(map,area,event.damagePower,turn,state,{...settings,groundDamageMode:'direct',skipRubbleDamage:true,noReactionDelay:true});
}
export function advanceV39GroundCollapses(map,turn,state={}){
  const old=map?.terrainDamage;if(!old)return {map,impacts:[]};
  const pending={...old.pendingByTile},rubble={...old.rubbleByTile},impacts=[];let changed=false;
  for(const [k,event]of Object.entries(pending)){
    if(event.resolvesAtTurn>turn)continue;
    delete pending[k];changed=true;
    const protectedTile=isV39ProtectedGround(map,event,state);
    if(protectedTile&&!(event.kind==='landslide'&&isV39VillageTile(event,state)))continue;
    const durability=event.rubbleDurability??rules.rubbleDurability;
    if(!protectedTile&&durability>0){const total=number(rubble[k]?.hp)+durability;rubble[k]={hp:total,maxHp:Math.max(total,number(rubble[k]?.maxHp))};}impacts.push(event);
  }
  return {map:changed?{...map,terrainDamage:{...old,pendingByTile:pending,rubbleByTile:rubble}}:map,impacts};
}
export function clearV39Rubble(map,unit,tile){
  if(!rules.rubble)return {ok:false,reason:'瓦礫撤去は無効です'};
  const entry=getV39Rubble(map,tile.x,tile.y);
  if(!entry)return {ok:false,reason:'瓦礫がありません'};
  if(getHexDistance(unit,tile)>1)return {ok:false,reason:'瓦礫の隣まで移動してください'};
  if(number(unit.hp??unit.currentHp)<=0)return {ok:false,reason:'死亡者は撤去できません'};
  if(number(unit.ap??unit.currentAp)<rules.clearApCost)return {ok:false,reason:'APが不足しています'};
  const damage=Math.floor(Math.max(0,number(unit.status?.攻撃??unit.攻撃)));
  if(!damage)return {ok:false,reason:'撤去に必要な攻撃値がありません'};
  const hp=Math.max(0,entry.hp-damage),rubble={...map.terrainDamage.rubbleByTile};
  if(hp)rubble[key(tile)]={...entry,hp};else delete rubble[key(tile)];
  return {ok:true,damage,hp,apCost:rules.clearApCost,map:{...map,terrainDamage:{...map.terrainDamage,rubbleByTile:rubble}}};
}
