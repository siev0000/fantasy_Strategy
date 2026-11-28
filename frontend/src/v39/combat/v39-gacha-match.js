import {getGameDataRows} from '../../lib/game-data-registry.js';
import {buildV39ClassEquipment} from '../../lib/v39-unit-creation-rules.js';
import {createV39EquipmentEntry} from '../../lib/v39-equipment-rules.js';
import {getV39UnitFootprint} from '../../lib/v39-unit-footprint.js';
import {resolveV39CurrentUnitAbilities} from '../../lib/v39-current-unit-abilities.js';
import {hasV39SkillWeapon,resolveAttackRows} from '../../lib/v39-combat-engine.js';
import {describeV39Cast,isV39CastAttackLocked} from '../../lib/v39-casting-rules.js';
import {getV39ActionBlock} from '../../lib/v39-control-status.js';
import {isV39UnitWaiting} from '../../lib/v39-unit-action-rules.js';
import {advanceV39PersonalDefenses} from '../../lib/v39-defense-rules.js';
import {pruneV39DefenseStructures} from '../../lib/v39-wall-edges.js';
import {advanceV39Fog} from '../../lib/v39-fog-rules.js';
import {canUnitEnterV39Tile} from '../../lib/v39-terrain-traversal.js';
import {advanceV39SkillTriggerTurn} from '../../lib/v39-skill-triggers.js';
import {advanceV39SustainedEffects} from '../../lib/v39-sustained-effects.js';
import {advanceV39SkillCounters} from '../../lib/v39-skill-counters.js';
import {resolveV39SquadMovementGroup,applyV39SquadMovement,unitCurrentAp} from '../../lib/v39-squad-movement-rules.js';
import {buildReachablePlan,pathTo} from '../unit/v39-unit-movement.js';
import {recoverUnitHp,restoreUnitForTurn} from '../core/v39-turn-system.js';
import {createV39CombatRuntime} from './v39-combat.js';
import {V39_GACHA_FIELD_TILES,gachaFootprint} from '../../lib/v39-gacha-field-rules.js';

const worldId='surface';
const reserveWorldId='gacha-reserve';
const playerKeys=['gacha-player','gacha-opponent'];
const terrainByField={山:'山岳',雪山:'雪原',海辺:'平地'};
const swapAp=40;
const alive=unit=>Number(unit?.hp??unit?.currentHp)>0&&unit.state!=='死亡';
const setAp=(unit,ap)=>({...unit,ap,currentAp:ap,actionPoint:ap});

function makePlayer(id,units,selectedId,start){
  const classes=getGameDataRows('クラス');
  return {id,isPlayer:true,factionState:{selectedUnitId:selectedId,combatRuntime:{},squads:[],units:units.map(unit=>{
    const member=structuredClone(unit);
    const active=member.id===selectedId;
    const equipment=member.equipment?.length?member.equipment:buildV39ClassEquipment(classes.find(row=>row.名前===member.className))
      .map(({name,slot})=>createV39EquipmentEntry(name,undefined,slot)).filter(Boolean);
    const x=active?start(member):-1;
    return {...member,equipment,x,y:0,position:[x,0],worldId:active?worldId:reserveWorldId};
  })}};
}

