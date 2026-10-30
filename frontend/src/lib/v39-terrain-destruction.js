import {V39_TERRAIN_DESTRUCTION_RULES as rules} from './v39-terrain-disaster-rules.js';
import {getHexOffsetNeighbors,getHexDistance} from './hex-grid.js';
export {rules as V39_TERRAIN_DESTRUCTION_RULES};
export {resolveV39PowerEffectScale} from './v39-effect-power-scale.js';
const key=p=>`${p.x},${p.y}`;
const number=v=>Number.isFinite(Number(v))?Number(v):0;
export const getV39Rubble=(map,x,y)=>map?.terrainDamage?.rubbleByTile?.[`${x},${y}`];
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
    const rule=rubble[k]?rules.rubble:rules.terrainRulesByName[terrain];
    if(!rule)continue;
    const hit=Math.floor(Math.max(0,number(typeof power==='function'?power(rule):power))*Math.max(0,number(scale)));
    if(isV39ProtectedGround(map,tile,state)||hit<=0)continue;
    if(rubble[k]){
      const damage=Math.floor(Math.max(0,hit-rule.powerThreshold)*rule.damageMultiplier);if(!damage)continue;
      const hp=Math.max(0,rubble[k].hp-damage);if(hp)rubble[k]={...rubble[k],hp};else delete rubble[k];
      changed=true;reports.push({kind:hp?'rubble-damaged':'rubble-cleared',x,y,hp});continue;
    }
    const max=rule.maxHp;
    if(!max||cells[k]?.broken)continue;
    const damage=Math.floor(Math.max(0,hit-rule.powerThreshold)*rule.damageMultiplier);if(!damage)continue;
    const hp=Math.max(0,(cells[k]?.hp??max)-damage);cells[k]={hp,maxHp:max,terrain,broken:hp===0};changed=true;
    reports.push({kind:hp?'ground-damaged':'ground-broken',x,y,hp});
    if(hp)continue;
    if(map.isUnderground||map.hegemonyInterior){
      if(!rule.replacementTerrain)continue;
      if(grid===map.grid)grid=map.grid.map(row=>[...row]);grid[y][x]=rule.replacementTerrain;
      if(map.heightLevelMap?.[y]){
        if(height===map.heightLevelMap)height=map.heightLevelMap.map(row=>[...row]);
        const floor=getHexOffsetNeighbors(x,y).filter(p=>map.grid?.[p.y]?.[p.x]===rule.replacementTerrain).map(p=>number(map.heightLevelMap?.[p.y]?.[p.x]));
        height[y][x]=floor.length?Math.min(...floor):0;
      }
    }else if(rule.maximumHeightLoss>0&&map.heightLevelMap?.[y]){
      if(height===map.heightLevelMap)height=map.heightLevelMap.map(row=>[...row]);
      height[y][x]=Math.max(0,number(height[y][x])-Math.floor(rule.maximumHeightLoss));
    }
    const candidates=(map.isUnderground||map.hegemonyInterior)?getHexOffsetNeighbors(x,y).filter(p=>map.grid?.[p.y]?.[p.x]==='洞窟').concat(tile):[tile];
    const target=candidates.find(p=>!isV39ProtectedGround(map,p,state)&&!rubble[key(p)]&&!pending[key(p)]);
    // Enemy/AI resolution must leave the next player action phase to escape.
    const reactionTurn=state.timeline?.phase&&state.timeline.phase!=='player'?1:0;
    if(target&&rules.collapse)pending[key(target)]={...target,resolvesAtTurn:turn+rules.collapse.delayTurns+reactionTurn,power:rules.collapse.power,element:rules.collapse.element,rubbleDurability:rules.rubbleDurability};
  }
  return {map:changed?{...map,grid,heightLevelMap:height,terrainDamage:{...previous,cells,rubbleByTile:rubble,pendingByTile:pending}}:map,reports};
}
export function advanceV39GroundCollapses(map,turn,state={}){
  const old=map?.terrainDamage;if(!old)return {map,impacts:[]};
  const pending={...old.pendingByTile},rubble={...old.rubbleByTile},impacts=[];let changed=false;
  for(const [k,event]of Object.entries(pending)){
    if(event.resolvesAtTurn>turn)continue;
    delete pending[k];changed=true;if(isV39ProtectedGround(map,event,state))continue;
    const durability=event.rubbleDurability??rules.rubbleDurability;
    if(durability>0)rubble[k]={hp:durability,maxHp:durability};impacts.push(event);
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
