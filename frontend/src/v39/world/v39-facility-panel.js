import {getFactionSettlements} from '../../lib/settlement-state.js';
import {getGameDataRows} from '../../lib/game-data-registry.js';
import {getV39FacilitySummonSlots} from '../../lib/v39-facility-summoning.js';
import {resolveV39FacilitySummonCosts} from '../../lib/v39-facility-summon-costs.js';
import {formatV39SummonMaterials} from '../../lib/v39-summon-materials.js';
import {getV39DeathProtectionStatus} from '../../lib/v39-death-purification.js';
import {renderV39FacilityStorageButtons} from '../unit/v39-facility-storage-ui.js';
import './v39-facility-panel.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function getV39SettlementFacilities(state,playerId,base){
  if(!base)return [];
  const worldId=base.worldId||'surface';
  const rows=Object.entries(base.tileFacilityMap||{}).flatMap(([tileKey,names])=>(Array.isArray(names)?names:[]).map(name=>({
    id:JSON.stringify([worldId,tileKey,name]),tileKey,name,worldId,base,
    health:base.facilityStateByTile?.[tileKey]?.[name]
  })));
  // Older saves can contain a completed building before its tile was recorded.
  for(const name of base.buildings||[])if(!rows.some(row=>row.name===name))rows.push({id:JSON.stringify([base.settlementId,name]),name,worldId,base});
  return rows;
}
export function getV39LandFacility(state,playerId,tileKey){
  if(state.territoryOwnerByTile?.[tileKey]!==playerId)return null;
  const player=state.players?.find(row=>row.id===playerId);
  return getFactionSettlements(player?.factionState).flatMap(base=>getV39SettlementFacilities(state,playerId,base))
    .find(row=>row.tileKey===tileKey&&row.worldId===(state.activeWorldId||'surface'))||null;
}
export function renderV39FacilityOperations(state,playerId,facility){
  if(!facility)return '';
  const {base,name,tileKey,worldId,health}=facility;
  const row=getGameDataRows('施設').find(row=>row.施設名===name);
  const currentWorld=worldId===(state.activeWorldId||'surface');
  const owned=currentWorld&&tileKey&&state.territoryOwnerByTile?.[tileKey]===playerId;
  const slot=owned?getV39FacilitySummonSlots(state,playerId,base.settlementId||base.id).find(slot=>slot.tileKey===tileKey&&slot.row.施設名===name):null;
  const summon=slot?`<button type="button" class="settlement-chip" data-facility-summon-open="${esc(slot.id)}">施設召喚${slot.activeUnitIds.length?` · 活動中${slot.activeUnitIds.length}駒`:slot.remainingTurns?` · 残${slot.remainingTurns}T`:''}</button>`:'';
  const active=slot?state.players.find(player=>player.id===playerId)?.factionState.units.filter(unit=>slot.activeUnitIds.includes(unit.id))||[]:[];
  const upkeep=active.length?{...resolveV39FacilitySummonCosts(active[0]),goldCost:active.reduce((sum,unit)=>sum+resolveV39FacilitySummonCosts(unit).goldCost,0),
    materials:active.reduce((bag,unit)=>{for(const [name,amount] of Object.entries(unit.summon.upkeepMaterials||{}))bag[name]=(bag[name]||0)+amount;return bag;},{}),
    next:Math.min(...active.map(unit=>unit.summon.nextUpkeepTurn).filter(value=>value!=null))}:null;
  const storage=owned?renderV39FacilityStorageButtons(state,playerId,base,{tileKey,name}):'';
  const protection=name==='墓地'?getV39DeathProtectionStatus(window.__v39FieldRuntime?.mapData,state,playerId,base.settlementId||base.id):null;
  const queue=(base.constructionQueue||[]).filter(item=>item.tileKey===tileKey&&tileKey);
  return `<div class="v39-facility-operations" data-facility-detail="${esc(facility.id)}">
    ${health?`<p>HP ${Math.max(0,Math.round(health.hp||0))}/${Math.round(health.maxHp||100)}</p>`:''}
    ${queue.map(item=>`<p>改築中: ${esc(item.facilityName)} · 残${Math.max(0,Math.floor(item.remainingTurns||0))}T</p>`).join('')}
    ${protection?.capacity?`<p data-v39-cemetery-quota>死亡時の浄化保護 残り${protection.remaining}/${protection.capacity}件（このターン）</p>`:''}
    <div class="settlement-chip-list">${summon}${storage}</div>
    ${upkeep?`<p>召喚維持 ${upkeep.goldCost}金${formatV39SummonMaterials(upkeep.materials)?` ＋ ${esc(formatV39SummonMaterials(upkeep.materials))}`:''} / ${upkeep.upkeepIntervalTurns}Tごと${Number.isFinite(upkeep.next)?` / 次回T${upkeep.next}`:''}</p>`:''}
    ${row?.詳細?`<details class="v39-facility-description"><summary>施設効果</summary><p>${esc(row.詳細)}</p></details>`:''}
    ${!currentWorld?'<p>施設のあるマップで操作してください</p>':!tileKey?'<p>配置情報なし</p>':!owned?'<p>自軍の領土ではありません</p>':''}
  </div>`;
}
