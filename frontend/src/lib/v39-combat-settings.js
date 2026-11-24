import options from '../../../config/player_config_options.json';

export const V39_SKILL_COUNTER_HOLD = options['ゲーム進行設定']['戦闘カウンターの保持ターン'];
export function normalizeV39SkillCounterHoldTurns(value) {
  const turns=value==null||value===''?NaN:Number(value);
  return Math.max(V39_SKILL_COUNTER_HOLD.最小,Math.min(V39_SKILL_COUNTER_HOLD.最大,
    Number.isFinite(turns)?Math.floor(turns):V39_SKILL_COUNTER_HOLD.デフォルト));
}

const config=options['ゲーム進行設定']['最終ダメージ倍率'];
export const V39_DAMAGE_MULTIPLIER_MIN=Number(config['最小']);
export const V39_DAMAGE_MULTIPLIER_MAX=Number(config['最大']);
export const V39_DAMAGE_MULTIPLIER_STEP=Number(config['刻み']);
export function normalizeV39DamageMultiplier(value){
  const n=value==null||value===''?NaN:Number(value);
  const clamped=Math.max(V39_DAMAGE_MULTIPLIER_MIN,Math.min(V39_DAMAGE_MULTIPLIER_MAX,Number.isFinite(n)?n:Number(config['デフォルト'])));
  return Number((Math.round(clamped/V39_DAMAGE_MULTIPLIER_STEP)*V39_DAMAGE_MULTIPLIER_STEP).toFixed(6));
}
export function resolveV39DamageMultiplier(settings){
  return normalizeV39DamageMultiplier((settings??globalThis.window?.getV39EnemyTurnState?.()?.gameSettings??globalThis.window?.getV39GameSettings?.())?.combatDamageMultiplier);
}
