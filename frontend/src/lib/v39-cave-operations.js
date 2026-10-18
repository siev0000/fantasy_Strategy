import { V39_CAVE_MINE_BALANCE as balance, V39_CAVE_NEST_BALANCE } from "./v39-gameplay-balance.js";
import { resolveV39AutomaticRoute, resolveV39AutomaticMovementSteps, isV39ArmyTransportUnit, isV39UnitInsideSettlement, getV39TransportCargo } from "./v39-transport-rules.js";
import { resolveV39UnitCargoCapacity, resolveV39CargoLoad } from "./v39-logistics-state.js";
import { replaceFactionSettlement } from "./settlement-state.js";
import { getHexDistance } from "./hex-grid.js";

const alive = unit => Number(unit?.hp ?? unit?.currentHp) > 0 && unit?.state !== "死亡";
const at = (a,b) => a?.x === b?.x && a?.y === b?.y;
const worldId = unit => unit.worldId || "surface";

export function resolveV39MineRoute(worlds, id) {
  const chain = [], seen = new Set();
  while (id && id !== "surface" && !seen.has(id)) {
    seen.add(id);
    const map = worlds[id]?.map;
    if (!map?.isUnderground) return null;
    chain.unshift({ id, map });
    id = map.parentWorldId || "surface";
  }
  if (id !== "surface" || !chain.length) return null;
  const root = chain[0];
  const surface = root.map.entrances?.find(entry => entry.surfaceEntrance)?.surfaceEntrance || root.map.parentExit;
  if (!surface || !worlds.surface?.map) return null;
  return [{ id:"surface", map:worlds.surface.map }, ...chain].map((entry,index) => ({...entry,
    forward:index === 0 ? surface : index < chain.length ? chain[index].map.parentExit : entry.map.entrances[0],
    backward:index === 0 ? null : index===1 ? entry.map.entrances.find(tile=>tile.surfaceEntrance) : entry.map.entrances[0],
    exit:index === 1 ? surface : entry.map.parentExit
  }));
}

export function assignV39MineDuty(state, playerId, mineWorldId, unitId, duty, settlementId = "") {
  const player = state.players.find(row => row.id === playerId), unit = player?.factionState.units.find(row => row.id === unitId);
  const route = resolveV39MineRoute(state.explorationWorlds || {}, mineWorldId);
  const mine = state.explorationWorlds?.[mineWorldId]?.map?.caveMine;
  if (duty!=='none' && (!mine || mine.ownerPlayerId !== playerId || !route)) return {ok:false,state,reason:"自軍鉱床の地上への接続がありません"};
  if (!alive(unit) || !isV39ArmyTransportUnit(unit)) return {ok:false,state,reason:"生存する自軍の軍隊を指定してください"};
  const instructor = [...Object.values(player.factionState.recruitInstructorByTile || {}), ...Object.values(player.factionState.recruitInstructorTransfers || {})].some(row=>row.unitId===unitId);
  if (duty !== 'none' && (unit.tradeAssignment || unit.transportAssignment || instructor)) return {ok:false,state,reason:"他の任務を解除してください"};
  if (duty !== 'none' && resolveV39CargoLoad(getV39TransportCargo(player.factionState,unitId))>0) return {ok:false,state,reason:"通常の積載物を荷下ろししてください"};
  const previous = unit.caveDuty;
  if (previous?.cargo && Object.values(previous.cargo).some(value => value > 0)) return {ok:false,state,reason:"積載物を拠点へ届けてから任務を変更してください"};
  if (!['guard','transport','none'].includes(duty)) return {ok:false,state,reason:"任務が不正です"};
  if (duty === "transport" && !player.factionState.settlements.some(row => row.id === settlementId && row.placed)) return {ok:false,state,reason:"搬入先の拠点を選んでください"};
  const changed = {...unit};
  if (duty === "none") delete changed.caveDuty;
  else changed.caveDuty = {mineWorldId, duty, settlementId, leg:"mine", status:"移動中", cargo:{}};
  return {ok:true,state:{...state,players:state.players.map(row => row.id !== playerId ? row : {...row,
    factionState:{...row.factionState, units:row.factionState.units.map(row => row.id === unitId ? changed : row)}})}};
}

