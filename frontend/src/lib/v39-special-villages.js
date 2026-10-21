import settings from '../../../config/v39-special-villages.json';
import {resolvePopulationClassDefinition} from './v39-population-economy.js';
import {getSelectedSettlement,replaceFactionSettlement} from './settlement-state.js';
import {getGameDataRows} from './game-data-registry.js';
import {buildV39UnitEntity,buildV39ClassEquipment} from './v39-unit-creation-rules.js';
import {resolveUnitCreateMode} from '../composables/militaryUnitUtils.js';
import {resolveV39SummonPlacements} from './v39-summon-rules.js';
import {replaceIncidentVillage} from './v39-village-incidents.js';
import {getHexDistance} from './hex-grid.js';
import {isV39VillageHostileToPlayer} from './v39-village-hostility.js';
import {mergeV39Cargo} from './v39-logistics-state.js';
import {deriveV39CharacterFromRaceClass,applyV39DerivedCharacterData} from '../v39/unit/v39-character-derived-rules.js';
import {chargeV39Negotiation,V39_NEGOTIATION_AP} from './v39-negotiation-rules.js';
import {resolveV39UnitExpDisplay,resolveV39UnitTotalExpForLevel,resolveV39UnitExpNeed,resolveV39UnitRaceCategory,V39_UNIT_LEVEL_CAP} from './v39-unit-experience.js';

const alive=unit=>Number(unit?.hp??unit?.currentHp)>0&&unit.state!=='死亡';
const integer=value=>Math.max(0,Math.floor(Number(value)||0));

export function resolveV39SpecialVillage(village,config=settings){
  const race=resolvePopulationClassDefinition(village?.combatRaceName||village?.race)?.名前;
  return config.enabled&&village?.neutral===true&&config.races.includes(race)?{...config,race}:null;
}

export function getV39OfferingPopulationSources(player){
  return (player?.factionState?.settlements||[]).filter(base=>base.placed).map(base=>({
    id:base.settlementId||base.id,name:base.name,
    races:Object.entries(base.populationByRace||{}).filter(([race,count])=>integer(count)>0
      &&resolvePopulationClassDefinition(race)?.増加条件==='食事').map(([race,count])=>({race,count:integer(count)}))
  }));
}

