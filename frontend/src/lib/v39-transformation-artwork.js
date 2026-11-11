import {resolveMonsterSheetFrame} from './monster-sheet-artwork.js';
import {resolveV39ActiveTransformationAppearance} from './v39-transformation.js';

export function resolveV39ActiveTransformationArtwork(unit,state){
  const appearance=resolveV39ActiveTransformationAppearance(unit,state);
  return appearance?resolveMonsterSheetFrame(appearance.fileName,appearance.slotNumber):null;
}