export function advanceV39MineDuties(state, playerId, turn) {
  let worlds = {...state.explorationWorlds}, player = state.players.find(row => row.id === playerId);
  if (!player) return state;
  let faction = player.factionState;
  const units = faction.units.map(source => {
    if (!source.caveDuty || source.caveDuty.paused || !alive(source) || source.caveDuty.lastTurn >= turn || source.waitTurnNumber === turn) return source;
    const duty = {...source.caveDuty, cargo:{...source.caveDuty.cargo}, lastTurn:turn};
    let unit = {...source, caveDuty:duty};
    const route = resolveV39MineRoute(worlds, duty.mineWorldId), mineMap = worlds[duty.mineWorldId]?.map;
    const loaded=Object.values(duty.cargo).some(amount=>amount>0);
    if (!route || (!loaded && mineMap?.caveMine?.ownerPlayerId !== playerId)) {duty.status="停止：鉱床または経路なし";return unit;}
    if(loaded && mineMap?.caveMine?.ownerPlayerId !== playerId)duty.leg='home';
    const settlement = faction.settlements.find(row => row.id === duty.settlementId);
    if (duty.duty === 'transport' && !settlement?.placed) {duty.status="停止：搬入先なし";return unit;}
    let ap = Number(unit.ap ?? unit.currentAp) || 0;
    for (let crossings=0;crossings<=route.length;crossings++) {
      const index = route.findIndex(entry => entry.id === worldId(unit));
      if (index < 0) {duty.status="停止：別の洞窟にいます";break;}
      const entry = route[index];
      const returning = duty.leg === 'home' || duty.duty === 'guard';
      const target = returning ? (index === 0 ? duty.duty === 'guard' ? route[0].forward : settlement : entry.backward) : entry.forward;
      if (!target) {duty.status="停止：接続情報なし";break;}
      const scoped = {...state,...(worlds[entry.id].spatial || {}), players:state.players.map(row => row.id === playerId ? {...row,factionState:{...faction,units:faction.units.map(row=>row.id===unit.id?unit:row)}} : row)};
      const path = resolveV39AutomaticRoute(scoped,entry.map,playerId,unit,target,entry.map.worldWrapEnabled === true);
      if (!path) {duty.status="停止：通路が塞がれています";break;}
      for (const step of resolveV39AutomaticMovementSteps(path,ap)) {unit={...unit,x:step.x,y:step.y,lastActionTurn:turn};ap-=step.stepCost;}
      if (path.waitingForFriendlyUnitId && (path.length === 0 || `${unit.x},${unit.y}` === path.at(-1).key)) {
        duty.status="味方ユニットの移動待ち";break;
      }
      if (!at(unit,target) && !(returning && index === 0 && duty.duty === 'transport' && isV39UnitInsideSettlement(unit,settlement))) {duty.status="移動中";break;}
      if (returning && index === 0) {
        if (duty.duty === 'guard') {duty.status="入口警備中";break;}
        const stock = {...settlement.materialStockByType};
        for (const [key,amount] of Object.entries(duty.cargo)) {const resource=balance.stockResourceAliases[key] || key;stock[resource]=(Number(stock[resource])||0)+amount;}
        faction=replaceFactionSettlement(faction,{...settlement,materialStockByType:stock},{ownerPlayerId:playerId,select:false});
        duty.cargo={};duty.leg='mine';duty.status="搬入完了";break;
      }
      if (!returning && index === route.length-1) {
        const mine={...mineMap.caveMine,stockByResource:{...mineMap.caveMine.stockByResource}};
        let remaining=resolveV39UnitCargoCapacity(unit)-Object.values(duty.cargo).reduce((sum,value)=>sum+value,0);
        for(const [resource,available] of Object.entries(mine.stockByResource)){const amount=Math.max(0,Math.min(available,remaining));duty.cargo[resource]=(duty.cargo[resource]||0)+amount;mine.stockByResource[resource]-=amount;remaining-=amount;}
        worlds[duty.mineWorldId]={...worlds[duty.mineWorldId],map:{...mineMap,caveMine:mine}};
        if(Object.values(duty.cargo).some(value=>value>0)){duty.leg='home';duty.status="積込完了";}else duty.status="採掘待ち";
        break;
      }
      if(ap<balance.crossingApCost){duty.status="入口でAP待ち";break;}
      ap-=balance.crossingApCost;
      const next=route[index+(returning?-1:1)],destination=returning?entry.exit:next.backward;
      const nextScoped=worlds[next.id]?.spatial;
      if (!destination || (nextScoped?.enemies||[]).some(enemy=>alive(enemy)&&at(enemy,destination)) || state.players.some(row=>row.factionState.units.some(other=>other.id!==unit.id&&alive(other)&&worldId(other)===next.id&&at(other,destination)))) {ap+=balance.crossingApCost;duty.status="入口が塞がれています";break;}
      unit={...unit,x:destination.x,y:destination.y,worldId:next.id,lastActionTurn:turn};
    }
    unit={...unit,position:[unit.x,unit.y],ap,currentAp:ap,caveDuty:duty};
    faction={...faction,units:faction.units.map(row=>row.id===unit.id?unit:row)};
    return unit;
  });
  return {...state,explorationWorlds:worlds,players:state.players.map(row=>row.id===playerId?{...row,factionState:{...faction,units}}:row)};
}

