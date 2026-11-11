import {applyV39SizChangeToDerived} from './v39-siz-status-rules.js';

const text=value=>String(value??'').trim();
const positive=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;

export function resolveV39TransformationSpec(skillRow={}) {
  if(!['変身','竜化'].includes(text(skillRow.系統)))return null;
  const token=text(skillRow.効果).split(/[\s,:：;；/／|｜、]+/u).find(value=>value==='変身'||value.startsWith('変身_'));
  if(!token)return null;
  const form=token==='変身'?'':token.slice(3);
  const fileName=text(skillRow.変身画像ファイル);
  const slotNumber=Number(skillRow.変身画像番号);
  const appearance=form&&fileName&&Number.isInteger(slotNumber)&&slotNumber>=1&&slotNumber<=12
    ?{form,fileName,slotNumber}:null;
  const fixed=positive(skillRow.変身SIZ);
  const multiplier=positive(skillRow.変身SIZ倍率);
  const sizeSpec=fixed&&multiplier?null:fixed?{mode:'fixed',value:fixed}:multiplier?{mode:'multiplier',value:multiplier}:null;
  return {form,appearance,sizeSpec};
}

export function resolveV39TransformedSiz(baseSiz,sizeSpec){
  const base=positive(baseSiz)||100;
  return sizeSpec?.mode==='fixed'?positive(sizeSpec.value)||base
    :sizeSpec?.mode==='multiplier'?Math.max(1,Math.round(base*(positive(sizeSpec.value)||1))):base;
}

export function resolveV39TransformationMaxHp(baseMaxHp,baseSiz,sizeSpec){
  if(!sizeSpec)return Math.max(1,Math.round(Number(baseMaxHp)||1));
  const nextSiz=resolveV39TransformedSiz(baseSiz,sizeSpec);
  return applyV39SizChangeToDerived({HP:Math.max(1,Number(baseMaxHp)||1)}, {},baseSiz,nextSiz).status.HP;
}

export function scaleV39TransformationHp(unit,newMaxHp){
  const oldMax=Math.max(1,Number(unit?.maxHp)||Number(unit?.status?.HP)||1);
  const maxHp=Math.max(1,Math.round(Number(newMaxHp)||oldMax));
  const hp=Math.max(0,Math.min(maxHp,Math.round((Number(unit?.hp??unit?.currentHp)||0)*maxHp/oldMax)));
  return {...unit,maxHp,hp,currentHp:hp};
}

export function replaceV39TransformationEffect(effects,nextEffect){
  return [...(Array.isArray(effects)?effects:[]).filter(effect=>effect?.stackGroup!=='transformation'&&effect?.skillName!==nextEffect.skillName),nextEffect];
}

export function resolveV39ActiveTransformationEffect(unit,state) {
  if(!unit?.id||!state)return null;
  const turn=Number(state.timeline?.turnNumber)||0;
  for(const player of state.players||[]){
    if(!(player.factionState?.units||[]).some(row=>text(row.id)===text(unit.id)))continue;
    const effects=player.factionState?.combatRuntime?.activeEffectsByUnitId?.[unit.id]||[];
    return effects.find(effect=>effect.stackGroup==='transformation'&&Number(effect.expiresAtTurn)>turn)||null;
  }
  return null;
}

export function resolveV39ActiveTransformationAppearance(unit,state){
  return resolveV39ActiveTransformationEffect(unit,state)?.appearance||null;
}

export function resolveV39TransformedUnitSiz(unit,state){
  const base=Number(unit?.status?.SIZ??unit?.SIZ)||100;
  return resolveV39TransformedSiz(base,resolveV39ActiveTransformationEffect(unit,state)?.sizeSpec);
}

