import { cityData } from "./game-data-registry.js";
import { V39_CITY_SPECIALIZATION_BALANCE } from "./v39-gameplay-balance.js";
import {resolveCurrentResearchLevel} from './research-progress.js';
import {getHexOffsetNeighbors} from './hex-grid.js';
import {isV39Undead} from './v39-corpse-types.js';
import {getFactionSettlementById,getSelectedSettlement,territorySettlementId} from './settlement-state.js';
import {parseV39CityEffectSettings,isV39CityEffectInRange} from './v39-city-effect-schema.js';
import {DAMAGE_TYPE_FIELDS} from '../constants/unitCommon.js';
import {resolveV39ResistanceReduction} from './v39-resistance-math.js';

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const V39_CITY_SKILL_FIELDS=Object.freeze(['農業','林業','漁業','工業','魔術','交渉']);
const effectColumns={浄化:'purification',穢れ:'impurity',回復:'recoveryPercent',研究EXP補正:'researchExpPercent',訓練EXP補正:'trainingExpPercent',軍隊:'armyLimit',ヒーロー:'heroLimit',道路発展数:'roadDevelopment',環境安定度:'environmentStability',運搬容量補正:'cargoCapacityPercent',召喚Lv補正:'summonLevel'};

function hash(value) {
  let result = 0;
  for (const char of text(value)) result = Math.imul(result ^ char.charCodeAt(0), 2654435761) >>> 0;
  return result;
}

export function getV39CitySpecializationDefinitions() {
  return cityData.filter(row => text(row?.レア度) === "通常" && text(row?.影響タイプ) === "都市補正");
}

export function resolveV39CityTraits(settlement) {
  const current = [...new Set((Array.isArray(settlement?.cityTraits) ? settlement.cityTraits : []).map(text).filter(Boolean))];
  if (current.length) return current;
  const candidates = cityData.filter(row => text(row?.レア度) === "レア" && !text(row?.条件)
    &&number(settlement?.scaleLevel)>=number(row.必要拠点Lv,V39_CITY_SPECIALIZATION_BALANCE.minimumScaleLevel));
  if (!candidates.length) return current;
  const id = text(settlement?.settlementId || settlement?.id || `${settlement?.x},${settlement?.y}`);
  if ((hash(`${id}:city-trait`) % 10000) >= V39_CITY_SPECIALIZATION_BALANCE.rareTraitChance * 10000) return current;
  return [text(candidates[hash(`${id}:city-trait-kind`) % candidates.length]?.項目名)].filter(Boolean);
}

function conditionResult(condition, context) {
  if (!condition) return { met:true, detail:"条件なし" };
  const match = text(condition).match(/^(.+?):(.+?)(以上|以下)?$/);
  if (!match) return { met:false, detail:`未対応条件: ${condition}` };
  const [, key, rawValue, comparator] = match;
  const required = /^-?\d+(?:\.\d+)?%?$/.test(rawValue)?Number(rawValue.replace('%','')):null;
  const settlement = context.settlement || {};
  const player = context.player || {};
  const levels = settlement.cityLevels || settlement.researchLevels || {};
  let actual = null;
  if (key === "防衛Lv") actual = number(levels.軍事Lv);
  else if (/^(鍛冶|魔法|信仰|軍事|経済|調査)Lv$/.test(key)) actual = Math.max(number(levels[key]),resolveCurrentResearchLevel(player?.factionState?.research,key.slice(0,-2)));
  else if (key === "人口") actual = Object.values(settlement.populationByRace||{}).reduce((sum,value)=>sum+number(value),0)||number(settlement.population);
  else if (key === "農場数") actual = Object.entries(settlement.tileFacilityMap||{}).filter(([tile,names])=>context.territoryKeys.has(tile)&&names.includes('農場')).length;
  else if (key === "キャラ数") actual = (player?.factionState?.units || []).filter(unit => number(unit?.hp ?? unit?.currentHp) > 0).length;
  else if (key === "開拓完了数") actual = number(context.territoryCount);
  else if (key === "工場") actual = number(settlement.industrialTileRate) * 100;
  else if (key === "農地") actual = number(settlement.farmTileRate) * 100;
  else if (key === "都市技能") actual = number(settlement.citySkills?.[rawValue.replace(/Lv.*$/, "")]);
  else if (key === "地形") return { met:rawValue.split('|').includes(text(settlement.terrain)), detail:`${text(settlement.terrain) || "不明"} / 必要 ${rawValue}` };
  else if (key === "周辺地形") {
    const map=context.mapData,terrains=map?[{x:settlement.x,y:settlement.y},...getHexOffsetNeighbors(settlement.x,settlement.y)]
      .map(tile=>text(map.grid?.[tile.y]?.[tile.x])).filter(Boolean):[];
    return {met:rawValue.split('|').some(terrain=>terrains.includes(terrain)),detail:`中心・周囲1マスに ${rawValue}`};
  }
  else if (key === "ワールド") return {met:rawValue==='洞窟'&&text(settlement.worldId||'surface').startsWith('cave:'),detail:`必要 ${rawValue}`};
  else if (key === "住民系統") {
    const race=Object.entries(settlement.populationByRace||{}).filter(([,count])=>number(count)>0).sort((a,b)=>number(b[1])-number(a[1]))[0]?.[0]||player.race;
    return {met:rawValue==='アンデッド'&&isV39Undead({race}),detail:`主要住民 ${race||'不明'} / 必要 ${rawValue}`};
  }
  else if (key === "都市特性") return { met:(settlement.cityTraits || []).includes(rawValue), detail:`必要 ${rawValue}` };
  else if (key === "メイン種族") {
    const race = Object.entries(settlement.populationByRace || {}).sort((a, b) => number(b[1])-number(a[1]))[0]?.[0] || player.race;
    return { met:text(race).includes(rawValue), detail:`${race || "不明"} / 必要 ${rawValue}` };
  }
  if (actual === null || required===null) return { met:false, detail:`未対応条件: ${condition}` };
  const met = comparator === "以下" ? actual <= required : actual >= required;
  return { met, detail:`${actual} / 必要 ${required}${comparator || ""}` };
}