export function createV39GachaMatch(roster,selectedId,enemy,report,{playEffect,onCombatLog}={}){
  const opponents=Array.isArray(enemy)?enemy:[enemy];
  const map={w:V39_GACHA_FIELD_TILES,h:1,worldWrapEnabled:false,defenseStructures:[],splashHitChancePerTile:.02,
    resolveUnitFootprint(anchor,siz){return Array.from({length:gachaFootprint(siz)},(_,i)=>({x:anchor.x+i,y:anchor.y}));}};
  let state={timeline:{phase:'player',turnNumber:1},activePlayerId:playerKeys[0],activeWorldId:worldId,
    enemies:[],neutralVillages:[],settlements:[],worldEnvironment:{activeDisasters:[]},
    players:[makePlayer(playerKeys[0],roster,selectedId,()=>1),
      makePlayer(playerKeys[1],opponents,opponents[0].id,unit=>V39_GACHA_FIELD_TILES-gachaFootprint(unit.status?.SIZ??unit.SIZ)-1)]};
  const runtime={mapData:map};
  const update=patch=>{state={...state,...patch};return state;};
  const select=side=>update({activePlayerId:playerKeys[side]});
  const faction=side=>state.players[side].factionState;
  const active=side=>faction(side).units.find(unit=>unit.id===faction(side).selectedUnitId);
  const writeFaction=(side,replacement)=>update({players:state.players.map((player,i)=>i===side?{...player,factionState:replacement}:player)});
  const turn=()=>state.timeline.turnNumber;
  const setField=name=>{map.grid=[Array(V39_GACHA_FIELD_TILES).fill(terrainByField[name]||name)];};
  setField('平地');
  const host={getV39CombatMap:()=>map,getV39GameState:()=>state,getV39ActiveFactionState:()=>faction(playerKeys.indexOf(state.activePlayerId)),
    setV39GameState:update,canV39AttackFaction:(a,b)=>a!==b,reportCombatMessage:report,__v39FieldRuntime:runtime,
    __v39BackgroundWorldTurn:true,__v39SuppressCombatEffects:!playEffect,
    playV39MapEffect:request=>playEffect?.(request,{mapData:map,state}),
    updateV39FieldData(next){Object.assign(map,next);return true;},
    dispatchEvent(event){
      if(event.type==='v39:attack-resolved')combat.handleCounter(event);
      if(event.type==='v39:combat-log'&&event.detail?.summary){
        report(event.detail.summary);
        onCombatLog?.(event.detail,state.timeline.turnNumber);
      }
    }};
  const combat=createV39CombatRuntime(host,{getElementById:()=>null});
  const footprint=unit=>getV39UnitFootprint(unit,map,state);

  function movement(side){
    select(side);
    const unit=active(side);
    if(!alive(unit)||getV39ActionBlock(unit,turn(),'move')||isV39UnitWaiting(unit,turn()))return null;
    const group=resolveV39SquadMovementGroup(faction(side),unit.id,{followFormation:false});
    if(!group.ok)return null;
    const plan=buildReachablePlan(map,group,group.moveAp,{state,isVisible:()=>true});
    return {group,plan};
  }

  function move(side,tile){
    const movementPlan=movement(side);
    const key=movementPlan?.plan.clickable.get(`${tile},0`);
    if(!key)return false;
    const {group,plan}=movementPlan;
    const x=Number(key.split(',')[0]);
    const frames=pathTo(plan,group,{x,y:0}).map(point=>plan.formations.get(`${point.x},${point.y}`));
    const result=applyV39SquadMovement(faction(side),group,{x,y:0,positions:plan.formations.get(key),frames},plan.costs.get(key),state);
    if(!result.ok)return false;
    combat.clearPendingAction(playerKeys[side],active(side).id,'move');
    const next=faction(side);
    writeFaction(side,{...next,units:result.faction.units.map(unit=>unit.id===next.selectedUnitId?{...unit,position:[unit.x,unit.y],lastMovedTurn:turn()}:unit)});
    report(`移動 AP-${plan.costs.get(key)}`);
    return true;
  }

  function actions(side){
    const unit=active(side);
    if(!alive(unit))return [];
    const pending=faction(side).combatRuntime.pendingActionsByUnitId?.[unit.id];
    if(pending?.aimAfterCast)return describeV39Cast(pending,turn()).ready?[pending.skillRow]:[];
    if(isV39CastAttackLocked(state,unit.id,turn()))return [];
    const adjusted=resolveV39CurrentUnitAbilities(unit,{state,mapData:map});
    return resolveAttackRows(adjusted).filter(row=>hasV39SkillWeapon(adjusted,row));
  }

  function range(side,row){
    select(side);
    return combat.targetableTiles(map,active(side),row,state);
  }

  function attack(side,row,tile){
    const skillRow=actions(side).find(skill=>skill.名前===row.名前);
    if(!skillRow||!range(side,skillRow).has(`${tile},0`))return false;
    return combat.executeFactionAttack({playerId:playerKeys[side],attackerId:active(side).id,skillRow,target:{x:tile,y:0}});
  }

  function swapPosition(side,incoming){
    const outgoing=active(side),other=active(1-side);
    if(!incoming||incoming.id===outgoing.id||!alive(incoming))return null;
    if(alive(outgoing)&&(unitCurrentAp(outgoing)<swapAp||faction(side).lastSwapTurn===turn()))return null;
    const blocked=new Set(alive(other)?footprint(other).map(tile=>tile.x):[]);
    for(const x of [outgoing.x,outgoing.x-1,outgoing.x+1]){
      const tiles=getV39UnitFootprint(incoming,map,state,{x,y:0});
      if(tiles.every(tile=>!blocked.has(tile.x)&&canUnitEnterV39Tile(map,tile.x,tile.y,incoming)))return x;
    }
    return null;
  }

  function swap(side,id){
    const before=faction(side),outgoing=active(side),incoming=before.units.find(unit=>unit.id===id);
    const x=swapPosition(side,incoming);
    if(x===null)return false;
    select(side);
    combat.clearPendingAction(playerKeys[side],outgoing.id,'gacha-swap');
    const cost=alive(outgoing)?swapAp:0;
    const latest=faction(side);
    writeFaction(side,{...latest,selectedUnitId:id,lastSwapTurn:cost?turn():latest.lastSwapTurn,
      units:latest.units.map(unit=>unit.id===id?{...unit,x,y:0,position:[x,0],worldId}
        :unit.id===outgoing.id?setAp({...unit,x:-1,y:0,position:[-1,0],worldId:reserveWorldId},unitCurrentAp(unit)-cost):unit)});
    report(`${incoming.name}が出撃${cost?` / AP-${cost}`:''}`);
    return true;
  }

  function nextTurn(){
    const before=turn(),next=before+1;
    const triggered=advanceV39SkillTriggerTurn(state,before,{map});
    update(triggered.state);
    update({players:state.players.map(player=>advanceV39SustainedEffects(player))});
    combat.resolveSustainedTornadoTurn(before);
    advanceV39Fog(map,next);
    map.defenseStructures=pruneV39DefenseStructures(map.defenseStructures,next);
    update({timeline:{...state.timeline,turnNumber:next}});
    combat.resolvePendingActions(next);
    combat.pruneCombatRuntime(next);
    update({players:state.players.map(player=>({...player,factionState:{...player.factionState,units:player.factionState.units.map(unit=>{
      const updated=advanceV39SkillCounters(advanceV39PersonalDefenses(unit,next),before);
      if(updated.worldId!==worldId)return updated;
      const recovered=recoverUnitHp(updated,player.factionState,player.id,state,before);
      return restoreUnitForTurn(recovered,true,state,before,next);
    })}}))});
  }

  return {get state(){return state;},map,active,faction,turn,setField,footprint,movement,move,actions,range,attack,swapPosition,swap,nextTurn};
}
