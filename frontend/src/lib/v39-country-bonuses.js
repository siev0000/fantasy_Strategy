const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const count=value=>Math.max(0,Math.floor(number(value)));

// Runtime country data only; no implicit religion, policy or race bonuses.
export function normalizeV39CountryBonuses(source={}) {
  const row=record(source);
  return {
    happiness:number(row.happiness),
    heroLimit:count(row.heroLimit),
    summonLevel:count(row.summonLevel),
    summonLevelByFamily:Object.fromEntries(Object.entries(record(row.summonLevelByFamily))
      .filter(([family])=>family.trim()).map(([family,value])=>[family,count(value)]))
  };
}

export function getV39CountryBonuses(player) {
  return normalizeV39CountryBonuses(player?.factionState?.countryBonuses);
}

export function resolveV39CountrySummonBonus(player,family='') {
  const bonus=getV39CountryBonuses(player);
  return bonus.summonLevel+(family?bonus.summonLevelByFamily[family]||0:0);
}
