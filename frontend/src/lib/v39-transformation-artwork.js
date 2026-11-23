import {resolveMonsterSheetFrame} from './monster-sheet-artwork.js';
import {resolveV39ActiveTransformationEffect} from './v39-transformation.js';
import {resolveV39NamedUnitArtwork} from './v39-named-unit-artwork.js';

export function resolveV39ActiveTransformationArtwork(unit,state,{normal=false}={}){
  const effect=resolveV39ActiveTransformationEffect(unit,state);
  if (!effect) return null;
  const named=effect.skillName && resolveV39NamedUnitArtwork(unit,{normal,transformationSkillName:effect.skillName,state});
  if (named) return named;
  const appearance=effect.appearance;
  return appearance?resolveMonsterSheetFrame(appearance.fileName,appearance.slotNumber):null;
}
