import {getGameDataRows} from './game-data-registry.js';
import {getFactionSettlements} from './settlement-state.js';
import {V39_SUMMON_BALANCE} from './v39-gameplay-balance.js';
import {isV39Undead} from './v39-corpse-types.js';
import {resolveV39CountrySummonBonus} from './v39-country-bonuses.js';
import {resolveV39CitySpecializationModifiers} from './v39-city-specialization-rules.js';
import {getSelectedSettlement} from './settlement-state.js';

const split=value=>String(value||'').split('/').map(s=>s.trim()).filter(Boolean);
const positive=value=>Math.max(0,Number(value)||0);

export function getV39CompletedRitualFacilities(player) {
  const names=new Set(getFactionSettlements(player?.factionState).filter(base=>base.placed)
    .flatMap(base=>base.buildings||[]));
  return getGameDataRows('施設').filter(row=>names.has(row.施設名));
}

export function resolveV39SummonFamily(target, catalog=null) {
  const composition=String(catalog?.クラス構成||`${target}_1`).split(/[\s,、/]+/)
    .map(token=>token.replace(/_\d+$/,''));
  const rows=getGameDataRows('クラス'),seen=new Set(composition);
  for(const name of seen) {
    const row=rows.find(row=>row.名前===name);
    for(const match of String(row?.条件クラス||'').matchAll(/([^\s,、/]+)_\d+/g))seen.add(match[1]);
  }
  if(catalog?.分類==='アンデッド'||[...seen].some(name=>isV39Undead({race:name})))return 'アンデッド';
  if(catalog?.分類==='デヴィル'||seen.has('デヴィル'))return 'デヴィル';
  if(catalog?.分類==='セレスチャル'||seen.has('エンジェル'))return 'エンジェル';
  if([...seen].some(name=>/フレイム.*エレメンタル/.test(name)))return '火精霊';
  if([...seen].some(name=>/(?:ウォーター|フロスト).*エレメンタル/.test(name)))return '水精霊';
  if([...seen].some(name=>/エア.*エレメンタル/.test(name)))return '風精霊';
  if([...seen].some(name=>/アース.*エレメンタル/.test(name)))return '土精霊';
  return '';
}

export function resolveV39RitualSummonEffects(player,target,catalog=null,{facilitySummon=false,baseLevel=null,settlement=null}={}) {
  const family=resolveV39SummonFamily(target,catalog),facilities=getV39CompletedRitualFacilities(player);
  const completed=new Set(facilities.map(row=>row.施設名));
  const matching=facilities.filter(row=>split(row.召喚系統).some(value=>value==='全般'||value===family));
  const maximumLevel=Math.min(V39_SUMMON_BALANCE.normalMaximumLevel,
    Math.max(V39_SUMMON_BALANCE.baseMaximumLevel,...matching.map(row=>positive(row.召喚上限Lv))));
  const rankBonus=facilitySummon?0:Math.max(0,...matching.map(row=>positive(row.召喚生成Lv補正)));
  const definitions=getGameDataRows('施設');
  // Upgrades replace lower tiers in-place, but still satisfy their completion requirements.
  const satisfies=name=>completed.has(name)||(()=>{
    const required=definitions.find(row=>row.施設名===name);
    return required?.施設召喚枠ID&&facilities.some(row=>row.施設召喚枠ID===required.施設召喚枠ID
      &&positive(row.召喚上限Lv)>=positive(required.召喚上限Lv));
  })();
  const tableLevel=positive(catalog?.総Lv ?? baseLevel);
  const completionBonus=Math.max(0,...definitions.filter(row=>split(row.召喚系統).includes(family)
    &&tableLevel>0&&tableLevel<=positive(row.召喚完成対象上限Lv)
    &&split(row.召喚補正前提施設).length>0&&split(row.召喚補正前提施設).every(satisfies))
    .map(row=>positive(row.召喚完成Lv補正)));
  const countryBonus=resolveV39CountrySummonBonus(player,family);
  const cityBonus=Math.max(0,Math.floor(resolveV39CitySpecializationModifiers(settlement||getSelectedSettlement(player?.factionState)).summonLevel));
  const bonusLevel=Math.max(rankBonus,completionBonus)+countryBonus+cityBonus;
  return {family,maximumLevel,bonusLevel,rankBonus,completionBonus,countryBonus,cityBonus};
}

export function recordV39FacilitySummonLosses(faction,dead,turn) {
  const slots={...faction.facilitySummonsBySlot};
  for(const unit of dead) {
    const origin=unit.summon;
    if(origin?.kind!=='facility'||!origin.slotKey)continue;
    const current=slots[origin.slotKey];
    const ids=Array.isArray(current?.unitIds)?current.unitIds:current?.unitId?[current.unitId]:[];
    if(!ids.includes(unit.id))continue;
    const unitIds=ids.filter(id=>id!==unit.id);
    slots[origin.slotKey]={...current,unitId:unitIds[0]||null,unitIds,
      ...(!unitIds.length?{defeatedAtTurn:turn,readyAtTurn:turn+Math.max(0,Math.floor(positive(origin.cooldownTurns)))}:{})};
  }
  return slots;
}

export function resolveV39RitualRaceEffects(player,race) {
  const rows=getV39CompletedRitualFacilities(player).filter(row=>split(row.魂変換対象).includes(race));
  return {soulMultiplier:Math.max(1,...rows.map(row=>positive(row.魂変換倍率))),
    reincarnationLevel:Math.max(0,...rows.map(row=>positive(row.転生最低Lv)))};
}