export function inspectV39SpecialVillageReincarnation(state,playerId,villageId,request={}){
  const player=state.players?.find(p=>p.id===playerId),village=state.neutralVillages?.find(v=>v.id===villageId);
  const config=resolveV39SpecialVillage(village),rule=config?.reincarnation;
  const actor=player?.factionState?.units?.find(u=>u.id===(request.unitId||player.factionState.selectedUnitId));
  const sources=getV39OfferingPopulationSources(player),settlementId=request.settlementId||sources[0]?.id;
  const source=sources.find(s=>s.id===settlementId),race=request.race||source?.races[0]?.race;
  const base=player?.factionState.settlements.find(b=>(b.settlementId||b.id)===settlementId),cost=integer(rule?.people);
  const derived=actor?deriveV39CharacterFromRaceClass(actor):null,reasons=[];
  if(!rule?.enabled)reasons.push('転生を交渉できる特殊村ではありません');
  if(state.activePlayerId!==playerId||state.timeline?.phase!=='player'||(state.activeWorldId||'surface')!=='surface')reasons.push('地上の自分の操作ターンに実行してください');
  if(!actor||!alive(actor)||(actor.worldId||'surface')!=='surface'||actor.pendingWorldExit||getHexDistance(actor,village||{})>1)reasons.push('村の中心から1マス以内に生存中の交渉役が必要です');
  if(actor?.summon||actor?.specialVillageOrigin||actor?.animalArmy||String(actor?.unitType||'').includes('軍隊')||['army','elite_army','territory_guard'].includes(actor?.combatProfile?.mode)||Number(actor?.combatProfile?.memberCount)>1)reasons.push('転生できるのは交渉者本人の個体です。軍隊・召喚体・契約軍隊は対象外です');
  if(player?.factionState.combatRuntime?.pendingActionsByUnitId?.[actor?.id])reasons.push('予約中の行動を解決してから転生してください');
  if(village?.abandoned||isV39VillageHostileToPlayer(village,playerId)||village?.raidState?.active)reasons.push('廃村・敵対中の村とは転生を交渉できません');
  if(rule?.minimumRelation!=null&&Number(village?.relationsByPlayerId?.[playerId]||0)<Number(rule.minimumRelation))reasons.push(`友好度${rule.minimumRelation}が必要です`);
  if(!base?.placed||!source?.races.some(row=>row.race===race))reasons.push('生贄にできる生体の住民がいる自拠点を選択してください');
  if(integer(base?.populationByRace?.[race])<cost||integer(base?.population)-cost<integer(config?.minimumRemainingPopulation))reasons.push(`転生の生贄${cost}人と最低残人口${integer(config?.minimumRemainingPopulation)}人が必要です`);
  if(!derived?.ok)reasons.push('交渉者の種族・職業Lvを取得できません');
  const levels={};
  const add=(name,value)=>{const key=resolvePopulationClassDefinition(name)?.名前||name;if(key&&integer(value))levels[key]=(levels[key]||0)+integer(value);};
  if(derived?.ok){
    add(derived.race,derived.raceLevels);add(derived.className,derived.classLevels);
    for(const [name,lv] of Object.entries(derived.prerequisiteClassLevels||{}))add(name,lv);
    if(derived.strongAnimalClassName)add(derived.strongAnimalClassName,derived.strongAnimalClassLevel);
  }
  const currentRace=resolvePopulationClassDefinition(derived?.race)?.名前||derived?.race;
  const targetRace=config?.race,targetLevel=Math.max(integer(rule?.raceLevel),integer(levels[targetRace]));
  const addedLevel=Math.max(0,targetLevel-integer(levels[targetRace])),level=integer(actor?.level)+addedLevel;
  if(targetRace===currentRace&&!addedLevel)reasons.push('すでに対応種族を必要Lv以上取得し、主要種族にしています');
  if(level>V39_UNIT_LEVEL_CAP)reasons.push(`転生後の総合Lvが上限${V39_UNIT_LEVEL_CAP}を超えます`);
  const charge=actor&&!reasons.length?chargeV39Negotiation(state,playerId,actor.id,villageId,{action:'reincarnation',unitId:actor.id,targetRace,settlementId,race}):null;
  if(charge&&!charge.ok)reasons.push(charge.reason);
  return {available:!reasons.length,reasons,player,village,config,actor,derived,sources,source,settlementId,race,base,cost,
    levels,currentRace,targetRace,targetLevel,addedLevel,level,charge,apCost:V39_NEGOTIATION_AP};
}

export function reincarnateV39VillageNegotiator(state,playerId,villageId,request={}){
  const check=inspectV39SpecialVillageReincarnation(state,playerId,villageId,request);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const {actor,derived,base,race,cost,levels,targetRace,targetLevel,level,charge}=check;
  const paidPlayer=charge.state.players.find(p=>p.id===playerId),paidActor=paidPlayer.factionState.units.find(u=>u.id===actor.id);
  levels[targetRace]=targetLevel;
  const className=derived.className,prerequisiteClassLevels=Object.fromEntries(Object.entries(levels).filter(([name])=>name!==targetRace&&name!==className));
  const progress=resolveV39UnitExpDisplay(actor),category=resolveV39UnitRaceCategory({race:targetRace});
  const exp=Math.floor(resolveV39UnitExpNeed(level,category)*Math.min(.999999,Math.max(0,Number(progress.exp)||0)/Math.max(1,Number(progress.need)||1)));
  const totalExp=resolveV39UnitTotalExpForLevel(level,category)+exp,turn=integer(state.timeline?.turnNumber);
  let updated=applyV39DerivedCharacterData({...paidActor,race:targetRace,level,exp,totalExp,prerequisiteClassLevels,
    reincarnationGrowthStart:{level,raceLevels:targetLevel,classLevels:className===targetRace?0:integer(levels[className])},
    reincarnationInheritedSkillNames:[...new Set([...(actor.reincarnationInheritedSkillNames||[]),...(derived.acquiredSkillNames||[])])],
    reincarnationSecondClassName:derived.secondClassName||actor.reincarnationSecondClassName||'',
    reincarnationHistory:[...(actor.reincarnationHistory||[]),{villageId,turn,from:check.currentRace,to:targetRace,addedLevel:check.addedLevel,people:cost}],
    promotionGrowthStart:null,undeadGrowthStart:null,classGrowthStart:null,strongAnimalClassName:'',strongAnimalClassLevel:0,
    expPeakLevel:Math.max(integer(actor.expPeakLevel),level)});
  const hp=Math.max(1,Math.min(Number(actor.hp??actor.currentHp),Math.floor(updated.maxHp*Number(actor.hp??actor.currentHp)/Math.max(1,Number(actor.maxHp)||Number(derived.status?.HP)||1))));
  updated={...updated,hp,currentHp:hp,status:{...updated.status,exp,totalExp}};
  const populationByRace={...base.populationByRace,[race]:integer(base.populationByRace[race])-cost};
  const bank={...base,populationByRace,population:Object.values(populationByRace).reduce((sum,n)=>sum+integer(n),0)};
  const faction={...replaceFactionSettlement(paidPlayer.factionState,bank,{ownerPlayerId:playerId}),units:paidPlayer.factionState.units.map(u=>u.id===actor.id?updated:u)};
  return {ok:true,unit:updated,state:{...charge.state,players:charge.state.players.map(p=>p.id===playerId?{...p,factionState:faction}:p),
    settlements:(state.settlements||[]).map(b=>(b.settlementId||b.id)===(bank.settlementId||bank.id)?bank:b)},
    message:`${actor.name}が${targetRace}Lv${targetLevel}へ転生 / 主要種族を変更 / 生贄${cost}人・AP${check.apCost}`};
}

