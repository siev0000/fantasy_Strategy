import options from '../../../config/player_config_options.json';

export const V39_SOUL_APP_FIELDS = options['ゲーム進行設定']['魂APP'];
export function normalizeV39SoulAppSettings(settings = {}) {
  return Object.fromEntries(Object.entries(V39_SOUL_APP_FIELDS).map(([key, rule]) => {
    const raw = settings?.[key];
    const value = raw == null || raw === '' ? NaN : Number(raw);
    return [key, Math.max(rule['最小'], Math.min(rule['最大'],
      Number.isFinite(value) ? value : rule['デフォルト']))];
  }));
}
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round(value * 1e8) / 1e8 || 0;

export function resolveV39UnitSoulApp(unit, settings) {
  return round(finite(unit?.status?.APP ?? unit?.derivedCharacter?.status?.APP ?? unit?.APP)
    / normalizeV39SoulAppSettings(settings).unitSoulAppDivisor);
}

export function resolveV39VillageSoulApp(player, village, settings) {
  const race = String(player?.race || '');
  const sign = ['天使', 'エンジェル'].includes(race) ? 1 : ['悪魔', 'デヴィル'].includes(race) ? -1 : 0;
  const relation = Math.max(0, Math.min(100, finite(village?.relationsByPlayerId?.[player?.id])));
  return round(sign * relation / normalizeV39SoulAppSettings(settings).villageSoulAppDivisor);
}

// This is acquisition history, not an additional spendable soul resource.
export function addV39SoulApp(faction, values) {
  const totals = faction?.soulAppTotals || {};
  let positive = Math.max(0, finite(totals.positive));
  let negative = Math.max(0, finite(totals.negative));
  for (const value of values) {
    const app = finite(value);
    if (app > 0) positive += app;
    else negative -= app;
  }
  return { ...faction, soulAppTotals: { positive: round(positive), negative: round(negative) } };
}
