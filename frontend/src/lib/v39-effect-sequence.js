import { normalizeV39EffectTransform } from './v39-effect-transform.js';
export const V39_EFFECT_STEP_OFFSET_LIMIT = 1024;
export const V39_EFFECT_SEQUENCE_LIMIT = 16;
const bounded = (value, min, max, fallback) => Number.isFinite(Number(value))
  ? Math.min(max, Math.max(min, Number(value))) : fallback;

export function normalizeV39EffectSequence(raw, catalog = []) {
  const available = new Set(catalog);
  return (Array.isArray(raw) ? raw : []).slice(0, V39_EFFECT_SEQUENCE_LIMIT).map(step => ({
    effectName:String(typeof step === 'string' ? step : step?.effectName || '').trim(),
    scalePercent:bounded(step?.scalePercent, 10, 400, 100),
    scaleXPercent:bounded(step?.scaleXPercent, 10, 400, 100),
    scaleYPercent:bounded(step?.scaleYPercent, 10, 400, 100),
    impactXPercent:bounded(step?.impactXPercent, 0, 100, 50),
    impactYPercent:bounded(step?.impactYPercent, 0, 100, 50),
    flipX:step?.flipX === true,
    flipY:step?.flipY === true,
    rotationDeg:bounded(step?.rotationDeg, -180, 180, 0),
    offsetX:bounded(step?.offsetX, -V39_EFFECT_STEP_OFFSET_LIMIT, V39_EFFECT_STEP_OFFSET_LIMIT, 0),
    offsetY:bounded(step?.offsetY, -V39_EFFECT_STEP_OFFSET_LIMIT, V39_EFFECT_STEP_OFFSET_LIMIT, 0)
  })).filter(step => step.effectName && (!available.size || available.has(step.effectName)));
}

export function resolveV39EffectSequence(setting = {}) {
  const steps = normalizeV39EffectSequence(setting.sequenceSteps);
  if (!steps.length) steps.push(...normalizeV39EffectSequence(
    String(setting.baseEffect || setting.sequenceName || '斬撃').split(':')));
  if (setting.decorationEffect) steps.push(...normalizeV39EffectSequence([{...setting.decorationTransform,effectName:setting.decorationEffect}]));
  return steps;
}

// Preview filtering never mutates the saved sequence or combat playback settings.
export function selectV39EffectPreviewSequence(descriptor, index, selectedOnly = false) {
  if (!descriptor || !selectedOnly || !Number.isInteger(index) || index < 0 || !descriptor.sequenceSources?.[index]) return descriptor;
  return { ...descriptor, sequenceSources:[descriptor.sequenceSources[index]] };
}
export function normalizeV39DecorationTransform(raw) {
  return raw && typeof raw === 'object' ? normalizeV39EffectSequence([{...raw,effectName:'decoration'}])[0] : undefined;
}

// Move shared values into each source using independent fixed-axis offsets.
export function migrateV39EffectTransformsToSteps(setting, catalog = []) {
  const common=normalizeV39EffectTransform(setting);
  if (!common.rotationDeg && !common.offsetX && !common.offsetY) return setting;
  const rounded=value=>Math.round(value*1e6)/1e6;
  const convert=step=>{
    return {...step,rotationDeg:((step.rotationDeg+common.rotationDeg+180)%360+360)%360-180,
      offsetX:rounded(step.offsetX+common.offsetX),
      offsetY:rounded(step.offsetY+common.offsetY)};
  };
  const steps=resolveV39EffectSequence({...setting,decorationEffect:''});
  return {...setting,rotationDeg:0,offsetX:0,offsetY:0,
    sequenceSteps:normalizeV39EffectSequence(steps.map(convert),catalog),
    decorationTransform:convert(normalizeV39DecorationTransform(setting.decorationTransform)||normalizeV39EffectSequence(['decoration'])[0])};
}