export function inspectV39SpecialVillageOffering(state,playerId,villageId,request={},map){
  const player=state.players?.find(row=>row.id===playerId),village=state.neutralVillages?.find(row=>row.id===villageId);
  const config=resolveV39SpecialVillage(village),faction=player?.factionState;
  const sources=getV39OfferingPopulationSources(player);
  const settlementId=request.settlementId||getSelectedSettlement(faction)?.settlementId||sources[0]?.id;
  const source=sources.find(row=>row.id===settlementId),race=request.race||source?.races[0]?.race;
  const base=faction?.settlements?.find(row=>(row.settlementId||row.id)===settlementId);
  const count=request.count===undefined?1:Number(request.count),turn=integer(state.timeline?.turnNumber);
  const previous=village?.offeringByPlayerId?.[playerId];
  const current=(faction?.units||[]).filter(unit=>unit.specialVillageOrigin?.villageId===villageId&&alive(unit));
  const activeCount=previous?.status==='active'?current.length:0;
  const addedCount=Math.max(0,count-activeCount);
  const cost=addedCount*integer(config?.peoplePerArmy),reasons=[];
  const actor=faction?.units?.find(unit=>unit.id===(request.unitId||faction.selectedUnitId));
  if(!config)reasons.push('奉納で軍隊が加入する特殊村ではありません');
  if(state.activePlayerId!==playerId||state.timeline?.phase!=='player'||(state.activeWorldId||'surface')!=='surface')reasons.push('地上の自分の操作ターンに実行してください');
  if(!actor||!alive(actor)||(actor.worldId||'surface')!=='surface'||actor.pendingWorldExit||getHexDistance(actor,village||{})>1)reasons.push('村の中心から1マス以内に生存中の交渉役が必要です');
  if(village?.abandoned||isV39VillageHostileToPlayer(village,playerId)||village?.raidState?.active)reasons.push('廃村・敵対中の村とは契約できません');
  if(!Number.isSafeInteger(count)||count<1||count>integer(config?.maxArmiesPerOffering))reasons.push(`加入数は1〜${integer(config?.maxArmiesPerOffering)}軍隊です`);
  if(previous?.status==='active'&&count<activeCount)reasons.push('契約数の削減は契約解除後に設定してください');
  if(previous?.status==='active'&&count===activeCount&&previous.settlementId===settlementId&&previous.race===race)reasons.push(`契約中です。次の維持費はT${previous.nextOfferingTurn}に自動奉納します`);
  if(previous?.status==='active'&&turn>=integer(previous.nextOfferingTurn))reasons.push('先にターン経過で既存契約の維持費を精算してください');
  if(previous?.status!=='active'&&current.length)reasons.push('契約外の軍隊がいます。ターン経過で帰還を処理してから再開してください');
  if(!base?.placed||!source?.races.some(row=>row.race===race))reasons.push('生贄にできる生体の住民がいる自拠点を選択してください');
  if(integer(base?.populationByRace?.[race])<cost||integer(base?.population)-cost<integer(config?.minimumRemainingPopulation))reasons.push(`生贄の人口が不足しています（必要${cost}人、最低残人口${integer(config?.minimumRemainingPopulation)}人）`);
  const classRow=getGameDataRows('クラス').find(row=>row.名前===village?.className);
  if(!classRow)reasons.push('加入軍隊の職業データがありません');
  const profile=resolveUnitCreateMode('army',config?.militaryLevel||1);
  const preview=config&&classRow?buildV39UnitEntity({id:'offering-preview',race:config.race,className:classRow.名前,
    level:config.armyLevel,unitType:profile.unitTypeLabel,combatProfile:profile,isMob:true,isNamed:false,equipment:buildV39ClassEquipment(classRow)}):null;
  const tiles=map&&preview&&village?resolveV39SummonPlacements(state,map,village,preview):[];
  if(tiles.length<addedCount)reasons.push(`村に隣接する配置可能マスが${addedCount}マス必要です`);
  return {available:!reasons.length,reasons,player,village,config,source,settlementId,race,base,count,addedCount,cost,turn,previous,preview,tiles,sources,current};
}

