import {getGameDataRows} from './game-data-registry.js';

export function hasV39FacilityPrerequisites(village, definition) {
  const rows=getGameDataRows('施設'),byId=new Map(rows.map(row=>[row.施設ID,row]));
  return String(definition.前提施設ID||'').split('/').filter(Boolean).every(id=>{
    const row=byId.get(id);if(!row)return false;
    return row.分類==='拠点規模'?Number(village.scaleLevel||1)>=Number(row.規模Lv):
      (village.buildings||[]).includes(row.施設名);
  });
}
