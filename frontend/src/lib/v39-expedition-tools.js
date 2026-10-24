import defaults from "../../../config/v39-expedition-defaults.json";
import {v39HazardRecoveryFromState} from './v39-hazard-zones.js';
import { getGameDataRows } from "./game-data-registry.js";
import { getHexDistance } from "./hex-grid.js";
import { isV39UnitInsideSettlement } from "./v39-transport-rules.js";
import { replaceFactionSettlement } from "./settlement-state.js";
import { resolveV39UnitCargoCapacity } from "./v39-logistics-state.js";
import { mergeV39Cargo } from "./v39-logistics-state.js";
import { V39_CAVE_MINE_BALANCE } from "./v39-gameplay-balance.js";
import {getV39ConsumableDefinitions,getV39ToolLoadout,useV39Consumable} from "./v39-consumables.js";

const alive = unit => Number(unit?.hp ?? unit?.currentHp)>0 && unit?.state!=="死亡";
const count = value => Math.max(0,Number(value)||0);
export function releaseV39ExpeditionCargoOnDeath(unit) {
  if(alive(unit))return unit;
  const resources={};
  for(const stock of [unit.caveDuty?.cargo,unit.toolStockByType,unit.expeditionCargoByType]){
    for(const [name,value] of Object.entries(stock||{})){
      const key=V39_CAVE_MINE_BALANCE.stockResourceAliases[name]||name;
      resources[key]=count(resources[key])+count(value);
    }
  }
  if(!unit.caveDuty&&!unit.toolRecovery&&!Object.values(resources).some(value=>value>0))return unit;
  // 通常の死体荷物へ統合し、再処理による二重獲得を防ぐ。
  return {...unit,corpseCargo:mergeV39Cargo(unit.corpseCargo,{resourcesByType:resources}),
    caveDuty:null,toolRecovery:null,toolStockByType:{},expeditionCargoByType:{}};
}
export function getV39ToolDefinitions() {
  return getV39ConsumableDefinitions();
}
export function isV39ToolUnlocked(faction,item) {
  return !item.研究ID || Object.values(faction.research?.progress?.completedByCategoryLevel || {})
    .flatMap(levels=>Object.values(levels || {}).flat()).includes(item.研究ID);
}
function updateUnit(state,playerId,unit) {
  return {...state,players:state.players.map(player=>player.id!==playerId?player:{...player,factionState:{...player.factionState,
    units:player.factionState.units.map(row=>row.id===unit.id?unit:row)}})};
}
function actor(state,playerId,unitId) {
  const player=state.players.find(row=>row.id===playerId),unit=player?.factionState.units.find(row=>row.id===unitId);
  if(!alive(unit) || state.timeline?.phase!=="player" || state.activePlayerId!==playerId
    || (unit.worldId || "surface")!==(state.activeWorldId || "surface") || unit.waitTurnNumber===state.timeline.turnNumber) return null;
  return {player,unit,turn:state.timeline.turnNumber};
}
export function useV39ExpeditionTool(state,playerId,unitId,name,map=window.__v39FieldRuntime?.mapData,target=null) {
  return useV39Consumable(state,playerId,unitId,name,map,target);
}
export function advanceV39ExpeditionTools(state,turn) {
  return {...state,players:state.players.map(player=>({...player,factionState:{...player.factionState,units:player.factionState.units.map(unit=>{
    const effect=unit.toolRecovery;
    if(!effect||effect.remainingTurns<=0||effect.lastProcessedTurn>=turn)return unit;
    if(!alive(unit))return {...unit,toolRecovery:null};
    const hp=Math.min(count(unit.maxHp),count(unit.hp ?? unit.currentHp)+Math.floor(count(effect.amount)*v39HazardRecoveryFromState(state,unit)));
    return {...unit,hp,currentHp:hp,toolRecovery:{...effect,remainingTurns:effect.remainingTurns-1,lastProcessedTurn:turn}};
  })}}))};
}
export function inspectV39ExpeditionReplenishment(state,playerId,unitId,map,name) {
  const context=actor(state,playerId,unitId),item=getV39ToolDefinitions().find(row=>row.名前===name);
  if(!context || !item)return {ok:false,reason:"補充できません"};
  const {unit,player}=context,faction=player.factionState;
  const desired=getV39ToolLoadout(unit).find(row=>row.name===name);
  if(!desired)return {ok:false,reason:"携帯設定の使用可能な道具枠に登録してください"};
  const settlement=(unit.worldId||"surface")==="surface" && faction.settlements.find(row=>isV39UnitInsideSettlement(unit,row));
  const rest=map?.caveSites?.find(site=>site.discovered&&!site.wall&&site.x===unit.x&&site.y===unit.y);
  const restFacility=(unit.worldId||"surface")==="surface" && state.territoryOwnerByTile?.[`${unit.x},${unit.y}`]===playerId
    && (state.facilitiesByTile?.[`${unit.x},${unit.y}`] || []).includes("休憩所");
  if(!settlement&&!rest&&!restFacility)return {ok:false,reason:"自軍拠点・休憩所・発見済み群生地で補充できます"};
  const carried=unit.expeditionCargoByType || {},local=settlement?.toolStockByType || {};
  const squad=faction.squads?.find(row=>row.unitIds?.includes(unitId));
  const individual=squad?.id==='solo'||!!unit.transportAssignment;
  const cargo=individual?squad?.cargoByUnitId?.[unitId]:squad?.cargo;
  // 製造と補充を分離する。施設なしで素材から完成品を無償生成しない。
  const material=name;
  const gatheredStock=count(cargo?.resourcesByType?.[material]);
  const missing=Math.max(0,Math.min(count(item.携帯上限),desired.count)-count(unit.toolStockByType?.[name]));
  const amount=Math.min(missing,count(carried[material])+count(local[material])+gatheredStock);
  if(amount<=0)return {ok:false,reason:"材料在庫なし、または携帯上限です"};
  return {ok:true,unit,player,faction,settlement,squad,individual,cargo,amount,material,gatheredStock};
}
export function replenishV39ExpeditionTools(state,playerId,unitId,map,name) {
  const check=inspectV39ExpeditionReplenishment(state,playerId,unitId,map,name);
  if(!check.ok)return {...check,state};
  const {unit,faction,settlement,squad,individual,cargo,amount,material,gatheredStock}=check;
  const carried={...unit.expeditionCargoByType},local={...settlement?.toolStockByType};
  const fromCarry=Math.min(amount,count(carried[material]));carried[material]=count(carried[material])-fromCarry;
  const fromLocal=Math.min(amount-fromCarry,count(local[material]));local[material]=count(local[material])-fromLocal;
  const changed={...unit,expeditionCargoByType:carried,toolStockByType:{...unit.toolStockByType,[name]:count(unit.toolStockByType?.[name])+amount}};
  let nextFaction={...faction,units:faction.units.map(row=>row.id===unitId?changed:row)};
  const fromGathered=amount-fromCarry-fromLocal;
  if(fromGathered>0){
    const remainingCargo={...cargo,resourcesByType:{...cargo.resourcesByType,[material]:gatheredStock-fromGathered}};
    nextFaction={...nextFaction,squads:faction.squads.map(row=>row.id!==squad.id?row:individual?{...row,cargoByUnitId:{...row.cargoByUnitId,[unitId]:remainingCargo}}:{...row,cargo:remainingCargo})};
  }
  if(settlement)nextFaction=replaceFactionSettlement(nextFaction,{...settlement,toolStockByType:local},{ownerPlayerId:playerId,select:false});
  return {ok:true,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:nextFaction}:row)},message:`${name}を${amount}個補充しました`};
}
export function inspectV39ExpeditionGather(state,playerId,unitId,map,siteId) {
  const context=actor(state,playerId,unitId),site=map?.caveSites?.find(row=>row.id===siteId);
  if(!context||!site?.discovered||!['herb','mushroom'].includes(site.kind)||getHexDistance(context.unit,site)>1)return {ok:false,reason:"発見済み群生地の周囲1マスから採取できます"};
  const {unit,turn}=context,ap=count(unit.ap ?? unit.currentAp);
  const remaining=site.toolHarvestRemaining ?? defaults.gather.最大残量;
  if(ap<defaults.gather.AP消費||remaining<1)return {ok:false,reason:"AP不足または採取分の再生待ちです"};
  const cargo=unit.expeditionCargoByType || {},name=site.kind==='herb'?'薬草':'キノコ';
  const load=Object.values(cargo).reduce((sum,value)=>sum+count(value),0)+Object.values(unit.toolStockByType||{}).reduce((sum,value)=>sum+count(value),0);
  if(load+defaults.gather.採取量>resolveV39UnitCargoCapacity(unit,state))return {ok:false,reason:"携帯容量が不足しています"};
  return {ok:true,unit,turn,ap,remaining,name};
}
export function gatherV39ExpeditionHerbs(state,playerId,unitId,map,siteId) {
  const check=inspectV39ExpeditionGather(state,playerId,unitId,map,siteId);
  if(!check.ok)return {...check,state};
  const {unit,turn,ap,remaining,name}=check;
  const cargo={...unit.expeditionCargoByType};
  cargo[name]=count(cargo[name])+defaults.gather.採取量;
  return {ok:true,state:updateUnit(state,playerId,{...unit,expeditionCargoByType:cargo,ap:ap-defaults.gather.AP消費,currentAp:ap-defaults.gather.AP消費,lastActionTurn:turn}),
    map:{...map,caveSites:map.caveSites.map(row=>row.id===siteId?{...row,toolHarvestRemaining:remaining-1,toolHarvestTurn:row.toolHarvestTurn??turn}:row)},message:`${name}を採取しました`};
}
export function advanceV39ToolSites(map,turn) {
  if(!map?.caveSites)return map;
  return {...map,caveSites:map.caveSites.map(site=>{
    if(!['herb','mushroom'].includes(site.kind))return site;
    const elapsed=turn-(site.toolHarvestTurn??turn),cycles=Math.max(0,Math.floor(elapsed/defaults.gather.採取周期));
    return {...site,toolHarvestTurn:cycles>0?(site.toolHarvestTurn??turn)+cycles*defaults.gather.採取周期:site.toolHarvestTurn??turn,
      toolHarvestRemaining:Math.min(defaults.gather.最大残量,(site.toolHarvestRemaining??defaults.gather.最大残量)+cycles*defaults.gather.採取量)};
  })};
}
export function inspectV39ExpeditionDeposit(state,playerId,unitId) {
  const context=actor(state,playerId,unitId);
  if(!context||(context.unit.worldId||"surface")!=="surface")return {ok:false,reason:"自軍拠点へ戻ってください"};
  const {unit,player}=context,settlement=player.factionState.settlements.find(row=>isV39UnitInsideSettlement(unit,row));
  if(!settlement)return {ok:false,reason:"拠点の占有マス内で荷下ろしできます"};
  return {ok:true,unit,player,settlement};
}
export function depositV39ExpeditionCargo(state,playerId,unitId,includeTools=false) {
  const check=inspectV39ExpeditionDeposit(state,playerId,unitId);
  if(!check.ok)return {...check,state};
  const {unit,settlement}=check;
  const stock={...settlement.toolStockByType};
  for(const [name,amount] of Object.entries(unit.expeditionCargoByType||{}))stock[name]=count(stock[name])+count(amount);
  if(includeTools)for(const [name,amount] of Object.entries(unit.toolStockByType || {}))stock[name]=count(stock[name])+count(amount);
  const next=updateUnit(state,playerId,{...unit,expeditionCargoByType:{},...(includeTools?{toolStockByType:{}}:{})}),faction=next.players.find(row=>row.id===playerId).factionState;
  return {ok:true,state:{...next,players:next.players.map(row=>row.id===playerId?{...row,factionState:replaceFactionSettlement(faction,{...settlement,toolStockByType:stock},{ownerPlayerId:playerId,select:false})}:row)},message:"採取した道具素材を拠点へ預けました"};
}