export function offerV39SpecialVillageSacrifice(state,playerId,villageId,request,map){
  const check=inspectV39SpecialVillageOffering(state,playerId,villageId,request,map);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const {player,village,config,base,race,count,addedCount,cost,turn,previous,preview,tiles}=check;
  const serial=integer(previous?.serial)+1;
  const reserves=(previous?.reserveUnits||[]).filter(alive);
  const units=Array.from({length:addedCount},(_,i)=>{
    const tile=tiles[i];
    const restored=reserves[i];
    return {...structuredClone(restored||preview),id:restored?.id||`offering-${village.id}-${playerId}-${serial}-${i}`,
      name:restored?.name||`${config.race}契約軍${serial}-${i+1}`,x:tile.x,y:tile.y,position:[tile.x,tile.y],worldId:'surface',squadId:'solo',
      ap:0,currentAp:0,role:'特殊村から加入した軍隊',specialVillageOrigin:{villageId,offeringSerial:serial,joinedTurn:turn}};
  });
  const populationByRace={...base.populationByRace,[race]:integer(base.populationByRace[race])-cost};
  const paid={...base,populationByRace,population:Object.values(populationByRace).reduce((sum,n)=>sum+integer(n),0)};
  const cargoByUnitId=Object.fromEntries(units.filter(u=>previous?.reserveCargoByUnitId?.[u.id]).map(u=>[u.id,previous.reserveCargoByUnitId[u.id]]));
  const squads=(player.factionState.squads||[]).map(squad=>squad.id==='solo'?{...squad,unitIds:[...new Set([...(squad.unitIds||[]),...units.map(unit=>unit.id)])],cargoByUnitId:{...squad.cargoByUnitId,...cargoByUnitId}}:squad);
  if(!squads.some(squad=>squad.id==='solo'))squads.push({id:'solo',label:'単独',unitIds:units.map(unit=>unit.id),cargoByUnitId});
  const faction={...replaceFactionSettlement(player.factionState,paid,{ownerPlayerId:playerId}),units:[...player.factionState.units,...units],squads};
  const record={...previous,serial,status:'active',count,settlementId:check.settlementId,race,peoplePerArmy:integer(config.peoplePerArmy),intervalTurns:integer(config.offeringIntervalTurns),
    lastOfferingTurn:cost?turn:previous?.lastOfferingTurn,nextOfferingTurn:previous?.status==='active'?previous.nextOfferingTurn:turn+integer(config.offeringIntervalTurns),
    reserveUnits:reserves.slice(addedCount),reserveCargoByUnitId:Object.fromEntries(Object.entries(previous?.reserveCargoByUnitId||{}).filter(([id])=>!units.some(u=>u.id===id))),
    totalPeople:integer(previous?.totalPeople)+cost,totalArmies:integer(previous?.totalArmies)+addedCount,
    history:[...(previous?.history||[]),{turn,settlementId:check.settlementId,race,people:cost,unitIds:units.map(unit=>unit.id)}].slice(-20)};
  const next=replaceIncidentVillage({...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:faction}:row),
    settlements:(state.settlements||[]).map(row=>(row.settlementId||row.id)===(paid.settlementId||paid.id)?paid:row)},
    {...village,offeringByPlayerId:{...village.offeringByPlayerId,[playerId]:record}});
  return {ok:true,state:next,units,message:`${race}${cost}人を奉納 / 契約軍隊${count}駒（追加加入${addedCount}駒）。次の維持費はT${record.nextOfferingTurn}`};
}

