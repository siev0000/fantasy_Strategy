import defaults from "../../../config/v39-expedition-defaults.json";
import {v39HazardRecoveryMultiplier} from './v39-hazard-zones.js';
import {getGameDataRows} from "./game-data-registry.js";
import {getFactionSettlementById,replaceFactionSettlement} from "./settlement-state.js";
import {getHexDistance} from "./hex-grid.js";
import {changeV39Purification} from "./v39-purification-rules.js";
import {V39_CONSUMABLE_BALANCE as balance,V39_CAVE_BALANCE} from "./v39-gameplay-balance.js";
const n=value=>Math.max(0,Number(value)||0),world=unit=>unit.worldId || 'surface';
export function getV39ConsumableDefinitions(){return getGameDataRows('道具').length?getGameDataRows('道具'):defaults.items;}
export function resolveV39ToolSlots(unit) {
  const body=unit.equipment?.find(item=>item.slot==='体');
  if(!body)return 0;
  const row=getGameDataRows('装備').find(row=>row.装備名===(body.source?.装備名 || body.name));
  return Math.min(balance.maximumSlots,n(row?.道具枠 ?? body.source?.道具枠));
}
export function getV39ToolLoadout(unit) {
  const definitions=getV39ConsumableDefinitions();
  const owned=definitions.filter(item=>n(unit.toolStockByType?.[item.名前])>0).map(item=>item.名前);
  const raw=unit.defaultToolLoadout || [...new Set([...owned,...balance.defaultToolPriority])].map(name=>({name,count:n(definitions.find(item=>item.名前===name)?.携帯上限)}));
  const names=new Set();
  return raw.filter(row=>row?.name&&!names.has(row.name)&&!!names.add(row.name)).slice(0,resolveV39ToolSlots(unit));
}

