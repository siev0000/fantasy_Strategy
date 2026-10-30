const fields = require('./player_config_options.json')['ゲーム進行設定']['魂APP'];

function normalizeSoulAppSettings(settings = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, rule]) => {
    const raw = settings?.[key];
    const value = raw == null || raw === '' ? NaN : Number(raw);
    return [key, Math.max(rule['最小'], Math.min(rule['最大'],
      Number.isFinite(value) ? value : rule['デフォルト']))];
  }));
}

module.exports = { fields, normalizeSoulAppSettings };