// Recall is not death: preserve the same soldiers, equipment and personal cargo for resumption.
function recallContractUnits(player,villageId,contract){
  const faction=player.factionState,returned=faction.units.filter(unit=>unit.specialVillageOrigin?.villageId===villageId&&alive(unit));
  const ids=new Set(returned.map(unit=>unit.id)),reserveCargoByUnitId={...contract.reserveCargoByUnitId};
  const squads=(faction.squads||[]).map(squad=>{
    const unitIds=(squad.unitIds||[]).filter(id=>!ids.has(id)),cargoByUnitId={...squad.cargoByUnitId};
    for(const unit of returned)if(cargoByUnitId[unit.id]){reserveCargoByUnitId[unit.id]=mergeV39Cargo(reserveCargoByUnitId[unit.id],cargoByUnitId[unit.id]);delete cargoByUnitId[unit.id];}
    const last=returned.find(unit=>squad.unitIds?.includes(unit.id));
    if(!unitIds.length&&last)reserveCargoByUnitId[last.id]=mergeV39Cargo(reserveCargoByUnitId[last.id],squad.cargo);
    const next={...squad,unitIds,memberIds:(squad.memberIds||[]).filter(id=>!ids.has(id)),cargoByUnitId,...(!unitIds.length?{cargo:{resourcesByType:{},equipmentInventory:[]}}:{})};
    for(const key of ['leaderId','movementLeaderId'])if(ids.has(next[key]))next[key]=unitIds[0]||'';
    return next;
  });
  const combatRuntime={...faction.combatRuntime};
  for(const [key,value] of Object.entries(combatRuntime))if(key.endsWith('ByUnitId'))combatRuntime[key]=Object.fromEntries(Object.entries(value||{}).filter(([id])=>!ids.has(id)));
  const units=faction.units.filter(unit=>!ids.has(unit.id));
  const next={...faction,units,squads,combatRuntime,selectedUnitId:ids.has(faction.selectedUnitId)?units.find(alive)?.id||'':faction.selectedUnitId};
  for(const key of ['recruitInstructorByTile','recruitInstructorTransfers'])next[key]=Object.fromEntries(Object.entries(faction[key]||{}).filter(([,value])=>!ids.has(value?.unitId)));
  const reserveUnits=[...(contract.reserveUnits||[]),...returned.map(unit=>{
    if(unit.caveDuty?.cargo)reserveCargoByUnitId[unit.id]=mergeV39Cargo(reserveCargoByUnitId[unit.id],{resourcesByType:unit.caveDuty.cargo});
    const saved={...unit};delete saved.derivedData;
    return {...saved,squadId:'solo',ap:0,currentAp:0,pendingWorldExit:null,squadGather:null,autoTransport:null,tradeAssignment:null,
      transportAssignment:null,instructorAssignment:null,caveDuty:null,surveyTask:null,shield:null,barrier:null};
  })];
  return {player:{...player,factionState:next},contract:{...contract,status:'suspended',reserveUnits,reserveCargoByUnitId}};
}

export function suspendV39SpecialVillageContract(state,playerId,villageId){
  const village=state.neutralVillages?.find(v=>v.id===villageId),player=state.players?.find(p=>p.id===playerId),contract=village?.offeringByPlayerId?.[playerId];
  if(!player||contract?.status!=='active')return {ok:false,state,reason:'有効な契約がありません'};
  if(state.activePlayerId!==playerId||state.timeline?.phase!=='player')return {ok:false,state,reason:'自分の操作ターンに実行してください'};
  const result=recallContractUnits(player,villageId,contract);
  return {ok:true,message:'契約を停止し、契約軍隊が村へ帰還しました。再開は村で行えます。',state:replaceIncidentVillage({...state,players:state.players.map(p=>p.id===playerId?result.player:p)},
    {...village,offeringByPlayerId:{...village.offeringByPlayerId,[playerId]:result.contract}})};
}