export function supplyV39DefaultTools(faction,settlementId,rawUnit) {
  const village=getFactionSettlementById(faction,settlementId);
  const loadout=getV39ToolLoadout(rawUnit),unit={...rawUnit,defaultToolLoadout:rawUnit.defaultToolLoadout || loadout,
    toolStockByType:{...rawUnit.toolStockByType}},stock={...village?.toolStockByType};
  if(!village)return {faction,unit};
  for(const row of loadout) {
    const take=Math.min(Math.max(0,row.count-n(unit.toolStockByType[row.name])),n(stock[row.name]));
    if(take>0){stock[row.name]-=take;unit.toolStockByType[row.name]=n(unit.toolStockByType[row.name])+take;}
  }
  return {unit,faction:replaceFactionSettlement(faction,{...village,toolStockByType:stock},{ownerPlayerId:village.ownerPlayerId,select:false})};
}
export function setV39ToolLoadout(state,playerId,unitId,loadout) {
  const player=state.players.find(row=>row.id===playerId),unit=player?.factionState.units.find(row=>row.id===unitId);
  const fail=reason=>({ok:false,state,reason});
  if(!unit||playerId!==state.activePlayerId||state.timeline.phase!=='player'||n(unit.hp ?? unit.currentHp)<=0)return fail('操作中の生存ユニットを選んでください');
  const defs=getV39ConsumableDefinitions();
  if(loadout.length>resolveV39ToolSlots(unit)||new Set(loadout.map(row=>row.name)).size!==loadout.length)return fail('道具枠数または種類の重複を確認してください');
  if(loadout.some(row=>!defs.some(item=>item.名前===row.name)||!Number.isInteger(row.count)||row.count<1||row.count>n(defs.find(item=>item.名前===row.name)?.携帯上限)))return fail('道具の種類と携帯上限を確認してください');
  return {ok:true,state:{...state,players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:{...row.factionState,
    units:row.factionState.units.map(row=>row.id===unitId?{...row,defaultToolLoadout:loadout.map(row=>({...row}))}:row)}})}};
}
export function resolveV39DrugResearchLevel(faction) {
  const completed=new Set(Object.values(faction.research?.progress?.completedByCategoryLevel || {}).flatMap(levels=>Object.values(levels || {}).flat()));
  const healing=getGameDataRows('研究').filter(row=>completed.has(row.ID)).reduce((sum,row)=>sum+n(row.薬即時回復),0);
  return healing/balance.drugHealingPerLevel;
}
export function parseV39ToolMaterials(value) {
  if(!String(value || '').trim())return {};
  const result={};
  for(const token of String(value).split('/')) {
    const index=token.lastIndexOf('_'),name=token.slice(0,index),count=Number(token.slice(index+1));
    if(index<1||!Number.isInteger(count)||count<1)return null;
    result[name]=(result[name] || 0)+count;
  }
  return result;
}
function completedFacility(village,name) {
  return Object.entries(village.tileFacilityMap || {}).some(([key,names])=>names.includes(name)
    &&village.facilityStateByTile?.[key]?.[name]?.status!=='損壊'&&(village.facilityStateByTile?.[key]?.[name]?.hp ?? 1)>0)
    || !(Object.keys(village.tileFacilityMap || {}).length) && village.buildings?.includes(name);
}
export function inspectV39ToolProduction(state,playerId,unitId,itemName) {
  const player=state.players.find(row=>row.id===playerId),unit=player?.factionState.units.find(row=>row.id===unitId);
  const village=player?.factionState.settlements?.find(row=>row.placed&&world(unit || {})==='surface'&&(unit?.x===row.x&&unit?.y===row.y||row.territoryResidentialCenterMap?.[`${unit?.x},${unit?.y}`]===`${row.x},${row.y}`));
  const item=getV39ConsumableDefinitions().find(row=>row.名前===itemName),reasons=[];
  if(!unit||n(unit.hp ?? unit.currentHp)<=0||state.activePlayerId!==playerId||state.timeline.phase!=='player'||world(unit)!==(state.activeWorldId || 'surface'))reasons.push('操作中の生存ユニットが必要');
  if(!village)reasons.push('自軍拠点内にいる担当者が必要');
  if(!item?.製造施設)reasons.push('製造対象ではありません');
  else if(!village||!completedFacility(village,item.製造施設))reasons.push(`${item.製造施設}の完成が必要`);
  if(item?.効果==='浄化'&&n(unit?.skillLevels?.信仰 ?? unit?.status?.信仰 ?? unit?.信仰)<balance.holyWaterRequiredFaith)reasons.push(`信仰${balance.holyWaterRequiredFaith}以上の担当者が必要（暫定）`);
  if(village?.toolProductionQueue?.some(row=>row.facilityName===item?.製造施設))reasons.push('この製造施設は稼働中');
  const materials=parseV39ToolMaterials(item?.必要素材);
  if(!materials)reasons.push('必要素材の記法が不正');
  const stocks=['toolStockByType','materialStockByType','specialResourceStockByType'];
  for(const [name,count] of Object.entries(materials || {}))if(stocks.reduce((sum,field)=>sum+n(village?.[field]?.[name]),0)<count)reasons.push(`${name} ${count}不足`);
  const completed=new Set(Object.values(player?.factionState.research?.progress?.completedByCategoryLevel || {}).flatMap(levels=>Object.values(levels || {}).flat()));
  const productionBonus=getGameDataRows('研究').filter(row=>completed.has(row.ID)).reduce((sum,row)=>sum+n(row.薬生成量),0);
  const amount=n(item?.基礎生成量)+(item?.効果==='回復'?Math.min(balance.maximumProductionBonus,productionBonus):0);
  return {available:!reasons.length,reasons,village,item,materials,amount,stocks,unit};
}
export function startV39ToolProduction(state,playerId,unitId,itemName) {
  const check=inspectV39ToolProduction(state,playerId,unitId,itemName);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const village={...check.village};
  const materialsPaidByField={};
  for(const field of check.stocks)village[field]={...village[field]};
  for(const [name,total] of Object.entries(check.materials)) {
    let left=total;
    for(const field of check.stocks){
      const taken=Math.min(left,n(village[field][name]));
      if(taken>0){materialsPaidByField[field] ||= {};materialsPaidByField[field][name]=taken;}
      village[field][name]=n(village[field][name])-taken;left-=taken;
    }
  }
  village.toolProductionQueue=[...(village.toolProductionQueue || []),{name:itemName,facilityName:check.item.製造施設,unitId,
    materialsPaid:{...check.materials},
    materialsPaidByField,
    remainingTurns:Math.max(1,n(check.item.製造ターン)),amount:check.amount,lastProcessedTurn:state.timeline.turnNumber}];
  return {ok:true,state:{...state,players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:replaceFactionSettlement(row.factionState,village,{ownerPlayerId:playerId,select:false})})},message:`${itemName}の製造を予約しました ⌛${Math.max(1,n(check.item.製造ターン))}`};
}