export function inspectV39CitySpecializations(state, player, settlement, mapData=globalThis.window?.__v39FieldRuntime?.mapData) {
  const id=text(settlement?.settlementId||settlement?.id),selected=getSelectedSettlement(player?.factionState);
  const territoryKeys=new Set(Object.entries(state?.territoryOwnerByTile||{}).filter(([key,owner])=>{
    if(text(owner)!==text(player?.id))return false;
    const assigned=territorySettlementId(state?.territoryStateByTile?.[key]);
    return assigned?assigned===id:text(selected?.settlementId||selected?.id)===id;
  }).map(([key])=>key));
  const current=cityData.find(row=>row.項目名===settlement?.citySpecializationId);
  const hasSelectionTurn=settlement?.citySpecializationSelectedTurn!=null&&Number.isFinite(Number(settlement.citySpecializationSelectedTurn));
  const remaining=settlement?.citySpecializationId&&hasSelectionTurn?Math.max(0,number(settlement.citySpecializationSelectedTurn)+number(current?.切替待機T)-number(state?.timeline?.turnNumber,1)):0;
  return getV39CitySpecializationDefinitions().map(definition => {
    const cityReady = !!settlement?.placed&&number(settlement?.scaleLevel)>=number(definition.必要拠点Lv,V39_CITY_SPECIALIZATION_BALANCE.minimumScaleLevel);
    const conditions=text(definition.条件).split(/[\/\n]+/).filter(Boolean).map(rule=>conditionResult(rule,{state,player,settlement,territoryCount:territoryKeys.size,territoryKeys,mapData}));
    const condition={met:conditions.every(row=>row.met),detail:conditions.map(row=>`${row.met?'○':'×'} ${row.detail}`).join(' / ')||'条件なし'};
    const same=definition.項目名===settlement?.citySpecializationId;
    return {
      id:text(definition?.項目名), name:text(definition?.項目名), condition:text(definition?.条件),
      effectTargets:text(definition?.影響先パラメータ).split("|").filter(Boolean),
      unlocked:cityReady&&condition.met,
      available:cityReady && condition.met &&(!remaining||same),remainingTurns:remaining,
      reason:!cityReady?`拠点Lv${number(definition.必要拠点Lv,3)}以上で選択可能（現在 ${settlement?.type||'未配置'}）`:remaining&&!same?`切替まであと${remaining}ターン`:condition.detail,
      effects:describeV39CitySpecialization(definition),
      definition
    };
  });
}

export function inspectV39CitySpecializationNotice(state,player,settlement,mapData) {
  const worldId=settlement?.worldId||'surface',world=state?.explorationWorlds?.[worldId];
  if(worldId!==(state?.activeWorldId||'surface')&&world){state={...state,...world.spatial,activeWorldId:worldId};mapData=world.map;}
  const options=inspectV39CitySpecializations(state,player,settlement,mapData);
  const seen=new Set(Array.isArray(settlement?.citySpecializationSeenIds)?settlement.citySpecializationSeenIds:[]);
  const changeable=options.filter(option=>option.available&&option.id!==settlement?.citySpecializationId);
  const unseen=changeable.filter(option=>!seen.has(option.id));
  return {options,changeable,unseen,remainingTurns:options[0]?.remainingTurns||0};
}