export function advanceV39SpecialVillageContracts(state,turnNumber){
  if((state.activeWorldId||'surface')!=='surface'){
    const surface=state.explorationWorlds?.surface;
    if(!surface?.spatial)return {state,reports:[]};
    const result=advanceV39SpecialVillageContracts({...state,activeWorldId:'surface',neutralVillages:surface.spatial.neutralVillages||[],settlements:surface.spatial.settlements||[]},turnNumber);
    return {state:{...state,players:result.state.players,explorationWorlds:{...state.explorationWorlds,surface:{...surface,
      spatial:{...surface.spatial,neutralVillages:result.state.neutralVillages,settlements:result.state.settlements}}}},reports:result.reports};
  }
  const turn=integer(turnNumber),reports=[];let next=state;
  for(const source of state.neutralVillages||[])for(const playerId of Object.keys(source.offeringByPlayerId||{})){
    let village=next.neutralVillages.find(v=>v.id===source.id),contract=village.offeringByPlayerId[playerId];
    const player=next.players.find(p=>p.id===playerId);
    if(!player||integer(contract.lastProcessedTurn)>=turn)continue;
    const living=player.factionState.units.filter(u=>u.specialVillageOrigin?.villageId===village.id&&alive(u));
    if(contract.status!=='active'){
      if(living.length){
        const recalled=recallContractUnits(player,village.id,contract);
        next=replaceIncidentVillage({...next,players:next.players.map(p=>p.id===playerId?recalled.player:p)},
          {...village,offeringByPlayerId:{...village.offeringByPlayerId,[playerId]:{...recalled.contract,lastProcessedTurn:turn}}});
      }
      continue;
    }
    const due=turn>=integer(contract.nextOfferingTurn),base=player.factionState.settlements.find(b=>(b.settlementId||b.id)===contract.settlementId);
    const periods=due?1+Math.floor((turn-integer(contract.nextOfferingTurn))/Math.max(1,integer(contract.intervalTurns))):0;
    const cost=living.length*integer(contract.peoplePerArmy)*periods;
    const validVillage=!village.abandoned&&!isV39VillageHostileToPlayer(village,playerId)&&resolveV39SpecialVillage(village);
    const canPay=base?.placed&&integer(base.populationByRace?.[contract.race])>=cost&&integer(base.population)-cost>=integer(settings.minimumRemainingPopulation);
    if(!validVillage||(due&&cost&&!canPay)){
      const recalled=recallContractUnits(player,village.id,contract);contract={...recalled.contract,lastProcessedTurn:turn};
      next={...next,players:next.players.map(p=>p.id===playerId?recalled.player:p)};
      reports.push({playerId,type:'special-village-suspended',message:`${village.name}: ${validVillage?'奉納人口が不足':'契約先が敵対・消失'}のため契約停止。軍隊は帰還し、再開待ちです。`});
    }else{
      if(cost){
        const populationByRace={...base.populationByRace,[contract.race]:integer(base.populationByRace[contract.race])-cost};
        const paid={...base,populationByRace,population:Object.values(populationByRace).reduce((sum,n)=>sum+integer(n),0)};
        next={...next,players:next.players.map(p=>p.id===playerId?{...p,factionState:replaceFactionSettlement(p.factionState,paid,{ownerPlayerId:playerId})}:p),
          settlements:(next.settlements||[]).map(row=>(row.settlementId||row.id)===(paid.settlementId||paid.id)?paid:row)};
        reports.push({playerId,type:'special-village-maintained',message:`${village.name}: ${contract.race}${cost}人を自動奉納 / 軍隊${living.length}駒を維持`});
      }
      contract={...contract,lastProcessedTurn:turn,count:living.length,totalPeople:integer(contract.totalPeople)+cost,
        ...(due?{lastOfferingTurn:turn,nextOfferingTurn:integer(contract.nextOfferingTurn)+periods*Math.max(1,integer(contract.intervalTurns))}:{}),
        ...(!living.length?{status:'ended'}:{})};
    }
    next=replaceIncidentVillage(next,{...village,offeringByPlayerId:{...village.offeringByPlayerId,[playerId]:contract}});
  }
  return {state:next,reports};
}
