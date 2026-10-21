import config from '../../../config/v39-soul-conversion.json';
import { resolvePopulationClassDefinition } from './v39-population-economy.js';

export function resolveV39ImmediateSoulAmount(player, count, settings = config) {
  const definition = resolvePopulationClassDefinition(player?.race);
  const amount = Number(count);
  const rate = Number(settings.soulsPerPerson);
  if (!settings.enabled || !settings.receiverClassNames?.includes(definition?.名前)
    || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  const result = amount * rate;
  return Number.isFinite(result) ? result : 0;
}
