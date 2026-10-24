// 画像の初期向きと、画像の向きに連動する位置補正（ワールドpx）の共通設定。
export const V39_EFFECT_ROTATION_LIMIT = 180;
export const V39_EFFECT_OFFSET_LIMIT = 300;
export const V39_EFFECT_BASE_SCALE_PERCENT = 50; // 炸裂なしの実戦・プレビュー共通倍率。
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, finite(value)));

export function normalizeV39EffectTransform(setting = {}) {
  return {
    rotationDeg:clamp(setting.rotationDeg, V39_EFFECT_ROTATION_LIMIT),
    offsetX:clamp(setting.offsetX, V39_EFFECT_OFFSET_LIMIT),
    offsetY:clamp(setting.offsetY, V39_EFFECT_OFFSET_LIMIT),
    placementMode:['beam-x','beam-y'].includes(setting.placementMode) ? setting.placementMode : 'target'
  };
}

// Fit length to the attack segment, then apply the same local transform as impacts.
export function resolveV39EffectBeam(setting = {}, origin, target) {
  const {placementMode:mode}=normalizeV39EffectTransform(setting);
  if(mode==='target'||!origin||!target)return null;
  const dx=target.x-origin.x,dy=target.y-origin.y,length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||length<.001)return null;
  const attackAngle=Math.atan2(dy,dx)*180/Math.PI-(mode==='beam-y'?90:0);
  return {...resolveV39EffectTransform({...setting,orientToAttack:true},
      {x:(origin.x+target.x)/2,y:(origin.y+target.y)/2},attackAngle),
    stretchLengthPx:length,stretchAxis:mode==='beam-y'?'y':'x'};
}

export function resolveV39EffectTransform(setting = {}, position = {}, attackAngle = 0, angleOverride) {
  const transform = normalizeV39EffectTransform(setting);
  const angleDeg = angleOverride !== undefined ? finite(angleOverride)
    : (setting.orientToAttack ? finite(attackAngle) : 0) + transform.rotationDeg;
  const radians = angleDeg * Math.PI / 180;
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  return {
    x:finite(position.x) + transform.offsetX * cosine - transform.offsetY * sine,
    y:finite(position.y) + transform.offsetX * sine + transform.offsetY * cosine,
    angleDeg
  };
}