export function cancelV39ToolProduction(state,playerId,settlementId,itemName) {
  const player=state.players.find(row=>row.id===playerId),village=getFactionSettlementById(player?.factionState,settlementId);
  const entry=village?.toolProductionQueue?.find(row=>row.name===itemName);
  if(!entry||state.activePlayerId!==playerId||state.timeline.phase!=='player')return {ok:false,state,reason:'製造予約がありません'};
  const next={...village,toolProductionQueue:village.toolProductionQueue.filter(row=>row!==entry)};
  // 新規予約は引き落とした保管先へ戻す。旧予約だけ道具在庫へ返却する。
  const paid=entry.materialsPaidByField || {toolStockByType:entry.materialsPaid || {}};
  for(const field of ['toolStockByType','materialStockByType','specialResourceStockByType']) {
    if(!paid[field])continue;
    next[field]={...village[field]};
    for(const [name,amount] of Object.entries(paid[field]))next[field][name]=n(next[field][name])+amount;
  }
  return {ok:true,state:{...state,players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:replaceFactionSettlement(row.factionState,next,{ownerPlayerId:playerId,select:false})})},message:`${itemName}の製造を取り消し、予約素材を返却しました`};
}
export function advanceV39ToolProduction(state,turn) {
  return {...state,players:state.players.map(player=>{
    let faction=player.factionState;
    for(const original of faction.settlements || []) {
      if(!original.toolProductionQueue?.length)continue;
      const stock={...original.toolStockByType},queue=[];
      for(const raw of original.toolProductionQueue) {
        if(raw.lastProcessedTurn>=turn){queue.push(raw);continue;}
        const unit=faction.units.find(row=>row.id===raw.unitId);
        const present=unit&&world(unit)==='surface'&&n(unit.hp ?? unit.currentHp)>0&&(unit.x===original.x&&unit.y===original.y||original.territoryResidentialCenterMap?.[`${unit.x},${unit.y}`]===`${original.x},${original.y}`);
        if(!present||!completedFacility(original,raw.facilityName)){queue.push({...raw,lastProcessedTurn:turn,status:'担当者・施設待ち'});continue;}
        const remainingTurns=raw.remainingTurns-1;
        if(remainingTurns>0)queue.push({...raw,remainingTurns,lastProcessedTurn:turn,status:'製造中'});
        else stock[raw.name]=n(stock[raw.name])+raw.amount;
      }
      faction=replaceFactionSettlement(faction,{...original,toolStockByType:stock,toolProductionQueue:queue},{ownerPlayerId:player.id,select:false});
    }
    return {...player,factionState:faction};
  })};
}
export function useV39Consumable(state,playerId,unitId,name,map,target=null) {
  const player=state.players.find(row=>row.id===playerId),unit=player?.factionState.units.find(row=>row.id===unitId),item=getV39ConsumableDefinitions().find(row=>row.名前===name);
  const fail=reason=>({ok:false,state,reason});
  if(!unit||!item||n(unit.hp ?? unit.currentHp)<=0||state.activePlayerId!==playerId||state.timeline.phase!=='player'||world(unit)!==(state.activeWorldId || 'surface')||unit.waitTurnNumber===state.timeline.turnNumber)return fail('道具を使えるユニットを選んでください');
  if(!getV39ToolLoadout(unit).some(row=>row.name===name)||n(unit.toolStockByType?.[name])<1)return fail('使用可能な道具枠に携帯在庫がありません');
  const turn=state.timeline.turnNumber,ap=n(unit.ap ?? unit.currentAp);
  if(ap<n(item.AP消費)||unit.toolUsedTurnByName?.[name]===turn)return fail('AP不足またはこのターン使用済みです');
  const nextMap=map?{...map}:null;
  if(item.効果==='霧') {
    const range=Math.max(1,Math.ceil(n(item.射程)/10))*(map?.isUnderground?V39_CAVE_BALANCE.attackRangeMultiplier:1);
    if(!target||!Number.isInteger(target.x)||!Number.isInteger(target.y)||!map?.grid?.[target.y]?.[target.x]||['岩壁','壁'].includes(map.grid[target.y][target.x])||getHexDistance(unit,target)>range)return fail('射程内の対象マスを選択してください');
    nextMap.fogMap=(map.fogMap || []).map(row=>row?row.slice():[]);nextMap.fogMap[target.y] ||= [];
    // 死の霧を普通の霧へ上書きして浄化しない。
    if(nextMap.fogMap[target.y][target.x]?.kind!=='death')nextMap.fogMap[target.y][target.x]={kind:'normal',source:'smoke',expiresAtTurn:turn+Math.max(1,n(item.持続ターン))};
  }
  if(item.効果==='浄化') {
    if(!map)return fail('マップがありません');
    nextMap.purificationByTile={...map.purificationByTile};changeV39Purification(nextMap,`${unit.x},${unit.y}`,balance.holyWaterPurification);
  }
  const hp=Math.min(n(unit.maxHp),n(unit.hp ?? unit.currentHp)+Math.floor((n(item.即時回復)+(n(item.即時回復)>0?resolveV39DrugResearchLevel(player.factionState)*balance.drugHealingPerLevel:0))*v39HazardRecoveryMultiplier(map,unit,turn)));
  const changed={...unit,hp,currentHp:hp,ap:ap-n(item.AP消費),currentAp:ap-n(item.AP消費),lastActionTurn:turn,
    toolStockByType:{...unit.toolStockByType,[name]:n(unit.toolStockByType?.[name])-1},toolUsedTurnByName:{...unit.toolUsedTurnByName,[name]:turn}};
  if(n(item.毎ターン回復)>0)changed.toolRecovery={name,amount:n(item.毎ターン回復),remainingTurns:n(item.持続ターン),lastProcessedTurn:turn};
  return {ok:true,map:nextMap,state:{...state,players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:{...row.factionState,units:row.factionState.units.map(row=>row.id===unitId?changed:row)}})},message:`${name}を使用しました${item.効果==='浄化'?` / 浄化+${balance.holyWaterPurification}`:''}`};
}
