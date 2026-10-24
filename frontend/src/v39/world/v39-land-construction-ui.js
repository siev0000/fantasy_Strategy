import {facilityDefinitions,inspectV39Construction,inspectV39SettlementDevelopment,terrainConditionMet} from '../../lib/v39-economy-rules.js';
import {getSettlementForTerritory} from '../../lib/settlement-state.js';
import {hasV39FacilityPrerequisites} from '../../lib/v39-facility-development-rules.js';
import {V39_CONSTRUCTION_CATEGORIES,getV39ConstructionCategories} from '../../lib/v39-construction-categories.js';
import {resolveFacilityIconArtwork} from '../../lib/facility-icon-artwork.js';
import {resolveSettlementArtwork} from '../../lib/map-entity-artwork.js';
import {resolveV39ResourceIconGlyph} from '../../lib/resource-icon-glyphs.js';
import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import './v39-land-construction-ui.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null;
let category='すべて';
const stateNow=()=>window.getV39GameState?.({includeWorlds:false});
function artwork(definition){
  const name=definition.name,art=definition.row.分類==='拠点規模'?resolveSettlementArtwork({scaleKey:definition.row.識別キー}):resolveFacilityIconArtwork(name),frame=art?.sheetFrame;
  return art?`<span class="v39-build-art" style="background-image:url(&quot;${esc(art.src)}&quot;);background-size:${frame?`${frame.columns*100}% ${frame.rows*100}%`:'contain'};background-position:${frame?`${frame.column/(frame.columns-1)*100}% ${frame.row/(frame.rows-1)*100}%`:'center'}" aria-hidden="true"></span>`
    :`<span class="v39-build-art v39-build-art-fallback" aria-hidden="true">${esc(name.slice(0,1))}</span>`;
}
function announcePreview(){window.dispatchEvent(new Event('v39:construction-preview-changed'));}
function close(){
  session=null;document.getElementById('v39-land-construction')?.remove();
  document.getElementById('footTile')?.classList.remove('is-construction-open');
  window.refreshV39LandDetail?.();announcePreview();
}
function valid(state){
  return session&&state?.activePlayerId===session.playerId&&(state.activeWorldId||'surface')===session.worldId
    &&state.timeline?.turnNumber===session.turn&&state.timeline?.phase==='player';
}
function render(){
  const state=stateNow();if(!valid(state)){close();return;}
  const player=state.players.find(row=>row.id===session.playerId),map=window.__v39FieldRuntime?.mapData;
  const key=`${session.tile.x},${session.tile.y}`;
  if(state.territoryOwnerByTile?.[key]!==player.id){close();return;}
  const definitions=facilityDefinitions({includeSettlementScales:true});
  const existing=state.facilitiesByTile?.[key]||[];
  const base=getSettlementForTerritory(player.factionState,state.territoryStateByTile?.[key]);
  const development=inspectV39SettlementDevelopment(state,player.id,base?.settlementId);
  const isScale=definition=>definition.row.分類==='拠点規模';
  const eligible=definitions.filter(definition=>{
    if(!base||!hasV39FacilityPrerequisites(base,definition.row))return false;
    if(isScale(definition))return !existing.length&&[development.current?.name,development.next?.name].includes(definition.name);
    const upgradeFrom=String(definition.row.改築元||'').trim();
    const upgradesFacility=upgradeFrom&&definitions.some(row=>row.name===upgradeFrom&&!isScale(row));
    if(upgradesFacility&&!existing.includes(upgradeFrom))return false;
    return terrainConditionMet(definition.terrainCondition,session.tile,map)&&(!existing.length||existing.includes(upgradeFrom));
  });
  const candidates=eligible.filter(definition=>getV39ConstructionCategories(definition).includes(category));
  const inspect=definition=>{
    if(!isScale(definition))return inspectV39Construction(state,player,definition,session.tile,map);
    const next=development.next?.name===definition.name;
    const reason=next?development.reason:development.current?.name===definition.name?'現在の拠点規模です':`住居は段階的に発展します${development.next?`。次は${development.next.name}です`:''}`;
    return {available:next&&development.available,reasons:reason?[reason]:[],village:development.village,levels:{},
      materialPayment:next?development.materialPayment:{cost:definition.cost},used:null,capacity:null};
  };
  if(!candidates.some(row=>row.name===session.facilityName)){
    session.facilityName=candidates.find(row=>inspect(row).available)?.name||candidates[0]?.name||'';
  }
  const checks=new Map(candidates.map(row=>[row.name,inspect(row)]));
  const selected=candidates.find(row=>row.name===session.facilityName),check=checks.get(session.facilityName);
  session.scaleSettlementId=selected&&isScale(selected)?base?.settlementId:null;
  session.preview=selected?{tileKey:key,facilityName:selected.name,worldId:session.worldId,...(isScale(selected)?{settlementType:selected.name}:{})}:null;
  const costs=Object.entries(check?.materialPayment?.cost||selected?.cost||{}).filter(([,amount])=>amount>0);
  const materials=costs.map(([name,amount])=>`<span class="v39-build-material${Number(check?.village?.materialStockByType?.[name]||0)<amount?' shortage':''}" title="${esc(name)}"><span aria-hidden="true">${esc(resolveV39ResourceIconGlyph(name))}</span><span>${esc(name)}</span><b>${amount}</b><small>所持 ${Number(check?.village?.materialStockByType?.[name]||0).toLocaleString('ja-JP')}</small></span>`).join('')||'<span>なし</span>';
  let host=document.getElementById('v39-land-construction');
  if(!host){host=document.createElement('section');host.id='v39-land-construction';document.getElementById('footTile')?.append(host);}
  document.getElementById('footTile')?.classList.add('is-construction-open');
  const changed=host.dataset.selectedFacility!==session.facilityName;
  updateV39RetainedMarkup(host,`<header><button type="button" data-land-construction-back>← 戻る</button><strong>建築</strong><select data-land-build-category aria-label="建築カテゴリ">${V39_CONSTRUCTION_CATEGORIES.map(name=>`<option value="${name}"${name===category?' selected':''}>${name}</option>`).join('')}</select><span>(${session.tile.x},${session.tile.y})</span></header>
    <div class="v39-land-build-panes"><nav aria-label="建築施設" class="v39-land-build-list">${candidates.map(definition=>`<button type="button" data-land-build-facility="${esc(definition.name)}" aria-pressed="${definition.name===session.facilityName}" class="${checks.get(definition.name).available?'':'unavailable'}">${artwork(definition)}<strong>${esc(definition.name)}</strong></button>`).join('')||'<p>このカテゴリで建築・改築できる施設はありません</p>'}</nav>
    <section class="v39-land-build-detail" aria-label="施設詳細">${selected?`<h3>${esc(selected.name)}</h3><p>${esc(selected.description)}</p><dl>
      <div><dt>工期</dt><dd>${selected.buildTurns}ターン</dd></div><div><dt>維持費</dt><dd>なし（現行仕様）</dd></div>
      <div><dt>所属拠点</dt><dd>${esc(check.village?.name||'拠点')}</dd></div>${isScale(selected)?'<div><dt>建築方法</dt><dd>拠点発展で拡張位置を選択します。</dd></div>':`<div><dt>施設枠</dt><dd>${check.used}/${check.capacity}</dd></div>`}
      ${Number(selected.row['1マス収容人数'])>0?`<div><dt>1マス収容人数</dt><dd>${Number(selected.row['1マス収容人数'])}人</dd></div>`:''}
      <div><dt>必要研究</dt><dd>${esc(Object.entries(selected.requirements).map(([name,level])=>`${name} ${check.levels[name]||0}/${level}`).join(' / ')||'なし')}${check.researchCheck?.mode==='item'?`<br>${esc(check.researchCheck.requirements.map(row=>`${row.name}：${row.completed?'完了':'未完了'}`).join(' / '))}`:''}</dd></div>
      <div><dt>前提施設</dt><dd>${esc(selected.row.前提施設||'なし')}</dd></div>
      <div><dt>必要素材</dt><dd class="v39-build-materials">${materials}</dd></div>
      ${(check.materialPayment?.substitutions||[]).length?`<div><dt>素材の代替</dt><dd>${check.materialPayment.substitutions.map(row=>`${esc(row.source)}不足${row.missing} → ${esc(row.resource)} ${row.amount}`).join('<br>')}</dd></div>`:''}
    </dl>${check.reasons.length?`<div class="v39-land-build-blocked"><h4>建築できない理由</h4>${check.reasons.map(reason=>`<p>${esc(reason)}</p>`).join('')}</div>`:''}`:'<p>施設を選択してください</p>'}</section></div>
    <footer><p role="status" title="${esc(session.message||check?.reasons.join(' / ')||'')}">${esc(session.message||(!selected?'候補なし':check.available?'建築できます':check.reasons[0]))}</p><button type="button" data-land-construction-start${check?.available?'':' disabled'}>${session.scaleSettlementId?'拠点発展へ':check?.replacesFacilityName?'改築開始':'建築開始'}</button></footer>`);
  if(changed)host.querySelector('.v39-land-build-detail').scrollTop=0;
  host.dataset.selectedFacility=session.facilityName;
  announcePreview();
}
function open(tile=window.getV39SelectedLandDetail?.()){
  const state=stateNow();
  if(!tile||!Number.isInteger(tile.x)||!Number.isInteger(tile.y)){
    window.activateV39FooterTab?.('tile');window.showV39TurnBanner?.('建築する土地を選択してください');return false;
  }
  if(state?.timeline?.phase!=='player'||state?.territoryOwnerByTile?.[`${tile.x},${tile.y}`]!==state.activePlayerId){
    window.showV39TurnBanner?.('自分のターンに自領の土地を選択してください');return false;
  }
  if((state.activeWorldId||'surface')!=='surface'){
    window.showV39TurnBanner?.('施設建築は地上の土地で行ってください');return false;
  }
  document.getElementById('buildModal')?.classList.remove('open');
  window.cancelV39SelectedUnitAttack?.('construction-selected');window.cancelV39SelectedUnitMove?.();
  session={playerId:state.activePlayerId,worldId:state.activeWorldId||'surface',turn:state.timeline.turnNumber,tile:{x:tile.x,y:tile.y}};
  window.activateV39FooterTab?.('tile');render();return true;
}
document.addEventListener('click',event=>{
  const el=event.target instanceof Element?event.target:null;
  if(el?.closest('[data-land-construction-open]')){open();return;}
  if(el?.closest('[data-land-construction-back]')){close();return;}
  const candidate=el?.closest('[data-land-build-facility]');
  if(candidate&&session){session.facilityName=candidate.dataset.landBuildFacility;session.message='';render();return;}
  if(el?.closest('[data-land-construction-start]')&&session){
    if(!valid(stateNow())){close();return;}
    if(session.scaleSettlementId){const id=session.scaleSettlementId;close();window.openV39SettlementDevelopment?.(id);return;}
    const result=window.startV39Construction?.(session.facilityName,session.tile);
    if(result?.ok)close();else if(session){session.message=result?.reason||'';render();}
  }
});
document.addEventListener('change',event=>{
  if(session&&event.target instanceof HTMLSelectElement&&event.target.matches('[data-land-build-category]')){
    category=event.target.value;session.message='';render();
    document.querySelector('#v39-land-construction .v39-land-build-list').scrollTop=0;
  }
});
window.addEventListener('v39:footer-tab-changed',event=>{if(session&&event.detail?.tab!=='tile')close();});
window.addEventListener('v39:tile-selected',event=>{
  if(session&&(event.detail?.x!==session.tile.x||event.detail?.y!==session.tile.y))close();
});
window.addEventListener('v39:game-state-changed',event=>{if(session&&event.detail?.reason!=='activity-log')render();});
for(const name of ['v39:field-generated','v39:save-loaded'])window.addEventListener(name,()=>{if(session)close();});
window.addEventListener('keydown',event=>{if(session&&event.key==='Escape')close();});
window.openV39LandConstruction=open;
window.getV39LandConstructionPreview=()=>session&&valid(stateNow())?session.preview:null;