export function acknowledgeV39CitySpecializations(state,playerId,settlementId,mapData) {
  const player=state?.players?.find(row=>row.id===playerId);
  const base=player?.factionState?.settlements?.find(row=>text(row.settlementId||row.id)===text(settlementId));
  if(!base)return {changed:false,state};
  const notice=inspectV39CitySpecializationNotice(state,player,base,mapData);
  if(!notice.unseen.length)return {changed:false,state};
  const seen=[...new Set([...(Array.isArray(base.citySpecializationSeenIds)?base.citySpecializationSeenIds:[]),...notice.unseen.map(option=>option.id)])];
  return {changed:true,state:{...state,players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:{...row.factionState,
    settlements:row.factionState.settlements.map(item=>text(item.settlementId||item.id)!==text(settlementId)?item:{...item,citySpecializationSeenIds:seen})}})}};
}

export function getV39SelectedCityDefinitions(settlement) {
  return [cityData.find(row=>row.項目名===text(settlement?.citySpecializationId)&&row.レア度==='通常'),
    ...resolveV39CityTraits(settlement).map(trait=>cityData.find(row=>row.項目名===trait&&row.レア度==='レア'))].filter(Boolean);
}

export function resolveV39CitySpecializationModifiers(settlement,context=null) {
  const result = { foodMultiplier:1, materialMultiplier:1, defenseBonus:0, civicBonus:0, happinessBonus:0,
    resistances:{},disasterResistances:{},constantSkills:[],events:[],diagnostics:[],
    skills:Object.fromEntries(V39_CITY_SKILL_FIELDS.map(key=>[key,0])),...Object.fromEntries(Object.values(effectColumns).map(key=>[key,0])) };
  const definitions=getV39SelectedCityDefinitions(settlement).filter(row=>!context||isV39CityEffectInRange(row,settlement,context.tileKey,context.worldId));
  for(const row of definitions){
    result.foodMultiplier*=Math.max(0,1+number(row.食料産出補正)/100);
    result.materialMultiplier*=Math.max(0,1+number(row.資材産出補正)/100);
    result.defenseBonus+=number(row.領土被ダメージ軽減);
    result.civicBonus+=number(row.治安);result.happinessBonus+=number(row.幸福度);
    for(const key of V39_CITY_SKILL_FIELDS)result.skills[key]+=number(row[key]);
    for(const [column,key] of Object.entries(effectColumns))result[key]+=number(row[column]);
    const settings=parseV39CityEffectSettings(row);
    for(const bucket of ['resistances','disasterResistances'])for(const [key,value] of Object.entries(settings[bucket]))result[bucket][key]=(result[bucket][key]||0)+value;
    result.constantSkills.push(...settings.skills);result.events.push(...settings.events);result.diagnostics.push(...settings.diagnostics);
  }
  result.defenseBonus=Math.min(90,Math.max(0,result.defenseBonus));
  result.constantSkills=[...new Set(result.constantSkills)];
  return result;
}

export function describeV39CitySpecialization(row={}) {
  const values=[['食料産出補正','食料','%'],['資材産出補正','資材','%'],['幸福度','幸福度',''],['治安','治安',''],['領土被ダメージ軽減','領土被ダメージ軽減','%'],
    ...V39_CITY_SKILL_FIELDS.map(key=>[key,key,'']),...Object.keys(effectColumns).map(key=>[key,key,['研究EXP補正','訓練EXP補正','運搬容量補正'].includes(key)?'%':''])]
    .filter(([key])=>number(row[key])!==0).map(([key,label,suffix])=>`${label} ${number(row[key])>0?'+':''}${number(row[key])}${suffix}`);
  for(const key of ['常時発動スキル','耐性','災害耐性','イベント設定'])if(text(row[key]))values.push(`${key}: ${text(row[key])}`);
  if(text(row.効果範囲)&&row.効果範囲!=='所属領土')values.push(`範囲: ${row.効果範囲}`);
  values.push(...parseV39CityEffectSettings(row).diagnostics.map(value=>`設定注意: ${value}`));
  return values.join(' / ')||'補正なし';
}

