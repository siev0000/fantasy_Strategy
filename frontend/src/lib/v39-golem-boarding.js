import {getHexNeighborCoords} from './hex-grid.js';
import {canUnitEnterV39Tile} from './v39-terrain-traversal.js';

export const GOLEM_BOARD_AP=80;
const world=unit=>unit?.worldId||'surface';
const hp=unit=>Number(unit?.hp??unit?.currentHp)||0;
const ap=unit=>Number(unit?.ap??unit?.currentAp)||0;
const alive=unit=>hp(unit)>0&&!['死亡','死体'].includes(unit.state);
const isAt=(a,b)=>a.x===b.x&&a.y===b.y;
const withAp=(unit,value)=>({...unit,ap:value,currentAp:value,actionPoint:value});
const neighbors=(map,unit)=>getHexNeighborCoords(map?.w,map?.h,unit.x,unit.y,map?.worldWrapEnabled===true);

export function isV39GolemPilot(unit){
  return alive(unit)&&(unit.className==='パイロット'
    ||Number(unit.derivedCharacter?.prerequisiteClassLevels?.パイロット??unit.prerequisiteClassLevels?.パイロット)>0);
}

export function hasV39GolemBoarding(unit){
  return alive(unit)&&!!unit.golemBuild&&(unit.techniques||[]).some(technique=>{
    const row=technique.source||technique;
    return row.行動==='P' && row.効果==='搭乗機能';
  });
}

export function getV39GolemBoardingTargets(units,pilot,map){
  if(!isV39GolemPilot(pilot)||!map?.grid)return [];
  const adjacent=neighbors(map,pilot);
  return units.filter(unit=>hasV39GolemBoarding(unit)&&!unit.boardingPilot&&unit.id!==pilot.id
    &&world(unit)===world(pilot)&&adjacent.some(tile=>isAt(unit,tile)));
}

function updateFaction(state,player,factionState){
  return {...state,players:state.players.map(row=>row.id===player.id?{...row,factionState}:row)};
}

function restorePilot(faction,pilot,host,tile){
  const squad=faction.squads?.find(row=>row.id===pilot.squadId);
  const restored={...pilot,x:tile.x,y:tile.y,position:[tile.x,tile.y],worldId:world(host),
    squadId:squad?.id||'solo'};
  const squads=(faction.squads||[]).map(row=>row===squad?{...row,unitIds:[...new Set([...(row.unitIds||[]),pilot.id])]}:row);
  return {...faction,squads,units:[...faction.units,restored]};
}

function clearPilotEffects(faction,unitId){
  const runtime=faction.combatRuntime;
  const effects=runtime?.activeEffectsByUnitId?.[unitId];
  if(!effects?.some(effect=>effect.boardingOnly))return faction;
  return {...faction,combatRuntime:{...runtime,activeEffectsByUnitId:{
    ...runtime.activeEffectsByUnitId,[unitId]:effects.filter(effect=>!effect.boardingOnly)
  }}};
}

export function operateV39GolemBoarding(state,map,{pilotId,golemId,disembark=false}){
  const fail=reason=>({state,reason});
  const player=state.players.find(row=>row.id===state.activePlayerId),faction=player?.factionState;
  const golem=faction?.units.find(unit=>unit.id===golemId);
  if(state.timeline?.phase!=='player'||!map?.grid||!alive(golem)||world(golem)!==(state.activeWorldId||'surface')){
    return fail('操作中のワールドにいる自軍ゴーレムが必要です');
  }
  if(disembark){
    const pilot=golem.boardingPilot;
    if(!pilot)return fail('搭乗しているパイロットがいません');
    const occupied=[...state.players.flatMap(row=>row.factionState.units||[]),...(state.enemies||[]),
      ...(state.neutralVillages||[]).flatMap(village=>village.defenseUnits||[])].filter(unit=>alive(unit)&&world(unit)===world(golem));
    const tile=neighbors(map,golem).find(tile=>map.grid[tile.y]?.[tile.x]
      &&!occupied.some(unit=>isAt(unit,tile))&&canUnitEnterV39Tile(map,tile.x,tile.y,pilot));
    if(!tile)return fail('隣接する降車先に空きがありません');
    const next={...faction,units:faction.units.map(unit=>unit===golem?{...unit,boardingPilot:null}:unit),selectedUnitId:pilot.id};
    return {state:updateFaction(state,player,clearPilotEffects(restorePilot(next,pilot,golem,tile),golem.id))};
  }
  const pilot=faction.units.find(unit=>unit.id===pilotId);
  if(!getV39GolemBoardingTargets(faction.units,pilot,map).includes(golem)){
    return fail('隣接する搭乗可能なゴーレムとパイロットが必要です');
  }
  if(ap(pilot)<GOLEM_BOARD_AP||ap(golem)<GOLEM_BOARD_AP)return fail('パイロットとゴーレムにそれぞれAP80が必要です');
  const boardedPilot=withAp(pilot,ap(pilot)-GOLEM_BOARD_AP);
  const next={...faction,selectedUnitId:golem.id,
    units:faction.units.filter(unit=>unit!==pilot).map(unit=>unit===golem
      ? {...withAp(unit,ap(unit)-GOLEM_BOARD_AP),boardingPilot:boardedPilot}:unit),
    squads:(faction.squads||[]).map(squad=>({...squad,unitIds:(squad.unitIds||[]).filter(id=>id!==pilot.id)}))};
  return {state:updateFaction(state,player,next)};
}

export function releaseV39DestroyedGolemPilots(faction){
  let next=faction;
  for(const golem of faction.units||[]){
    const pilot=golem.boardingPilot;
    if(!pilot||(alive(golem)&&alive(pilot)))continue;
    next={...next,units:next.units.map(unit=>unit.id===golem.id?{...unit,boardingPilot:null}:unit)};
    if(!next.units.some(unit=>unit.id===pilot.id))next=restorePilot(next,pilot,golem,golem);
    next=clearPilotEffects(next,golem.id);
    if(next.selectedUnitId===golem.id&&!alive(golem)&&alive(pilot))next.selectedUnitId=pilot.id;
  }
  return next;
}
