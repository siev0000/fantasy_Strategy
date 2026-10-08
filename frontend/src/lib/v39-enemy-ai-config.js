// 敵AIの性格調整値。逃走開始HP率はここだけを変更する。
export const V39_ENEMY_AI_CONFIG = Object.freeze({
  aggressiveFleeHpRate:0.1,
  passiveFleeHpRate:0.3,
  passiveRetaliatesWhenAttacked:true,
  // 平時の訓練頻度は暫定値。戦闘・防衛・食料探索・回収を常に優先する。
  trainingTurnInterval:3,
  trainingExpPerMilitaryLevel:10
});

// 敵ターンの見せ方。戦闘計算には影響せず、カメラと待機時間だけを調整する。
export const V39_ENEMY_TURN_PRESENTATION_CONFIG = Object.freeze({
  // 攻撃者と対象が近い場合は、攻撃ごとに細かくズームを変えずこの倍率で固定する。
  nearAttackDistanceTiles:3,
  nearAttackZoom:1.5,
  // 遠距離攻撃では攻撃者と対象の両方が画面内へ収まるよう、このマス数ぶん余白を取る。
  farAttackPaddingTiles:2,
  // 攻撃者と対象を認識するため、構図を決めた後に一度止めてから攻撃する。
  preAttackPauseMs:500,
  cameraPanMs:220,
  cameraZoomMs:220,
  // 微小な倍率差ではズームをやり直さず、連続攻撃時の細かな拡大縮小を抑える。
  zoomChangeThreshold:0.12,
  // 敵ターン終了時は、敵ターン開始前の倍率へ一度だけ戻す。
  restoreZoomMs:220
});

export function resolveV39EnemyFleeHpRate(enemy) {
  return enemy?.aggressive === true
    ? V39_ENEMY_AI_CONFIG.aggressiveFleeHpRate
    : V39_ENEMY_AI_CONFIG.passiveFleeHpRate;
}