export function resolveV39CityUnitModifiers(player,unit) {
  const base=unit?.settlementId?getFactionSettlementById(player?.factionState,unit.settlementId):getSelectedSettlement(player?.factionState);
  return resolveV39CitySpecializationModifiers(base?.placed?base:null);
}

export function resolveV39CityAtTile(state,tileKey,worldId=state?.activeWorldId||'surface') {
  const spatial=worldId===(state?.activeWorldId||'surface')?state:state?.explorationWorlds?.[worldId]?.spatial;
  const owner=state?.players?.find(player=>text(player.id)===text(spatial?.territoryOwnerByTile?.[tileKey]));
  const id=territorySettlementId(spatial?.territoryStateByTile?.[tileKey]);
  const base=id?getFactionSettlementById(owner?.factionState,id):getSelectedSettlement(owner?.factionState);
  if(!base?.placed||(base.worldId||'surface')!==worldId)return {owner:null,base:null,modifiers:resolveV39CitySpecializationModifiers(null)};
  return {owner,base,modifiers:resolveV39CitySpecializationModifiers(base,{tileKey,worldId})};
}

export function resolveV39CityDisasterMultiplier(state,tileKey,disasterId,worldId) {
  if(!cityData.some(row=>row.災害耐性))return 1;
  const {modifiers}=resolveV39CityAtTile(state,tileKey,worldId);
  return Math.max(0,1-number(modifiers.disasterResistances[disasterId])/100);
}

export function resolveV39CityHazardDamage(state,tileKey,power,disasterId,element='炎') {
  const {base,modifiers}=resolveV39CityAtTile(state,tileKey);
  const reduction=resolveV39ResistanceReduction(power,base?.scaleLevel||1,modifiers.resistances[`${element}耐性`]);
  return Math.max(0,Math.round(reduction.reducedPower*(1-reduction.resistanceRate)*resolveV39CityDisasterMultiplier(state,tileKey,disasterId)));
}

export function resolveV39CityTerritoryDamage(state,tileKey,power,{skillRow={},attacker={}}={}) {
  const {base}=resolveV39CityAtTile(state,tileKey);
  return resolveV39SettlementTerritoryDamage(base,tileKey,power,{skillRow,attacker,worldId:state?.activeWorldId||'surface'});
}

export function resolveV39SettlementTerritoryDamage(base,tileKey,power,{skillRow={},attacker={},worldId='surface'}={}) {
  const modifiers=resolveV39CitySpecializationModifiers(base,{tileKey,worldId}),reduction=modifiers.defenseBonus;
  const damage=Math.max(1,number(power));
  const element=[...DAMAGE_TYPE_FIELDS,'精神'].reduce((best,key)=>number(skillRow[key])>number(skillRow[best])?key:best,'物理');
  const resistance=number(modifiers.resistances[`${element}耐性`]);
  const reduced=resolveV39ResistanceReduction(damage,base?.scaleLevel||1,resistance,attacker?.status?.耐性貫通);
  const resisted=resistance?Math.max(0,Math.floor(reduced.reducedPower*(1-reduced.resistanceRate))):damage;
  return resisted<=0?0:reduction?Math.max(1,Math.round(resisted*(1-reduction/100))):resisted;
}

export function resolveV39SettlementDisasterMultiplier(base,tileKey,disasterId,worldId='surface'){
  const modifiers=resolveV39CitySpecializationModifiers(base,{tileKey,worldId});
  return Math.max(0,1-number(modifiers.disasterResistances[disasterId])/100);
}

export function selectV39CitySpecialization(state, playerId, settlementId, specializationId, mapData=globalThis.window?.__v39FieldRuntime?.mapData) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const settlements = player?.factionState?.settlements || [];
  const settlement = settlements.find(row => text(row?.settlementId || row?.id) === text(settlementId));
  const candidate = inspectV39CitySpecializations(state, player, settlement, mapData).find(row => row.id === text(specializationId));
  if(candidate&&text(settlement?.citySpecializationId)===candidate.id)return {ok:true,state,specialization:candidate};
  if (!candidate?.available) return { ok:false, reason:candidate?.reason || "選択できない都市特性です", state };
  const players = state.players.map(row => row.id !== player.id ? row : {
    ...row,
    factionState:{
      ...row.factionState,
      settlements:settlements.map(city => text(city?.settlementId || city?.id) === text(settlementId)
        ? { ...city, citySpecializationId:candidate.id, citySpecializationSelectedTurn:number(state?.timeline?.turnNumber, 1) }
        : city)
    }
  });
  return { ok:true, state:{ ...state, players }, specialization:candidate };
}
