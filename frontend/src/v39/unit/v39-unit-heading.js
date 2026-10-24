import {getFactionSettlements} from '../../lib/settlement-state.js';
import {getGameDataRows} from '../../lib/game-data-registry.js';

const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export function getV39UnitDisplayName(unit,name=unit?.name||unit?.id||'') {
  return unit?.summon?String(name).replace(/\s*[（(](?:施設)?召喚[）)]$/u,''):String(name);
}

export function renderV39UnitHeading(unit,{state}={}) {
  if(!unit)return '';
  const summon=unit.summon;
  let origin='';
  if(summon){
    state??=typeof window!=='undefined'?window.getV39GameState?.({includeWorlds:false}):null;
    const players=state?.players||[];
    if(summon.kind==='facility'){
      let baseId,chain;try{[baseId,chain]=JSON.parse(summon.slotKey||'[]');}catch{ /* Old/invalid keys still use the saved source name. */ }
      const base=players.flatMap(player=>getFactionSettlements(player.factionState)).find(base=>(base.settlementId||base.id)===baseId);
      const row=getGameDataRows('施設').find(row=>row.施設召喚枠ID===chain&&base?.buildings?.includes(row.施設名));
      const name=summon.facilityName||row?.施設名||'召喚施設',settlement=summon.settlementName||base?.name;
      origin=`召喚元：${name}${settlement?'／'+settlement:''}`;
    }else{
      const units=players.flatMap(player=>[...(player.factionState?.units||[]),...(player.factionState?.facilityStorage||[]).map(entry=>entry.unit),...(player.factionState?.deadUnitReserve||[]).map(entry=>entry.unit)]);
      const caster=units.find(candidate=>candidate?.id===summon.casterId);
      origin=`召喚者：${caster?getV39UnitDisplayName(caster):summon.casterName||'不明'}`;
    }
  }
  const name=getV39UnitDisplayName(unit);
  return `<div class="v39-unit-heading"><strong class="v39-unit-heading-name" title="${escape(name)}">${escape(name)}</strong>${origin?`<small class="v39-unit-heading-origin">${escape(origin)}</small>`:''}</div>`;
}