export function advanceV39CaveIntrusions(state, turn) {
  // マップ画像・地形の巨大配列は不変。移動で変更する個体と巣だけ複製する。
  const worlds=Object.fromEntries(Object.entries(state.explorationWorlds || {}).map(([id,world])=>[id,{...world,spatial:{...world.spatial,
    enemies:(world.spatial?.enemies || []).map(unit=>({...unit})),enemyNests:(world.spatial?.enemyNests || []).map(nest=>({...nest})),enemySquads:(world.spatial?.enemySquads || []).map(squad=>({...squad}))}}])), surface=worlds.surface;
  if(!surface?.map || !V39_CAVE_NEST_BALANCE.allowEntryIntoPlayerMine)return state;
  for(const [id,world] of Object.entries(worlds)){
    if(!world.map?.isUnderground || world.map.parentWorldId && world.map.parentWorldId!=='surface')continue;
    const mine = Object.entries(worlds).map(([mineId,candidate])=>({mine:candidate.map?.caveMine,route:resolveV39MineRoute(worlds,mineId)}))
      .find(candidate=>candidate.mine && candidate.route?.[1]?.id===id)?.mine;
    if(!mine)continue;
    for(const entrance of world.map.entrances || []){
      const surfaceTile=entrance.surfaceEntrance;if(!surfaceTile)continue;
      const guards=state.players.find(row=>row.id===mine.ownerPlayerId)?.factionState.units || [];
      if(guards.some(unit=>alive(unit)&&isV39ArmyTransportUnit(unit)&&worldId(unit)==='surface'&&at(unit,surfaceTile)))continue;
      // 実個体が入口まで歩く。戦闘中や近くにプレイヤーがいる時は通常AIへ委ねる。
      for(const enemy of surface.spatial.enemies || []){
        if(!alive(enemy)||enemy.victoryGuard||enemy.provoked||surface.spatial.enemyCombatRuntime?.pendingActionsByEnemyId?.[enemy.id]||enemy.lastCaveApproachTurn>=turn||getHexDistance(enemy,surfaceTile)>balance.intrusionApproachRadius)continue;
        if(state.players.some(player=>player.factionState.units.some(unit=>alive(unit)&&worldId(unit)==='surface'&&getHexDistance(enemy,unit)<=balance.intrusionCombatPriorityRadius)))continue;
        const path=resolveV39AutomaticRoute({...state,...surface.spatial},surface.map,"",enemy,surfaceTile,surface.map.worldWrapEnabled===true);
        if(!path)continue;
        let ap=Number(enemy.ap??enemy.currentAp)||0;
        for(const step of path){if(ap<step.stepCost)break;enemy.x=step.x;enemy.y=step.y;ap-=step.stepCost;}
        enemy.ap=ap;enemy.currentAp=ap;enemy.lastCaveApproachTurn=turn;
      }
      const invaders=(surface.spatial?.enemies||[]).filter(enemy=>alive(enemy)&&at(enemy,surfaceTile)&&!enemy.victoryGuard&&!enemy.provoked&&!surface.spatial.enemyCombatRuntime?.pendingActionsByEnemyId?.[enemy.id]&&enemy.lastCaveEntryTurn!==turn&&(Number(enemy.ap??enemy.currentAp)||0)>=balance.crossingApCost);
      for(const enemy of invaders){
        if((world.spatial.enemies||[]).some(other=>alive(other)&&at(other,entrance)) || state.players.some(row=>row.factionState.units.some(unit=>alive(unit)&&worldId(unit)===id&&at(unit,entrance))))break;
        surface.spatial.enemies=surface.spatial.enemies.filter(row=>row.id!==enemy.id);
        surface.spatial.enemySquads=(surface.spatial.enemySquads || []).map(squad=>({...squad,unitIds:(squad.unitIds || []).filter(unitId=>unitId!==enemy.id)}));
        surface.spatial.enemyNests=(surface.spatial.enemyNests || []).map(nest=>({...nest,unitIds:(nest.unitIds || []).filter(unitId=>unitId!==enemy.id)}));
        const ap=Number(enemy.ap??enemy.currentAp)-balance.crossingApCost;
        const nest=surface.spatial.enemyNests?.find(row=>row.id===enemy.nestId);
        const food=Object.entries(nest?.foodStockByType||{}).find(([,amount])=>amount>=V39_CAVE_NEST_BALANCE.minimumArrivalFood);
        const amount=food?Math.min(food[1],V39_CAVE_NEST_BALANCE.arrivalFoodAmount):0;
        if(food)nest.foodStockByType={...nest.foodStockByType,[food[0]]:food[1]-amount};
        world.spatial.enemies.push({...enemy,x:entrance.x,y:entrance.y,position:[entrance.x,entrance.y],worldId:id,ap,currentAp:ap,lastCaveEntryTurn:turn,originSurfaceNestId:enemy.nestId,nestId:null,enemySquadId:null,caveArrivalFood:amount,caveArrivalFoodResource:food?.[0]||""});
      }
    }
  }
  // 奥地鉱床へも実個体が通路と階層入口を通って進む。近くの生存ユニットとの戦闘を優先する。
  const mineRoutes=Object.entries(worlds).filter(([,world])=>world.map?.caveMine).map(([id])=>resolveV39MineRoute(worlds,id)).filter(Boolean);
  for(const [id,world] of Object.entries(worlds)){
    if(id==='surface')continue;
    const route=mineRoutes.find(rows=>rows.some((entry,index)=>entry.id===id&&index<rows.length-1));
    if(!route)continue;
    const index=route.findIndex(entry=>entry.id===id),next=route[index+1],target=route[index].forward,destination=next.backward;
    for(const enemy of [...world.spatial.enemies]){
      if(!alive(enemy)||!enemy.lastCaveEntryTurn||enemy.lastCaveDescentTurn>=turn||enemy.provoked||world.spatial.enemyCombatRuntime?.pendingActionsByEnemyId?.[enemy.id])continue;
      if(state.players.some(player=>player.factionState.units.some(unit=>alive(unit)&&worldId(unit)===id&&getHexDistance(enemy,unit)<=balance.intrusionCombatPriorityRadius)))continue;
      const path=resolveV39AutomaticRoute({...state,...world.spatial},world.map,"",enemy,target,false);
      if(!path)continue;
      let ap=Number(enemy.ap??enemy.currentAp)||0;
      for(const step of path){if(ap<step.stepCost)break;enemy.x=step.x;enemy.y=step.y;ap-=step.stepCost;}
      enemy.ap=ap;enemy.currentAp=ap;
      if(!at(enemy,target)||ap<balance.crossingApCost||next.map.caveMine?.invasionProgress?.ready)continue;
      const blocked=worlds[next.id].spatial.enemies.some(other=>alive(other)&&at(other,destination))
        ||state.players.some(player=>player.factionState.units.some(unit=>alive(unit)&&worldId(unit)===next.id&&at(unit,destination)));
      if(blocked)continue;
      world.spatial.enemies=world.spatial.enemies.filter(unit=>unit.id!==enemy.id);
      worlds[next.id].spatial.enemies.push({...enemy,x:destination.x,y:destination.y,position:[destination.x,destination.y],worldId:next.id,ap:ap-balance.crossingApCost,currentAp:ap-balance.crossingApCost,lastCaveDescentTurn:turn});
    }
  }
  const visible=worlds[state.activeWorldId||'surface'];
  return {...state,explorationWorlds:worlds,...(visible?{enemies:visible.spatial.enemies,enemyNests:visible.spatial.enemyNests,enemySquads:visible.spatial.enemySquads}: {})};
}
