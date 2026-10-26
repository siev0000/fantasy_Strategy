import {getGameDataRows,cityData} from './game-data-registry.js';
import {resolveV39CityAtTile,getV39SelectedCityDefinitions} from './v39-city-specialization-rules.js';
import {getV39PassiveRows,matchV39PassiveCondition,collectV39PassiveBonuses,addV39PassiveValues} from './v39-passive-rules.js';
import {isV39SquadPassive,getV39SquadMembers,matchV39SquadCondition} from './v39-squad-passive-context.js';

export const hasV39CityAuraSources=()=>cityData.some(row=>row.常時発動スキル);

export function applyV39CityAura(unit,state,terrainName='') {
  // Keep the optional method call out of parameter defaults: production lowering can lose its receiver binding.
  if(state===undefined)state=globalThis.window?.getV39EnemyTurnState?.();
  if(!unit)return unit;
  if(!hasV39CityAuraSources()&&!unit.cityAuraSkillNames?.length)return unit;
  const ownsSource=state?.players?.some(player=>player.factionState?.settlements?.some(base=>
    getV39SelectedCityDefinitions(base).some(row=>row.常時発動スキル)));
  if(!ownsSource&&!unit.cityAuraSkillNames?.length)return unit;
  const oldNames=new Set(unit.cityAuraSkillNames||[]);
  const base={...unit,techniques:(unit.techniques||[]).filter(row=>!row.cityAuraSource),
    passiveContextSkillNames:(unit.passiveContextSkillNames||[]).filter(name=>!oldNames.has(name))};
  for(const bucket of ['status','skillLevels','resistances'])base[bucket]=addV39PassiveValues(unit[bucket],
    Object.fromEntries(Object.entries(unit.cityAuraDeltas?.[bucket]||{}).map(([key,value])=>[key,-value])));
  const worldId=unit.worldId||'surface',key=`${unit.x},${unit.y}`;
  const city=resolveV39CityAtTile(state,key,worldId);
  const ownUnit=city.owner?.factionState?.units?.some(row=>row.id===unit.id);
  const names=Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡'&&ownUnit&&!unit.storedAtFacilityId
    ?city.modifiers.constantSkills:[];
  const existing=new Set(getV39PassiveRows(base).map(row=>row.名前));
  const rows=names.filter(name=>!existing.has(name)).map(name=>getGameDataRows('スキル一覧').find(row=>row.名前===name)).filter(Boolean);
  const matched=rows.filter(row=>{
    if(row.攻撃手段||row.条件系統)return false;
    if(row.条件===terrainName)return false;
    if(isV39SquadPassive(row))return ['自身','部隊全員'].includes(row.対象||'自身')&&matchV39SquadCondition(row,getV39SquadMembers(unit,state));
    return matchV39PassiveCondition(row,base,null,{terrainName}).matches;
  });
  const bonuses=collectV39PassiveBonuses(matched),deltas={status:bonuses.status,skillLevels:bonuses.skillLevels,resistances:bonuses.resistances};
  const techniques=[...base.techniques,...rows.map(row=>({name:row.名前,source:row,cityAuraSource:true}))];
  return {...base,techniques,...Object.fromEntries(Object.entries(deltas).map(([key,value])=>[key,addV39PassiveValues(base[key],value)])),
    cityAuraDeltas:deltas,cityAuraSkillNames:rows.map(row=>row.名前),
    passiveContextSkillNames:[...base.passiveContextSkillNames,...matched.map(row=>row.名前)]};
}
