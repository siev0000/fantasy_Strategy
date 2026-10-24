import {getGameDataRows} from './game-data-registry.js';

export function hasV39FacilityPrerequisites(village, definition) {
  const rows=getGameDataRows('施設'),byName=new Map(rows.map(row=>[row.施設名,row]));
  return String(definition.前提施設||'').split('/').map(name=>name.trim()).filter(Boolean).every(name=>{
    const row=byName.get(name);if(!row)return false;
    if(row.分類==='拠点規模')return Number(village.scaleLevel||1)>=Number(row.規模Lv);
    if((village.buildings||[]).includes(row.施設名))return true;
    return !!row.施設召喚枠ID&&rows.some(candidate=>candidate.施設召喚枠ID===row.施設召喚枠ID
      &&Number(candidate.召喚上限Lv)>=Number(row.召喚上限Lv)&&(village.buildings||[]).includes(candidate.施設名));
  });
}
