import settings from '../../../config/v39-initial-subjects.json';
import {classData} from './game-data-registry.js';
import {resolveV39RaceDefinition,normalizeV39RaceName} from './v39-race-definitions.js';

export function isV39SubjectRuler(race,config=settings){
  const definition=resolveV39RaceDefinition(race);
  return classData.find(row=>row.名前===(definition?.className||race))?.種類===config.rulerCategory;
}

export function normalizeV39SubjectPopulation(populationByRace,subjects={}){
  return Object.fromEntries(Object.entries(subjects||{}).map(([race,count])=>[race,
    Math.min(Math.max(0,Math.floor(Number(count)||0)),Math.max(0,Math.floor(Number(populationByRace?.[race])||0)))])
    .filter(([,count])=>count>0));
}

export function seedV39InitialSubjects(base,{race,playerId,state,mapData,random=Math.random,config=settings}={}){
  if(!config.enabled||!isV39SubjectRuler(race,config)||base.initialSubjects)return base;
  const weights=new Map(),id=base.settlementId||base.id;
  for(const [key,owner] of Object.entries(state?.territoryOwnerByTile||{})){
    if(owner!==playerId)continue;
    const assigned=state.territoryStateByTile?.[key]?.settlementId;
    if(assigned&&assigned!==id)continue;
    const [x,y]=key.split(',').map(Number);
    const terrain=mapData?.specialMap?.[y]?.[x]||mapData?.grid?.[y]?.[x];
    const candidate=normalizeV39RaceName(config.terrainRaces[terrain]||config.fallbackRace);
    const definition=resolveV39RaceDefinition(candidate);
    const ability=classData.find(row=>row.名前===(definition?.className||candidate));
    // Resident candidates need working ability data, not player-selectable faction setup.
    if(!ability||ability.種類!=='人族'||!(Number(ability.HP)>0))continue;
    weights.set(candidate,(weights.get(candidate)||0)+1);
  }
  if(!weights.size)return base;
  const roll=()=>Math.min(1-Number.EPSILON,Math.max(0,Number(random())||0));
  let pick=roll()*[...weights.values()].reduce((sum,value)=>sum+value,0),selected;
  for(const [candidate,weight] of weights){pick-=weight;if(pick<0){selected=candidate;break;}}
  const min=Math.max(0,Math.floor(config.minimumPopulation)),max=Math.max(min,Math.floor(config.maximumPopulation));
  const count=min+Math.floor(roll()*(max-min+1));
  return {...base,populationByRace:{...base.populationByRace,[selected]:Number(base.populationByRace?.[selected]||0)+count},
    subjectPopulationByRace:{...base.subjectPopulationByRace,[selected]:Number(base.subjectPopulationByRace?.[selected]||0)+count},
    initialSubjects:{race:selected,count}};
}
