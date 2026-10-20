import {getGameDataRows} from './game-data-registry.js';
import {resolveInsectSpecies} from './insect-artwork-config.js';
import {canV39UnitLeaveOrganicCorpse} from './v39-corpse-types.js';

const insectRaces=new Set(getGameDataRows('クラス').filter(row=>row.種類==='蟲').map(row=>row.名前));

export function canV39SpeciesBecomeUndead(unit,undeadClass) {
  if(unit&&!canV39UnitLeaveOrganicCorpse(unit))return false;
  if(!['スケルトン','骸骨'].includes(undeadClass))return true;
  if(resolveInsectSpecies(unit))return false;
  const race=unit?.race || unit?.種族 || unit?.raceName || unit?.種族名;
  return !insectRaces.has(race);
}
