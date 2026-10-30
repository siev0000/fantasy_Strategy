import {damageV39Ground,advanceV39GroundCollapses,clearV39Rubble,V39_TERRAIN_DESTRUCTION_RULES as rules} from '../../lib/v39-terrain-destruction.js';
import {resolveV39TerrainAttackPower,computeAttackDamage} from '../../lib/v39-combat-engine.js';
import {applyV39TerrainModifiers} from '../../lib/v39-terrain-modifiers.js';
import {getHexDistance} from '../../lib/hex-grid.js';
import {isV39UnitWaiting} from '../../lib/v39-unit-action-rules.js';
const key=p=>`${p.x},${p.y}`;
function commitMap(map){
  if(window.__v39BackgroundWorldTurn)window.__v39FieldRuntime.mapData=map;
  else window.updateV39FieldData?.(map,{reason:'terrain-destruction'});
  if(!window.__v39BackgroundWorldTurn)window.refreshV39MapEntities?.();
}
export function applyV39AttackGroundDamage(map,area,attacker,row,turn,state){
  area.groundSummary='';
  area.achievementTerrainReports=[];
  if(!rules.enabled||![...area.keys()].some(k=>{
    const [x,y]=k.split(',').map(Number);
    return map.terrainDamage?.rubbleByTile?.[k]||(!map.terrainDamage?.cells?.[k]?.broken&&rules.durabilityByTerrain[map.specialMap?.[y]?.[x]||map.grid?.[y]?.[x]]);
  }))return;
  const adjusted=applyV39TerrainModifiers(attacker,map),powerCache=new Map();
  const power=rule=>{
    const cacheKey=rule.eligibleDamageTypes.join('/');
    if(!powerCache.has(cacheKey))powerCache.set(cacheKey,resolveV39TerrainAttackPower(row,adjusted,{damageTypes:rule.eligibleDamageTypes}));
    return powerCache.get(cacheKey);
  };
  const structureTiles=new Set((map.defenseStructures||[]).filter(s=>area.blockingStructures?.has(s.id)).flatMap(s=>s.edge?[key(s.edge.from),key(s.edge.to)]:(s.tiles||[]).map(key)));
  const result=damageV39Ground(map,new Map([...area].filter(([k])=>!structureTiles.has(k))),power,turn,state);
  area.achievementTerrainReports=result.reports;
  if(result.map===map)return;
  area.groundSummary=` / 地形・瓦礫: ${result.reports.slice(0,3).map(r=>`(${r.x},${r.y})残${r.hp}`).join('・')}${result.reports.length>3?' ほか':''}`;
  // Combat still holds this map reference for its final commit.
  Object.assign(map,result.map);commitMap(map);
  if(!window.__v39BackgroundWorldTurn)for(const report of result.reports.filter(r=>r.kind==='ground-broken'||r.kind==='rubble-cleared'))window.showV39TurnBanner?.(`${report.kind==='ground-broken'?'地形崩壊・落石予告':'瓦礫を除去'} (${report.x},${report.y})`);
}
export function resolveV39GroundCollapses(turn){
  const map=window.__v39FieldRuntime?.mapData;
  if(!Object.values(map?.terrainDamage?.pendingByTile||{}).some(event=>event.resolvesAtTurn<=turn))return;
  const state=window.getV39GameState({includeWorlds:false});
  const result=advanceV39GroundCollapses(map,turn,state);if(result.map===map)return;
  commitMap(result.map);const impacts=new Map(result.impacts.map(p=>[key(p),p])),entries=[];
  const apply=unit=>{
    if((unit.worldId||'surface')!==state.activeWorldId||Number(unit.hp??unit.currentHp)<=0)return unit;
    const impact=impacts.get(key(unit));if(!impact)return unit;
    const damage=computeAttackDamage({attacker:{id:'rockfall',level:1,status:{攻撃:0}},target:applyV39TerrainModifiers(unit,result.map),skillRow:{名前:'落石',攻撃手段:'肉体',判定:'攻撃',[impact.element||rules.collapse?.element||'打撃']:impact.power,効果:'必中'},random:()=>0,gameSettings:state.gameSettings});
    const beforeHp=Number(unit.hp??unit.currentHp),hp=Math.max(0,beforeHp-damage.total);
    entries.push({...damage,targetId:unit.id,targetName:unit.name,x:unit.x,y:unit.y,beforeHp,afterHp:hp,maxHp:unit.maxHp||unit.status?.HP||beforeHp});
    return {...unit,hp,currentHp:hp,...(hp<=0?{state:'死亡',deathCause:'落石',diedAtTurn:turn,deathPosition:{x:unit.x,y:unit.y}}:{} )};
  };
  window.setV39GameState({players:state.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(apply)}})),enemies:state.enemies.map(apply),neutralVillages:state.neutralVillages.map(v=>({...v,defenseUnits:(v.defenseUnits||[]).map(apply)}))},{reason:'ground-collapse',returnState:false});
  window.dispatchEvent(new CustomEvent('v39:combat-log',{detail:{summary:`落石 ${result.impacts.length}マス`,skillName:'落石',entries:[],combatActivity:false}}));
  window.dispatchEvent(new CustomEvent('v39:terrain-damage',{detail:{entries,worldId:state.activeWorldId}}));
}
export function renderV39RubbleActions(unit){
  const map=window.__v39FieldRuntime?.mapData;
  if(!rules.rubble||!unit||Number(unit.hp??unit.currentHp)<=0)return '';
  return Object.keys(map?.terrainDamage?.rubbleByTile||{}).flatMap(k=>{
    const [x,y]=k.split(',').map(Number);if(getHexDistance(unit,{x,y})>1)return [];
    const hp=map.terrainDamage.rubbleByTile[k].hp;
    return [`<button type="button" class="technique-card technique-select-card system-action-card" data-v39-rubble-clear="${k}"><span class="technique-summary"><span class="technique-icon"><span class="technique-icon-glyph">⚒</span></span><b class="technique-name">瓦礫撤去 (${x},${y})</b><small class="technique-ap">AP ${rules.clearApCost}</small><span class="technique-power">耐久 ${hp}</span></span></button>`];
  }).join('');
}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-v39-rubble-clear]');if(!button||window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState({includeWorlds:false}),p=state.players.find(p=>p.id===state.activePlayerId),unit=p?.factionState.units.find(u=>u.id===p.factionState.selectedUnitId);
  if(!unit||state.timeline.phase!=='player'||(unit.worldId||'surface')!==state.activeWorldId||isV39UnitWaiting(unit,state.timeline.turnNumber))return;
  const [x,y]=button.dataset.v39RubbleClear.split(',').map(Number);
  const result=clearV39Rubble(window.__v39FieldRuntime.mapData,applyV39TerrainModifiers(unit),{x,y});
  if(!result.ok){window.showV39TurnBanner?.(result.reason);return;}
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.();commitMap(result.map);
  window.updateV39ActiveFactionState({units:p.factionState.units.map(u=>u.id===unit.id?{...u,ap:Number(u.ap??u.currentAp)-result.apCost,currentAp:Number(u.ap??u.currentAp)-result.apCost,actionPoint:Number(u.ap??u.currentAp)-result.apCost,lastAction:'瓦礫撤去',lastActionTurn:state.timeline.turnNumber}:u)},{reason:'rubble-clear'});
  window.refreshV39SquadDerivedUI?.();window.showV39TurnBanner?.(`瓦礫撤去: 残耐久${result.hp}`);
});
