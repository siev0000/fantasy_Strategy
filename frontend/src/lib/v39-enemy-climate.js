import config from '../../../config/v39-enemy-climate.json';
import {matchesV39ClimateConditions} from './v39-climate-conditions.js';
export {createV39ClimateLookup as createV39EnemyClimateLookup} from './v39-climate-conditions.js';

export function v39EnemyClimateWeight(row,climate){
  if(!climate)return 1;
  if(!matchesV39ClimateConditions(row,climate))return 0;
  const preferred=String(row?.出現しやすい天候||'').split(/[\/／,、\n]/).map(s=>s.trim()).filter(Boolean);
  return preferred.includes(climate.weather)?config.preferredWeatherMultiplier:config.otherWeatherMultiplier;
}

