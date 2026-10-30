import {getGameDataRows} from '../../lib/game-data-registry.js';
import {FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS,ECONOMY_GAIN_SCALE,collectV39TerritoryTileIncome,resolveV39FacilityEffectsAtTile} from '../../lib/v39-economy-rules.js';
import {getSettlementForTerritory} from '../../lib/settlement-state.js';
import {resolveV39CivicProductionMultiplier} from '../../lib/v39-civic-rules.js';
import {resolveV39CitySpecializationModifiers} from '../../lib/v39-city-specialization-rules.js';
import {resolveV39SpecialtyFoodBonuses,v39SpecialtyDefinitions} from '../../lib/v39-specialty-rules.js';
import {resolveV39ResourceIcon} from '../../lib/resource-icon-glyphs.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=value=>Number(value)||0,round=value=>Math.round(n(value)*10)/10;
const bags=bag=>Object.fromEntries(Object.entries(bag).filter(([,value])=>n(value)>0));

export function inspectV39LandProduction(state,map,{x,y,key,terrain,special}) {
  const yieldTerrain=map?.lavaMap?.[y]?.[x]?'溶岩':special||terrain;
  const definition=getGameDataRows('地形').find(row=>row.地形===yieldTerrain)||{};
  const base=bags(Object.fromEntries([...FOOD_RESOURCE_KEYS,...MATERIAL_RESOURCE_KEYS].map(name=>[name,round(n(definition[name])*ECONOMY_GAIN_SCALE)])));
  const player=state.players?.find(row=>row.id===state.activePlayerId);
  if((state.activeWorldId||'surface')!=='surface')return {base:{},note:'洞窟内は鉱床を採取して手持ちとして運びます。'};
  if(!player||state.territoryOwnerByTile?.[key]!==player.id)return {base,note:'自領外のため通常産出見込みは表示しません。'};
  const settlement=getSettlementForTerritory(player.factionState,state.territoryStateByTile?.[key]);
  if(!settlement)return {base,note:'所属拠点が未設定です。'};
  const raw=collectV39TerritoryTileIncome(state,player.id,key,map),civic=resolveV39CivicProductionMultiplier(settlement),city=resolveV39CitySpecializationModifiers(settlement);
  const normal=bags(Object.fromEntries([...Object.entries(raw.food).map(([name,value])=>[name,round(value*civic*city.foodMultiplier)]),...Object.entries(raw.material).map(([name,value])=>[name,round(value*civic*city.materialMultiplier)])]));
  const bonus=resolveV39SpecialtyFoodBonuses(state,player.id,settlement.settlementId||settlement.id);
  const site=bonus.sites.find(row=>row.key===key),fixed={};
  if(site){const row=v39SpecialtyDefinitions().find(row=>row.名前===site.name);if(n(row?.固定収入)>0)fixed[site.resource]=n(row.固定収入);}
  return {base,normal,fixed,facilityFixedIncome:raw.facilityFixedIncome||{},facilityEffects:resolveV39FacilityEffectsAtTile(settlement,key),note:'通常産出は技能・稼働率・施設・拠点補正を適用。固定収入は別途加算。維持費・取引予約・定期採取は含みません。'};
}

export function renderV39LandProduction(model) {
  const resources=bag=>Object.entries(bag||{}).map(([name,value])=>{const icon=resolveV39ResourceIcon(name);return `<span title="${esc(name)}" aria-label="${esc(name)} ${esc(value)}"><i aria-hidden="true" style="color:${esc(icon.color)}">${esc(icon.glyph)}</i><b>${esc(value)}</b><small>${esc(name)}</small></span>`;}).join('')||'<small>なし</small>';
  const section=(title,body)=>`<section class="v39-land-resource-section"><strong>${title}</strong><div class="v39-land-resource-list">${body}</div></section>`;
  const effects=Object.entries(model.facilityEffects||{}).filter(([,v])=>n(v)!==0).map(([name,value])=>`${esc(name)} ${n(value)>0?'+':''}${esc(value)}`).join(' / ');
  return section('地形基本産出 /T（倍率適用前）',resources(model.base))
    +(model.normal?section('通常産出見込み /T',resources(model.normal)):'')
    +(Object.keys(model.fixed||{}).length?section('特産品の固定収入 /T',resources(model.fixed)):'')
    +(Object.keys(model.facilityFixedIncome||{}).length?section('施設の固定収入 /T',resources(model.facilityFixedIncome)):'')
    +(effects?section('このマスの施設補正',effects):'')
    +`<small>${esc(model.note)}</small>`;
}
