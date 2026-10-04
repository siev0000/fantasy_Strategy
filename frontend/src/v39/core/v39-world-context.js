import { isV39UnitInWorld } from "../../lib/v39-cave-spatial-rules.js";

// 非表示マップも既存の処理を使う。Phaserのマップ・カメラはロードし直さない。
export async function withV39WorldContext(worldId,callback,{allUnits=false}={}) {
  const current=window.getV39EnemyTurnState();
  if(worldId===(current.activeWorldId||"surface")){
    // 表示中のマップは切替不要。所在による投影だけで別階層への処理を防ぐ。
    const keys=["getV39GameState","getV39EnemyTurnState","getV39ActivePlayer","getV39ActiveFactionState","setV39GameState","updateV39ActiveFactionState"];
    const originals=Object.fromEntries(keys.map(key=>[key,window[key]]));
    if(worldId==="surface"&&(allUnits||current.players.every(player=>player.factionState.units.every(unit=>isV39UnitInWorld(unit,worldId))))){
      // 中間更新は既存コンテキストと同じく通知せず、ターン末にまとめて表示する。
      window.setV39GameState=(patch,options)=>originals.setV39GameState(patch,{...options,silent:true});
      window.updateV39ActiveFactionState=(patch,options)=>originals.updateV39ActiveFactionState(patch,{...options,silent:true});
      try{return await callback();}finally{Object.assign(window,originals);}
    }
    const inWorld=unit=>isV39UnitInWorld(unit,worldId);
    const project=state=>({...state,players:state.players.map(player=>({...player,factionState:{...player.factionState,units:allUnits?player.factionState.units:player.factionState.units.filter(inWorld),settlements:(player.factionState.settlements||[]).filter(inWorld),village:worldId==="surface"?player.factionState.village:null}}))});
    try{
      window.getV39GameState=options=>project(originals.getV39GameState(options));
      window.getV39EnemyTurnState=()=>project(originals.getV39EnemyTurnState());
      window.getV39ActivePlayer=()=>project({players:[originals.getV39ActivePlayer()]}).players[0];
      window.getV39ActiveFactionState=()=>window.getV39ActivePlayer()?.factionState;
      window.setV39GameState=(patch,options)=>{
        const state=originals.getV39EnemyTurnState();
        const players=patch.players?.map(player=>{
          const base=state.players.find(row=>row.id===player.id)?.factionState;
          return {...player,factionState:{...player.factionState,village:worldId==="surface"?player.factionState.village:base?.village,settlements:[...(base?.settlements||[]).filter(row=>!inWorld(row)),...(player.factionState.settlements||[])],units:allUnits?player.factionState.units:[...(base?.units||[]).filter(unit=>!inWorld(unit)),...player.factionState.units]}};
        });
        return originals.setV39GameState(players?{...patch,players}:patch,{...options,silent:true});
      };
      window.updateV39ActiveFactionState=(patch,options)=>{
        const state=window.getV39GameState({includeWorlds:false});
        window.setV39GameState({players:state.players.map(player=>player.id===state.activePlayerId?{...player,factionState:{...player.factionState,...patch}}:player)},options);
        return window.getV39ActiveFactionState();
      };
      return await callback();
    }finally{Object.assign(window,originals);}
  }
  const runtime=window.__v39FieldRuntime;
  const originals=Object.fromEntries(["getV39GameState","getV39EnemyTurnState","getV39ActivePlayer","getV39ActiveFactionState","setV39GameState","updateV39ActiveFactionState","updateV39FieldData"].map(key=>[key,window[key]]));
  const initial=originals.getV39EnemyTurnState(),visibleId=initial.activeWorldId||"surface";
  const worlds=window.captureV39ExplorationWorlds?.()||initial.explorationWorlds;
  const world=worlds[worldId];if(!world?.map)return callback();
  const visible=worlds[visibleId],oldMap=runtime.mapData,oldSettings=runtime.settings;
  const oldBackground=window.__v39BackgroundWorldTurn,oldSuppression=window.__v39SuppressCombatEffects;
  const inWorld=unit=>isV39UnitInWorld(unit,worldId);
  const projectFaction=faction=>({...faction,
    units:allUnits?faction.units:faction.units.filter(inWorld),
    settlements:(faction.settlements||[]).filter(row=>isV39UnitInWorld(row,worldId)),
    village:worldId==="surface"?faction.village:null
  });
  const project=state=>({...state,players:state.players.map(player=>({...player,factionState:projectFaction(player.factionState)}))});
  const mergePlayers=players=>{
    const current=originals.getV39EnemyTurnState();
    return players.map(player=>{
      const base=current.players.find(row=>row.id===player.id)?.factionState;
      if(!base)return player;
      const faction=player.factionState;
      return {...player,factionState:{...faction,village:worldId==="surface"?faction.village:base.village,
        selectedUnitId:worldId!==visibleId?base.selectedUnitId:faction.selectedUnitId,
        units:allUnits?faction.units:[...base.units.filter(unit=>!inWorld(unit)),...faction.units.map(unit=>({...unit,worldId}))],
        settlements:[...(base.settlements||[]).filter(row=>!isV39UnitInWorld(row,worldId)),...(faction.settlements||[])]
      }};
    });
  };
  try {
    runtime.mapData=worldId===visibleId?oldMap:structuredClone(world.map);runtime.settings=structuredClone(world.settings||{});
    window.__v39BackgroundWorldTurn=worldId!==visibleId;
    window.__v39SuppressCombatEffects=oldSuppression||worldId!==visibleId;
    // 空のruntimeで前マップの待機技を引き継がない。
    originals.setV39GameState({activeWorldId:worldId,...world.spatial,
      enemyCombatRuntime:world.spatial.enemyCombatRuntime||{},
      players:initial.players.map(player=>({...player,factionState:{...player.factionState,visibility:world.visibility?.[player.id]||{},exploration:world.exploration?.[player.id]||{}}}))
    },{silent:true});
    window.getV39GameState=options=>project(originals.getV39GameState(options));
    window.getV39EnemyTurnState=()=>project(originals.getV39EnemyTurnState());
    window.getV39ActivePlayer=()=>({ ...originals.getV39ActivePlayer(), factionState:projectFaction(originals.getV39ActiveFactionState()) });
    window.getV39ActiveFactionState=()=>window.getV39ActivePlayer()?.factionState;
    window.setV39GameState=(patch,options={})=>{
      const merged=patch.players?{...patch,players:mergePlayers(patch.players)}:patch;
      return project(originals.setV39GameState(merged,{...options,silent:true}));
    };
    window.updateV39ActiveFactionState=(patch,options={})=>{
      const state=window.getV39GameState({includeWorlds:false});
      window.setV39GameState({players:state.players.map(player=>player.id===state.activePlayerId?{...player,factionState:{...player.factionState,...patch}}:player)},options);
      return window.getV39ActiveFactionState();
    };
    if(worldId!==visibleId)window.updateV39FieldData=map=>{runtime.mapData=map;};
    return await callback();
  } finally {
    const updated=originals.getV39EnemyTurnState();
    const captured=window.captureV39ExplorationWorlds?.()||worlds;
    // capture uses projected getters; spatial data is unaffected, shared unit data stays canonical.
    Object.assign(window,originals);
    window.__v39BackgroundWorldTurn=oldBackground;window.__v39SuppressCombatEffects=oldSuppression;
    runtime.mapData=worldId===visibleId?runtime.mapData:oldMap;runtime.settings=oldSettings;
    const restore=worldId===visibleId?captured[worldId]:visible;
    originals.setV39GameState({activeWorldId:visibleId,explorationWorlds:captured,...restore.spatial,
      players:updated.players.map(player=>({...player,factionState:{...player.factionState,visibility:restore.visibility?.[player.id]||{},exploration:restore.exploration?.[player.id]||{}}}))
    },{silent:true});
  }
}

export function v39TurnWorldIds(){
  const state=window.getV39EnemyTurnState();
  return [...new Set([state.activeWorldId||"surface",...window.getV39ExplorationWorldIds()])];
}
