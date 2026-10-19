import sheetSource from '../../../assets/images/units/1ファイルまとめ/自然災害_アイコン一覧.webp';
import {resolveV39DisasterRule} from './v39-disaster-rules.js';

export function resolveV39DisasterIcon(event) {
  const rule=resolveV39DisasterRule(event?.disasterId);
  const file=event?.imageFile??rule?.imageFile;
  const slot=Number(event?.imageSlot??rule?.imageSlot);
  if(file!=='自然災害_アイコン一覧.webp'||!Number.isInteger(slot)||slot<1||slot>12)return null;
  return {src:sheetSource,textureKey:'v39-disaster-sheet',slot,columns:4,rows:3,
    column:(slot-1)%4,row:Math.floor((slot-1)/4)};
}
