import options from '../../../config/player_config_options.json';

const config=options['ゲーム進行設定']['索敵発見補正'];
export const V39_DETECTION_BONUS_MIN=Number(config['最小']);
export const V39_DETECTION_BONUS_MAX=Number(config['最大']);
export function normalizeV39DetectionScoutBonus(value){
  const n=value==null||value===''?NaN:Number(value);
  return Math.max(V39_DETECTION_BONUS_MIN,Math.min(V39_DETECTION_BONUS_MAX,
    Math.floor(Number.isFinite(n)?n:Number(config['デフォルト']))));
}
export function resolveV39DetectionScoutBonus(settings){
  return normalizeV39DetectionScoutBonus((settings??globalThis.window?.getV39GameSettings?.())?.detectionScoutBonus);
}
