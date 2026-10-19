import settings from '../../../config/v39-animal-army.json';
import {getGameDataRows} from './game-data-registry.js';

export const V39_ANIMAL_ARMY_SETTINGS = Object.freeze({...settings});
export const isV39AnimalArmy = unit => Array.isArray(unit?.animalArmy?.members) && unit.animalArmy.members.length >= 2;
export function isV39OrdinaryAnimal(unit) {
  if (!unit || unit.isNamed || unit.isSovereign || unit.summon || ['ヒーロー','ネームド'].includes(unit.unitType)) return false;
  const row = getGameDataRows('クラス').find(row => row.名前 === (unit.race || unit.raceName));
  return settings.eligibleKinds.includes(row?.種類);
}
