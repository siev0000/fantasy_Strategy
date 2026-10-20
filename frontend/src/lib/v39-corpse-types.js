import {getGameDataRows} from './game-data-registry.js';

const undeadClasses=new Set(getGameDataRows('クラス').filter(row=>/アンデッド|不死/.test(String(row.種類||''))).map(row=>row.名前));
const undeadNames=new Set(['アンデッド','ゾンビ','ドゥームゾンビ','スケルトン','リッチ','レイス','ゴースト','ヴァンパイア','吸血鬼','骸骨','動死体']);
const incorporealClasses=new Set(['ゴースト','レイス']);
function classNames(unit={}){
  const names=[unit.race,unit.className,unit.secondClassName,unit.strongAnimalClassName,
    ...[unit.prerequisiteClassLevels,unit.fusionGrowth?.levelsByClass,unit.derivedCharacter?.prerequisiteClassLevels]
      .flatMap(levels=>Object.entries(levels||{}).filter(([,lv])=>Number(lv)>0).map(([name])=>name))].filter(Boolean);
  // A ghost used as a fusion ingredient does not make the resulting beast a corpse.
  return (unit.fusionGrowth?.recipeName||unit.strongFusionResultName)&&unit.race!=='ゴースト'&&!unit.undeadOrigin
    ?names.filter(name=>name!=='ゴースト'):names;
}
export function isV39Undead(unit){
  return unit?.isUndead===true||unit?.metadata?.isUndead===true||!!unit?.undeadOrigin
    ||classNames(unit).some(name=>undeadClasses.has(name)||undeadNames.has(name));
}
export function resolveV39CorpseKind(unit){
  if(unit?.summon)return 'none';
  if(!isV39Undead(unit))return 'organic';
  return classNames(unit).some(name=>incorporealClasses.has(name))?'none':'remains';
}
export const canV39UnitLeaveOrganicCorpse=unit=>resolveV39CorpseKind(unit)==='organic';
