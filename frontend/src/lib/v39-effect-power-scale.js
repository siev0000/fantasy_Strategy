import rules from '../../../config/v39-terrain-destruction.json';
const defaults=rules.effect;
export const isV39PowerEffectSkillEnabled=name=>!defaults.disabledSkillNames.includes(name);
export const V39_EFFECT_POWER_FIELDS=Object.freeze([
  {key:'referencePower',label:'基準威力',step:1},
  {key:'powerPerScale',label:'＋1倍ごとの威力',step:1},
  {key:'maximumScale',label:'最大倍率',step:0.1}
].map(field=>({...field,min:defaults.limits[field.key][0],max:defaults.limits[field.key][1]})));
export function normalizeV39EffectPowerScale(raw={}){
  return Object.fromEntries(V39_EFFECT_POWER_FIELDS.map(({key,min,max,step})=>{
    const value=raw?.[key],n=value==null||value===''?NaN:Number(value);
    const bounded=Math.max(min,Math.min(max,Number.isFinite(n)?n:defaults[key]));
    return [key,step===1?Math.round(bounded):Math.round(bounded*10)/10];
  }));
}
export const V39_EFFECT_POWER_DEFAULTS=Object.freeze(normalizeV39EffectPowerScale());
export function resolveV39PowerEffectScale(power,enabled=true,settings){
  if(!enabled)return 1;
  const r=normalizeV39EffectPowerScale(settings??globalThis.window?.getV39DisplaySettings?.()?.effectPowerScale);
  const n=Number(power),p=Number.isFinite(n)?Math.max(0,n):0;
  if(p<=0)return 1; // Support and unspecified-power previews retain their normal size.
  const scale=p<r.referencePower?p/r.referencePower:1+(p-r.referencePower)/r.powerPerScale;
  return Math.max(defaults.minimumScale,Math.min(r.maximumScale,scale));
}
export const resolveV39PowerAreaScale=(categoryScale,powerScale)=>Math.max(1,categoryScale)*powerScale;
