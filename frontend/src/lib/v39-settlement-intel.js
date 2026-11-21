import {normalizeV39Village,resolveV39FacilityEffectsAtTile,resolveV39SettlementProductionMetrics} from './v39-economy-rules.js';
import {inspectV39SettlementResourceFlow} from './v39-settlement-resource-flow.js';
import {inspectV39TerritoryRepair} from './v39-territory-repair-rules.js';

export const settlementIntelGroups=[
  {label:'概況',keys:[['population','人口・住民状態'],['territory','領土']]},
  {label:'生産',keys:[['stocks','備蓄'],['production','産出・消費・収支']]},
  {label:'施設',keys:[['facilities','施設・格納状況']]},
  {label:'ユニット',keys:[['units','所属ユニット']]},
  {label:'運用',keys:[['operations','建設・修復・領土拡張']]}
];

export function getV39SettlementIntelUnits(player,village){
  const settlementId=village.settlementId||village.id;
  const world=village.worldId||"surface";
  return (player.factionState.units||[]).filter(unit=>Number(unit.hp??unit.currentHp)>0
    &&unit.state!=="死亡"&&!unit.characterStorage&&(unit.worldId||"surface")===world
    &&Number.isInteger(unit.x)&&Number.isInteger(unit.y)
    &&(unit.settlementId===settlementId||(unit.x===village.x&&unit.y===village.y)));
}

export function snapshotV39SettlementIntelUnits(player,units,{includeStats=false}={}){
  const leaders=new Set((player.factionState.squads||[]).filter(squad=>squad.id!=="solo").map(squad=>squad.leaderId));
  return units.map(unit=>({
    id:unit.id,name:unit.name,level:unit.level,race:unit.race,className:unit.className,
    unitType:unit.unitType,portrait:unit.portrait,portraitSource:unit.portraitSource,
    hp:unit.hp??unit.currentHp,maxHp:unit.maxHp??unit.status?.HP,
    ap:unit.ap??unit.currentAp,maxAp:unit.maxAp??unit.apMax,
    x:unit.x,y:unit.y,worldId:unit.worldId||"surface",
    roles:[unit.isSovereign?"統治者":"",leaders.has(unit.id)?"部隊長":""].filter(Boolean),
    ...(includeStats?{status:Object.fromEntries(["攻撃","防御","魔力","精神","命中","速度"]
      .filter(key=>unit.status?.[key]!=null).map(key=>[key,unit.status[key]]))}:{})
  }));
}

export function settlementProductionEffects(base){
  return Object.entries(base.tileFacilityMap||{}).flatMap(([key,names])=>{
    const effects=resolveV39FacilityEffectsAtTile(base,key);
    const bonuses=Object.fromEntries(['生産力','農業','林業','漁業','工業']
      .filter(name=>Number(effects[name])).map(name=>[name,effects[name]]));
    return Object.keys(bonuses).length?[{key,names,bonuses}]:[];
  });
}

export function captureV39SettlementIntel(state,player,base,parts,map){
  const village=normalizeV39Village(base,player.race);
  const capture=(keys)=>Object.fromEntries(keys.map(key=>[key,village[key]]).filter(([,value])=>value!==undefined));
  const intel={};
  if(parts.includes('units'))intel.units={units:snapshotV39SettlementIntelUnits(player,getV39SettlementIntelUnits(player,village),{includeStats:true})};
  if(parts.includes('population')){
    intel.population={base:capture(['type','population','populationByRace','populationGrowthByRace','subjectPopulationByRace','civicState',
      'overcrowdingPopulation','overcrowdingHappinessPenalty','lastPopulationOutflow']),
      metrics:resolveV39SettlementProductionMetrics(state,player,village),
      civicProductionMultiplier:village.lastEconomyDelta?.civicProductionMultiplier};
  }
  if(parts.includes('territory')){
    const records=Object.fromEntries((village.territoryTileKeys||[]).map(tile=>[tile,state.territoryStateByTile?.[tile]||{}]));
    intel.territory={base:capture(['territoryTileKeys']),records};
  }
  if(parts.includes('stocks'))intel.stocks={base:capture(['foodStockByType','materialStockByType'])};
  if(parts.includes('production')){
    intel.production={
      flow:village.lastEconomyDelta||(map?inspectV39SettlementResourceFlow(state,player,village,map):null),
      mode:village.lastEconomyDelta?'recorded':'forecast',
      metrics:resolveV39SettlementProductionMetrics(state,player,village),
      effects:settlementProductionEffects(village)
    };
  }
  if(parts.includes('facilities')){
    const storage=(player.factionState.facilityStorage||[]).filter(entry=>
      entry.worldId===(village.worldId||'surface')&&village.tileFacilityMap?.[entry.tileKey]?.includes(entry.facilityName));
    intel.facilities={base:capture(['tileFacilityMap','facilityStateByTile','buildings','constructionQueue']),
      storage:storage.map(({tileKey,facilityName,unit})=>({
        tileKey,facilityName,name:unit.name,level:unit.level,
        unit:{name:unit.name,level:unit.level,race:unit.race,className:unit.className,
          hp:unit.hp??unit.currentHp,maxHp:unit.maxHp??unit.status?.HP,
          ap:unit.ap??unit.currentAp,maxAp:unit.maxAp??unit.apMax}
      }))};
  }
  if(parts.includes('operations')){
    const {targets,healRate,maxTiles,level,reason}=inspectV39TerritoryRepair(state,player.id,village.id);
    intel.operations={base:capture(['citySpecializationId','cityTraits','environmentStability','roadDevelopmentByTile',
      'cityEventCandidates','autoRepair','operationPlans','landExpansionProjects','constructionQueue']),
      repair:{targets,healRate,maxTiles,level,reason},
      training:(player.factionState.unitTrainingQueue||[]).filter(order=>order.settlementId===village.id)
        .map(order=>({name:order.unit?.name||order.name,remainingTurns:order.remainingTurns}))};
  }
  return structuredClone(intel);
}
