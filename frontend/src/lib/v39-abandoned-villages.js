import rules from '../../../config/v39-npc-defense.json';
import {getHexDistance} from './hex-grid.js';
import {getSelectedSettlement,replaceFactionSettlement} from './settlement-state.js';
import {normalizeV39Village} from './v39-economy-rules.js';

export function markV39AbandonedVillage(village,turn){
  if(village.abandoned||village.incidentTest)return village;
  const depleted=village.population!=null&&Number.isFinite(Number(village.population))&&Number(village.population)<=0;
  if(!depleted)return village;
  return {...village,abandoned:true,abandonedAtTurn:turn,formerPopulation:village.population,population:0,
    originalName:village.originalName||village.name,name:`${village.originalName||village.name}（廃村）`,vassalPlayerId:'',defenseTraining:null,
    questsByPlayerId:Object.fromEntries(Object.entries(village.questsByPlayerId||{}).map(([id,quest])=>[id,{...quest,completed:true,failed:true}])),
    questLogByPlayerId:Object.fromEntries(Object.entries(village.questLogByPlayerId||{}).map(([id,records])=>[id,Object.fromEntries(Object.entries(records).map(([key,quest])=>[key,{...quest,completed:true,failed:true}]))]))};
}
export function resettleV39AbandonedVillage(state,playerId,villageId){
  const village=state.neutralVillages.find(row=>row.id===villageId),player=state.players.find(row=>row.id===playerId);
  const base=getSelectedSettlement(player?.factionState),count=rules.resettlementPopulation;
  const fail=reason=>({ok:false,state,reason});
  if(state.activeWorldId!=='surface'||!village?.abandoned)return fail('地上の廃村を選択してください');
  if(!base?.placed||base.population<count)return fail(`選択拠点に再入植する住民${count}人が必要です`);
  if(!player.factionState.units.some(unit=>Number(unit.hp??unit.currentHp)>0&&(unit.worldId||'surface')==='surface'&&getHexDistance(unit,village)<=1))return fail('廃村へ生存ユニットを向かわせてください');
  const keys=village.territoryTileKeys||[`${village.x},${village.y}`];
  if(keys.some(key=>state.territoryOwnerByTile[key]&&![village.id,playerId].includes(state.territoryOwnerByTile[key])))return fail('他勢力が領有している廃村です');
  const populationByRace={...base.populationByRace};let remaining=count,people={};
  for(const [race,value] of Object.entries(populationByRace)){const moved=Math.min(remaining,Number(value)||0);populationByRace[race]=value-moved;if(moved)people[race]=moved;remaining-=moved;}
  if(remaining>0)return fail('拠点の人口内訳が不足しています');
  const id=`resettled:${village.id}`;
  const town=normalizeV39Village({...village,id,settlementId:id,name:village.originalName||village.name,type:'村',placed:true,
    abandoned:false,neutral:false,ownerPlayerId:playerId,population:count,populationByRace:people,territoryTileKeys:keys,
    defenseUnits:[],resettledTurn:state.timeline.turnNumber},player.race);
  let faction=replaceFactionSettlement(player.factionState,{...base,population:base.population-count,populationByRace},{ownerPlayerId:playerId});
  faction=replaceFactionSettlement(faction,town,{ownerPlayerId:playerId});
  const owner={...state.territoryOwnerByTile},territory={...state.territoryStateByTile};
  for(const key of keys){owner[key]=playerId;territory[key]={status:'領土',settlementId:id,hp:100,maxHp:100};}
  return {ok:true,message:`${town.name}へ${count}人が再入植しました`,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:faction}:row),
    neutralVillages:state.neutralVillages.filter(row=>row.id!==village.id),settlements:state.settlements.map(row=>row.id===village.id?town:row),territoryOwnerByTile:owner,territoryStateByTile:territory}};
}
