import {damageV39Ground,damageV39CaveEntrances,advanceV39GroundCollapses,clearV39Rubble,V39_TERRAIN_DESTRUCTION_RULES as rules} from '../../lib/v39-terrain-destruction.js';
import {isV39SurfaceCaveEntrance} from '../../lib/v39-cave-entrance-rules.js';
import {resolveV39TerrainAttackPower,computeAttackDamage} from '../../lib/v39-combat-engine.js';
import {applyV39TerrainModifiers} from '../../lib/v39-terrain-modifiers.js';
import {getHexDistance} from '../../lib/hex-grid.js';
import {isV39UnitWaiting} from '../../lib/v39-unit-action-rules.js';
import {applyTerritoryHazardDamage} from '../map/v39-volcano-system.js';
const key=p=>`${p.x},${p.y}`;
function commitMap(map){
  if(window.__v39BackgroundWorldTurn)window.__v39FieldRuntime.mapData=map;
  else window.updateV39FieldData?.(map,{reason:'terrain-destruction'});
  if(!window.__v39BackgroundWorldTurn)window.refreshV39MapEntities?.();
}
export function applyV39AttackGroundDamage(map,area,attacker,row,turn,state){
  area.groundSummary='';
  area.groundDamageTotal=0;
  area.achievementTerrainReports=[];
  if(!rules.enabled||![...area.keys()].some(k=>{
    const [x,y]=k.split(',').map(Number);
    const broken=map.terrainDamage?.cells?.[k]?.broken;
    const height=Number(map.heightLevelMap?.[y]?.[x]??0);
    return isV39SurfaceCaveEntrance(map,x,y)||map.terrainDamage?.rubbleByTile?.[k]||((!broken||!map.isUnderground&&!map.hegemonyInterior&&height>0)&&rules.durabilityByTerrain[map.specialMap?.[y]?.[x]||map.grid?.[y]?.[x]]);
  }))return;
  const adjusted=applyV39TerrainModifiers(attacker,map),powerCache=new Map();
  const power=rule=>{
    const cacheKey=rule.eligibleDamageTypes.join('/');
    if(!powerCache.has(cacheKey))powerCache.set(cacheKey,resolveV39TerrainAttackPower(row,adjusted,{damageTypes:rule.eligibleDamageTypes}));
    return powerCache.get(cacheKey);
  };
  const structureTiles=new Set((map.defenseStructures||[]).filter(s=>area.blockingStructures?.has(s.id)).flatMap(s=>s.edge?[key(s.edge.from),key(s.edge.to)]:(s.tiles||[]).map(key)));
  const targets=new Map([...area].filter(([k])=>!structureTiles.has(k)));
  const ground=damageV39Ground(map,targets,power,turn,state);
  const entrance=damageV39CaveEntrances(ground.map,targets,power);
  const reports=[...ground.reports,...entrance.reports],result={map:entrance.map,reports};
  area.achievementTerrainReports=reports;
  if(result.map===map)return;
  area.groundDamageTotal=reports.reduce((sum,report)=>sum+report.damage,0);
  area.groundSummary=` / 地形・瓦礫: ${reports.slice(0,3).map(r=>`${r.kind.startsWith('rubble')?'瓦礫':r.kind.startsWith('entrance')?'入口':'地形'}(${r.x},${r.y}) 威${r.power}/${r.damage}dmg 残${r.hp}`).join('・')}${reports.length>3?' ほか':''}`;
  // Combat still holds this map reference for its final commit.
  Object.assign(map,result.map);commitMap(map);
  if(!window.__v39BackgroundWorldTurn)for(const report of result.reports.filter(r=>r.kind==='ground-broken'||r.kind==='rubble-cleared'))window.showV39TurnBanner?.(`${report.kind==='ground-broken'?`地形崩壊・${map.isUnderground?'落石':'土砂崩れ'}予告`:'瓦礫を除去'} (${report.x},${report.y})`,false,{actorId:attacker.id});
}
export function resolveV39GroundCollapses(turn){
  const map=window.__v39FieldRuntime?.mapData;
  if(!Object.values(map?.terrainDamage?.pendingByTile||{}).some(event=>event.resolvesAtTurn<=turn))return;
  const state=window.getV39GameState({includeWorlds:false});
  const result=advanceV39GroundCollapses(map,turn,state);if(result.map===map)return;
  commitMap(result.map);const impacts=new Map(result.impacts.map(p=>[key(p),p])),entries=[];
  const territoryDamage=applyTerritoryHazardDamage(state,result.map,[],turn,result.impacts
    .filter(impact=>impact.kind==='landslide')
    .map(impact=>({key:key(impact),x:impact.x,y:impact.y,damage:impact.power,eventType:'landslide'})));
  const apply=unit=>{
    if((unit.worldId||'surface')!==state.activeWorldId||Number(unit.hp??unit.currentHp)<=0)return unit;
    const impact=impacts.get(key(unit));if(!impact)return unit;
    const impactName=impact.kind==='landslide'?'土砂崩れ':'落石';
    const damage=computeAttackDamage({attacker:{id:'rockfall',level:1,status:{攻撃:0}},target:applyV39TerrainModifiers(unit,result.map),skillRow:{名前:impactName,攻撃手段:'肉体',判定:'攻撃',[impact.element||rules.collapse?.element||'打撃']:impact.power,効果:'必中'},random:()=>0,gameSettings:state.gameSettings});
    const beforeHp=Number(unit.hp??unit.currentHp),hp=Math.max(0,beforeHp-damage.total);
    entries.push({...damage,targetId:unit.id,targetName:unit.name,x:unit.x,y:unit.y,beforeHp,afterHp:hp,maxHp:unit.maxHp||unit.status?.HP||beforeHp});
    return {...unit,hp,currentHp:hp,...(hp<=0?{state:'死亡',deathCause:impactName,diedAtTurn:turn,deathPosition:{x:unit.x,y:unit.y}}:{} )};
  };
  window.setV39GameState({players:territoryDamage.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(apply)}})),territoryStateByTile:territoryDamage.territoryStateByTile,enemies:state.enemies.map(apply),neutralVillages:state.neutralVillages.map(v=>({...v,defenseUnits:(v.defenseUnits||[]).map(apply)}))},{reason:'ground-collapse',returnState:false});
  const impactName=result.impacts.some(impact=>impact.kind==='landslide')?'土砂崩れ':'落石';
  window.dispatchEvent(new CustomEvent('v39:combat-log',{detail:{summary:`${impactName} ${result.impacts.length}マス`,skillName:impactName,entries:[],combatActivity:false}}));
  window.dispatchEvent(new CustomEvent('v39:terrain-damage',{detail:{entries,worldId:state.activeWorldId}}));
  if(territoryDamage.entries.length)window.dispatchEvent(new CustomEvent('v39:territory-hazard-damage',{detail:{turnNumber:turn,entries:territoryDamage.entries,populationEntries:territoryDamage.populationEntries,facilityEntries:territoryDamage.facilityEntries,storageEntries:territoryDamage.storageEntries}}));
}
export function renderV39RubbleActions(unit){
  const map=window.__v39FieldRuntime?.mapData;
  if(!rules.rubble||!unit||Number(unit.hp??unit.currentHp)<=0)return '';
  const local=Object.keys(map?.terrainDamage?.rubbleByTile||{}).flatMap(k=>{
    const [x,y]=k.split(',').map(Number);if(getHexDistance(unit,{x,y})>1)return [];
    const hp=map.terrainDamage.rubbleByTile[k].hp;
    return [`<button type="button" class="technique-card technique-select-card system-action-card" data-v39-rubble-clear="${k}"><span class="technique-summary"><span class="technique-icon"><span class="technique-icon-glyph">⚒</span></span><b class="technique-name">瓦礫撤去 (${x},${y})</b><small class="technique-ap">AP ${rules.clearApCost}</small><span class="technique-power">耐久 ${hp}</span></span></button>`];
  }).join('');
  if(!map?.isUnderground)return local;
  const surface=window.getV39GameState?.()?.explorationWorlds?.surface?.map;
  const linked=(map.entrances||[]).flatMap(entrance=>{
    if(!entrance.surfaceEntrance||getHexDistance(unit,entrance)>1)return [];
    const {x,y}=entrance.surfaceEntrance,hp=surface?.terrainDamage?.rubbleByTile?.[`${x},${y}`]?.hp;
    return hp>0?[`<button type="button" class="technique-card technique-select-card system-action-card" data-v39-rubble-clear="${x},${y}" data-v39-rubble-clear-cave="${entrance.x},${entrance.y}"><span class="technique-summary"><span class="technique-icon"><span class="technique-icon-glyph">⚒</span></span><b class="technique-name">入口の土砂を撤去</b><small class="technique-ap">AP ${rules.clearApCost}</small><span class="technique-power">耐久 ${hp}</span></span></button>`]:[];
  }).join('');
  return local+linked;
}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-v39-rubble-clear]');if(!button||window.isV39MapInputLocked?.())return;
  const caveEntry=button.dataset.v39RubbleClearCave?.split(',').map(Number);
  const state=window.getV39GameState(caveEntry?undefined:{includeWorlds:false}),p=state.players.find(p=>p.id===state.activePlayerId),unit=p?.factionState.units.find(u=>u.id===p.factionState.selectedUnitId);
  if(!unit||state.timeline.phase!=='player'||(unit.worldId||'surface')!==state.activeWorldId||isV39UnitWaiting(unit,state.timeline.turnNumber))return;
  const [x,y]=button.dataset.v39RubbleClear.split(',').map(Number);
  if(caveEntry&&getHexDistance(unit,{x:caveEntry[0],y:caveEntry[1]})>1)return;
  const targetMap=caveEntry?state.explorationWorlds?.surface?.map:window.__v39FieldRuntime.mapData;
  const actor=caveEntry?{...unit,x,y}:applyV39TerrainModifiers(unit);
  const result=clearV39Rubble(targetMap,actor,{x,y});
  if(!result.ok){window.showV39TurnBanner?.(result.reason);return;}
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.();
  if(caveEntry)window.setV39GameState({explorationWorlds:{...state.explorationWorlds,surface:{...state.explorationWorlds.surface,map:result.map}}},{reason:'cave-entrance-rubble-clear'});
  else commitMap(result.map);
  window.updateV39ActiveFactionState({units:p.factionState.units.map(u=>u.id===unit.id?{...u,ap:Number(u.ap??u.currentAp)-result.apCost,currentAp:Number(u.ap??u.currentAp)-result.apCost,actionPoint:Number(u.ap??u.currentAp)-result.apCost,lastAction:'瓦礫撤去',lastActionTurn:state.timeline.turnNumber}:u)},{reason:'rubble-clear'});
  window.refreshV39SquadDerivedUI?.();window.showV39TurnBanner?.(`瓦礫撤去: 残耐久${result.hp}`);
});
