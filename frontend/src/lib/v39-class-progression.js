import {getGameDataRows} from "./game-data-registry.js";
import {parseV39ClassCondition,splitV39ClassCondition,isV39ProfessionClassRow} from "./v39-class-rules.js";
import {deriveV39CharacterFromRaceClass,applyV39DerivedCharacterData} from "../v39/unit/v39-character-derived-rules.js";
import {V39_CLASS_PROGRESSION_BALANCE} from "./v39-gameplay-balance.js";
import recruitment from "../../../config/v39-facility-recruitment-defaults.json";
const n=value=>Math.max(0,Math.floor(Number(value) || 0));
export function inspectV39ClassPromotion(state,playerId,unit,row) {
  const derived=deriveV39CharacterFromRaceClass(unit),reasons=[];
  const current=derived.classRow,prior={...derived.prerequisiteClassLevels,[unit.className]:derived.classLevels};
  const conditions=splitV39ClassCondition(row.条件クラス).map(value=>parseV39ClassCondition(value));
  const limit=n(current?.Tire ?? current?.Tier)>1
    ? recruitment.growthCaps[derived.raceRow?.種類]?.classLevels ?? V39_CLASS_PROGRESSION_BALANCE.classLevelLimit
    : V39_CLASS_PROGRESSION_BALANCE.classLevelLimit;
  const surplus=Math.max(0,n(derived.classLevels)-limit);
  if(!derived.ok)reasons.push('現在のクラス情報が不正');
  if(unit.fusionGrowth)reasons.push('合体ユニットの職業変更は未対応');
  if(state.activePlayerId!==playerId||state.timeline?.phase!=='player')reasons.push('自分の操作ターンに取得可能');
  if(n(unit.hp ?? unit.currentHp)===0||unit.state==='死亡')reasons.push('生存ユニットが必要');
  if((unit.worldId || 'surface')!==(state.activeWorldId || 'surface'))reasons.push('表示中のワールドにいる必要があります');
  if(!isV39ProfessionClassRow(row)||n(row.Tire ?? row.Tier)<=n(current?.Tire ?? current?.Tier))reasons.push('現在より上位の職業が必要');
  if(row.名前===unit.className||n(prior[row.名前])>0)reasons.push('取得済みクラス');
  if(conditions.length!==1||conditions[0]?.token!==unit.className)reasons.push('単一の現在職を前提とするクラスのみ対応');
  if(surplus<1)reasons.push(`現在職Lv${limit+1}以上が必要（超過Lv1）`);
  if(n(unit.level)<n(row.合計Lv))reasons.push(`総合Lv${row.合計Lv}が必要`);
  for(const condition of conditions)if(n(prior[condition.token])<condition.required)reasons.push(`${condition.token}Lv${condition.required}が必要`);
  const skills=new Set(derived.acquiredSkillNames || []);
  for(const name of splitV39ClassCondition(row.条件スキル))if(!skills.has(name))reasons.push(`スキル「${name}」が必要`);
  const faction=state.players.find(player=>player.id===playerId)?.factionState;
  const settlement=faction?.settlements?.find(base=>base.placed&&(unit.worldId || 'surface')==='surface'
    &&(unit.x===base.x&&unit.y===base.y||base.territoryTileKeys?.includes(`${unit.x},${unit.y}`)
      ||base.territoryResidentialCenterMap?.[`${unit.x},${unit.y}`]===`${base.x},${base.y}`));
  for(const name of splitV39ClassCondition(row.条件施設)) {
    const completed=Object.entries(settlement?.tileFacilityMap || {}).some(([key,names])=>names.includes(name)
      &&(!state.territoryOwnerByTile||state.territoryOwnerByTile[key]===playerId)
      &&settlement.facilityStateByTile?.[key]?.[name]?.status!=='損壊'&&(settlement.facilityStateByTile?.[key]?.[name]?.hp ?? 1)>0);
    if(!completed)reasons.push(`滞在中の自軍拠点に完成した${name}が必要`);
  }
  return {row,derived,limit,surplus,reasons,available:reasons.length===0};
}
export function getV39ClassPromotionOptions(state,playerId,unit) {
  return getGameDataRows('クラス').filter(row=>isV39ProfessionClassRow(row)&&splitV39ClassCondition(row.条件クラス)
    .some(value=>parseV39ClassCondition(value)?.token===unit.className)).map(row=>inspectV39ClassPromotion(state,playerId,unit,row));
}
export function acquireV39UpperClass(state,playerId,unitId,className) {
  const player=state.players.find(row=>row.id===playerId),unit=player?.factionState.units.find(row=>row.id===unitId);
  const row=getGameDataRows('クラス').find(row=>row.名前===className);
  if(!unit||!row)return {ok:false,state,reason:'取得対象がありません'};
  const check=inspectV39ClassPromotion(state,playerId,unit,row);
  if(!check.available)return {ok:false,state,reason:check.reasons.join(' / ')};
  const beforeMax=Number(unit.maxHp)||1,ratio=Math.min(1,Number(unit.hp ?? unit.currentHp)/beforeMax);
  let updated=applyV39DerivedCharacterData({...unit,className,prerequisiteClassLevels:{...check.derived.prerequisiteClassLevels,[unit.className]:check.limit},
    promotionGrowthStart:{level:check.derived.baseLevel,raceLevels:check.derived.raceLevels,classLevels:check.surplus},
    classGrowthStart:null,undeadGrowthStart:null,reincarnationGrowthStart:null,classPromotionHistory:[...(unit.classPromotionHistory || []),{from:unit.className,to:className,level:unit.level,transferredLevels:check.surplus}]});
  const hp=Math.max(1,Math.floor(updated.maxHp*ratio));updated={...updated,hp,currentHp:hp};
  return {ok:true,state:{...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:{...row.factionState,
    units:row.factionState.units.map(member=>member.id===unitId?updated:member)}}:row)},message:`${className}を取得 / ${unit.className}Lv${check.limit}＋${className}Lv${check.surplus}`};
}
