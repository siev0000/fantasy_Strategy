// 敵AIの性格調整値。逃走開始HP率はここだけを変更する。
export const V39_ENEMY_AI_CONFIG = Object.freeze({
  aggressiveFleeHpRate:0.1,
  passiveFleeHpRate:0.3,
  passiveRetaliatesWhenAttacked:true
});

export function resolveV39EnemyFleeHpRate(enemy) {
  return enemy?.aggressive === true
    ? V39_ENEMY_AI_CONFIG.aggressiveFleeHpRate
    : V39_ENEMY_AI_CONFIG.passiveFleeHpRate;
}
