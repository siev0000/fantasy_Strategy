import config from '../../../config/v39-soul-conversion.json';
import { resolvePopulationClassDefinition } from './v39-population-economy.js';
import { resolveV39RitualRaceEffects } from './v39-ritual-facilities.js';

export function resolveV39ImmediateSoulAmount(player, count, settings = config) {
  const definition = resolvePopulationClassDefinition(player?.race);
  if (!settings.enabled || !settings.receiverClassNames?.includes(definition?.名前))return 0;
  return resolveV39PersonSoulAmount(player,count,settings);
}

export function resolveV39PersonSoulAmount(player,count,settings=config){
  const definition=resolvePopulationClassDefinition(player?.race);
  const amount = Number(count);
  const rate = Number(settings.soulsPerPerson);
  if (!definition || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  const result = Math.round(amount * rate * resolveV39RitualRaceEffects(player, definition.名前).soulMultiplier * 1e8) / 1e8;
  return Number.isFinite(result) ? result : 0;
}
