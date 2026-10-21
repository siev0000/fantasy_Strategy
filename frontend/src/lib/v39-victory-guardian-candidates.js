import config from '../../../config/v39-victory-guardians.json';

export const V39_VICTORY_GUARDIAN_CANDIDATES=config.landmarks;
export const V39_VICTORY_GUARDIAN_MINIONS=config.minionCandidates;
export function getV39GuardianMinionCandidates(landmark,definitions){
  const rules=config.minionCandidates[landmark.landmarkId]||[],seen=new Set();
  return definitions.filter(definition=>{
    const key=`${definition.race}:${definition.className}`;
    if(definition.memberCount!==1||seen.has(key)||!rules.some(rule=>rule.race===definition.race&&rule.className===definition.className))return false;
    seen.add(key);return true;
  });
}
export const V39_GUARDIAN_ONLY_SPECIES=new Set(Object.values(config.landmarks).flat()
  .filter(row=>row.className==='神獣').map(row=>row.name));
const text=value=>String(value??'').trim();
const identityNames=unit=>[unit.guardianSpeciesName,unit.strongFusionResultName,unit.fusionGrowth?.recipeName,
  unit.race,unit.className,unit.name,unit.speciesName].map(text);

export function chooseV39VictoryGuardian(landmark,state,classNames,seed=''){
  const units=[...(state.enemies||[]),...(state.players||[]).flatMap(player=>player.factionState?.units||[])];
  const used=new Set(units.filter(unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡').flatMap(identityNames));
  const rows=(config.landmarks[landmark.landmarkId]||[]).filter(row=>
    (!row.unique||!used.has(row.name))&&classNames.has(row.race)&&classNames.has(row.className));
  if(!rows.length)return null;
  let hash=2166136261;
  for(const char of `${seed}:${landmark.id}:${landmark.key}`)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  const chosen=rows[hash%rows.length];
  return {...chosen,className:classNames.has(chosen.name)?chosen.name:chosen.className};
}
