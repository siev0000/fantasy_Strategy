import {renderV39OperationPlans,renderV39TerritoryGuide} from './v39-operation-plan-ui.js';
import {usesV39OperationPhases,isV39TerritoryPhase} from '../../lib/v39-operation-phases.js';
import {facilityDefinitions,inspectV39Construction,inspectV39SettlementDevelopment,terrainConditionMet,inspectV39WallConstruction,currentDevelopmentOccupiedTiles} from '../../lib/v39-economy-rules.js';
import {collectV39WallOuterEdges,v39WallEdgeKey,resolveV39WallEdgeSegment,orderV39WallConstructionEdges} from '../../lib/v39-wall-edges.js';
import {v39DefenseNeighbors} from '../../lib/v39-defense-rules.js';
import {V39_DEFENSE_BALANCE} from '../../lib/v39-gameplay-balance.js';
import {HEX_TILE_CONFIG} from '../../lib/phaser-map-panel-config.js';
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
const isWall=definition=>!!V39_DEFENSE_BALANCE.facilityWalls[definition?.name];
const centerAt=(x,y)=>({x:x*HEX_TILE_CONFIG.width+(y%2?HEX_TILE_CONFIG.oddRowOffsetX:0)+HEX_TILE_CONFIG.width/2,y:y*HEX_TILE_CONFIG.rowStep+HEX_TILE_CONFIG.height/2});
function toggleEdge(edge){
  if(session.wallMode==='start'){
    if(session.edges.some(row=>v39WallEdgeKey(row)===v39WallEdgeKey(edge))){session.startEdgeKey=v39WallEdgeKey(edge);session.message='開始辺を指定しました（水色の点）';}
    else session.message='選択済みの壁の辺を選んでください';
    render();return;
  }
  const key=v39WallEdgeKey(edge),index=session.edges.findIndex(item=>v39WallEdgeKey(item)===key);
  if(index>=0)session.edges.splice(index,1);else session.edges.push(edge);
  if(!session.edges.some(row=>v39WallEdgeKey(row)===session.startEdgeKey))session.startEdgeKey='';
  session.message='';render();
}
function setWallTiles(tiles){
  session.wallTiles=tiles;session.edges=collectV39WallOuterEdges(tiles,window.__v39FieldRuntime?.mapData);
  session.startEdgeKey='';session.message='';
}
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
  const planning=usesV39OperationPhases(state),territoryPhase=isV39TerritoryPhase(state);
  const plannedBase=territoryPhase?(player.factionState.settlements||[]).find(base=>(base.operationPlans||[]).some(plan=>plan.kind==='expansion'&&`${plan.tile.x},${plan.tile.y}`===key)||base.landExpansionProjects?.some(plan=>plan.tileKey===key)):null;
  const ownTile=state.territoryOwnerByTile?.[key]===player.id||!!plannedBase;
  const ownershipNotice=ownTile?'':state.territoryOwnerByTile?.[key]?'他勢力の領土には建築できません。自領を選択してください。':'未所属の土地には建築できません。領土にするか、自領を選択してください。';
  const definitions=facilityDefinitions({includeSettlementScales:true});
  const existing=state.facilitiesByTile?.[key]||[];
  const base=plannedBase||getSettlementForTerritory(player.factionState,state.territoryStateByTile?.[key]);
  const development=inspectV39SettlementDevelopment(state,player.id,base?.settlementId);
  const isScale=definition=>definition.row.分類==='拠点規模';
  const eligible=definitions.filter(definition=>{
    const walls=(map?.defenseStructures||[]).filter(w=>w.hp>0&&w.ownerId===player.id&&w.settlementId===base?.settlementId).map(w=>w.wallFacilityName||w.facilityName);
    if(!base||!hasV39FacilityPrerequisites(base,definition.row,walls))return false;
    if(isScale(definition))return !existing.length&&[development.current?.name,development.next?.name].includes(definition.name);
    if(isWall(definition))return terrainConditionMet(definition.terrainCondition,session.tile,map);
    const upgradeFrom=String(definition.row.改築元||'').trim();
    const upgradesFacility=upgradeFrom&&definitions.some(row=>row.name===upgradeFrom&&!isScale(row));
    if(upgradesFacility&&!existing.includes(upgradeFrom))return false;
    return terrainConditionMet(definition.terrainCondition,session.tile,map)&&(!existing.length||existing.includes(upgradeFrom));
  });
  const candidates=eligible.filter(definition=>getV39ConstructionCategories(definition).includes(category));
  const inspect=definition=>{
    if(isWall(definition)){
      const edges=session.edges.length?session.edges:[{from:session.tile,to:v39DefenseNeighbors(session.tile)[0]}];
      const check=inspectV39WallConstruction(state,player,definition,edges,map);
      return session.edges.length?check:{...check,available:false,reasons:['建築する辺を選択してください',...check.reasons]};
    }
    if(!isScale(definition))return inspectV39Construction(state,player,definition,session.tile,map);
    const next=development.next?.name===definition.name;
    const reason=next?development.reason:development.current?.name===definition.name?'現在の拠点規模です':`住居は段階的に発展します${development.next?`。次は${development.next.name}です`:''}`;
    return {available:next&&development.available,reasons:reason?[reason]:[],village:development.village,levels:{},
      materialPayment:next?development.materialPayment:{cost:definition.cost},used:null,capacity:null};
  };
  if(!candidates.some(row=>row.name===session.facilityName)){
    session.facilityName=candidates.find(row=>inspect(row).available)?.name||candidates[0]?.name||'';
  }
  if(ownTile&&V39_DEFENSE_BALANCE.facilityWalls[session.facilityName]&&!session.wallMode){
    session.wallMode='tiles';session.wallSettlementId=base?.settlementId;setWallTiles([{...session.tile}]);
  }
  const checks=new Map(candidates.map(row=>{
    const check=inspect(row);return [row.name,ownTile?{...check,available:(!planning||territoryPhase)&&(check.available||(planning&&(!isScale(row)||(row.name===development.next?.name&&!base.developmentProject))))}:{...check,available:false,reasons:[ownershipNotice,...check.reasons]}];
  }));
  const selected=candidates.find(row=>row.name===session.facilityName),check=checks.get(session.facilityName);
  session.scaleSettlementId=ownTile&&selected&&isScale(selected)?base?.settlementId:null;
  const orderedEdges=orderV39WallConstructionEdges(session.edges,session.startEdgeKey||undefined);
  session.preview=ownTile&&selected?{tileKey:key,facilityName:selected.name,worldId:session.worldId,...(isWall(selected)?{edges:orderedEdges,wallTiles:session.wallTiles||[],startEdgeKey:orderedEdges[0]&&v39WallEdgeKey(orderedEdges[0])}:{}),...(isScale(selected)?{settlementType:selected.name}:{})}:null;
  const costs=Object.entries(check?.materialPayment?.cost||selected?.cost||{}).filter(([,amount])=>amount>0);
  const materials=costs.map(([name,amount])=>`<span class="v39-build-material${Number(check?.village?.materialStockByType?.[name]||0)<amount?' shortage':''}" title="${esc(name)}"><span aria-hidden="true">${esc(resolveV39ResourceIconGlyph(name))}</span><span>${esc(name)}</span><b>${amount}</b><small>所持 ${Number(check?.village?.materialStockByType?.[name]||0).toLocaleString('ja-JP')}</small></span>`).join('')||'<span>なし</span>';
  let host=document.getElementById('v39-land-construction');
  if(!host){host=document.createElement('section');host.id='v39-land-construction';document.getElementById('footTile')?.append(host);}
  document.getElementById('footTile')?.classList.add('is-construction-open');
  const changed=host.dataset.selectedFacility!==session.facilityName;
  updateV39RetainedMarkup(host,`<header>${planning&&territoryPhase?renderV39TerritoryGuide(state,'construction'):''}<button type="button" data-land-construction-back>${planning?'← 拠点へ':'← 戻る'}</button><strong>建築</strong><select data-land-build-category aria-label="建築カテゴリ">${V39_CONSTRUCTION_CATEGORIES.map(name=>`<option value="${name}"${name===category?' selected':''}>${name}</option>`).join('')}</select><span>(${session.tile.x},${session.tile.y})</span></header>
    <div class="v39-land-build-panes"><nav aria-label="建築施設" class="v39-land-build-list">${candidates.map(definition=>`<button type="button" data-land-build-facility="${esc(definition.name)}" aria-pressed="${definition.name===session.facilityName}" class="${checks.get(definition.name).available?'':'unavailable'}">${artwork(definition)}<strong>${esc(definition.name)}</strong></button>`).join('')||'<p>このカテゴリで建築・改築できる施設はありません</p>'}</nav>
    <section class="v39-land-build-detail" aria-label="施設詳細">${selected?`<h3>${esc(selected.name)}</h3><p>${esc(selected.description)}</p>${isWall(selected)?`<div class="v39-wall-selection"><div class="v39-wall-directions">${[["tiles","囲むマス"],["edges","辺を調整"],["start","開始辺"]].map(([mode,label])=>`<button type="button" data-wall-mode="${mode}" aria-pressed="${session.wallMode===mode}">${label}</button>`).join("")}</div><p>${session.wallMode==="tiles"?"囲む自領のマスをタップして追加・解除":session.wallMode==="start"?"最初に建てる辺をタップ（水色の点）":"辺をタップして追加・除外"}／${session.wallTiles?.length||0}マス・${session.edges.length}辺</p><button type="button" data-wall-perimeter>都市外周を選択</button><button type="button" data-wall-clear>選択解除</button><div class="v39-wall-directions">${v39DefenseNeighbors(session.tile).map((to,i)=>`<button type="button" data-wall-direction="${i}" aria-pressed="${session.edges.some(edge=>v39WallEdgeKey(edge)===v39WallEdgeKey({from:session.tile,to}))}">${['左上','右上','右','右下','左下','左'][i]}</button>`).join('')}</div></div>`:''}<dl>
      <div><dt>工期</dt><dd>${isWall(selected)?`1辺 ${check.buildTurns??selected.buildTurns}T / 完成まで ${session.edges.length*(check.buildTurns??selected.buildTurns)+(check.village?.wallConstructionQueue||[]).reduce((sum,item)=>sum+item.remainingTurns,0)}T（先行工事込み）`:`${check.buildTurns??selected.buildTurns}ターン`}</dd></div><div><dt>必要素材</dt><dd class="v39-build-materials">${materials}</dd></div><div><dt>維持費</dt><dd>なし（現行仕様）</dd></div>
      <div><dt>所属拠点</dt><dd>${esc(ownTile?(check.village?.name||'拠点'):'対象外')}</dd></div>${isWall(selected)?`<div><dt>建築単位</dt><dd>1辺ごとに費用・工期・HP（HP${V39_DEFENSE_BALANCE.facilityWalls[selected.name].hp}）／味方の移動AP+${Number(selected.row.味方通行AP増加率)||0}%</dd></div><div><dt>内壁の不便</dt><dd>住居間の壁1辺で幸福度−${Number(selected.row.内壁幸福度低下)||0}（拠点上限−${Number(selected.row.内壁幸福度低下上限)||0}）。外周壁は対象外。</dd></div>`:isScale(selected)?'<div><dt>建築方法</dt><dd>拠点発展で拡張位置を選択します。</dd></div>':`<div><dt>同施設の上限</dt><dd>${check.limit>0?`${check.sameCount}/${check.limit}（建設中含む）`:"なし"}</dd></div>`}
      ${Number(selected.row['1マス収容人数'])>0?`<div><dt>1マス収容人数</dt><dd>${Number(selected.row['1マス収容人数'])}人</dd></div>`:''}
      <div><dt>必要研究</dt><dd>${esc(Object.entries(selected.requirements).map(([name,level])=>`${name} ${check.levels[name]||0}/${level}`).join(' / ')||'なし')}${check.researchCheck?.mode==='item'?`<br>${esc(check.researchCheck.requirements.map(row=>`${row.name}：${row.completed?'完了':'未完了'}`).join(' / '))}`:''}</dd></div>
      <div><dt>前提施設</dt><dd>${esc(selected.row.前提施設||'なし')}</dd></div>

      ${(check.materialPayment?.substitutions||[]).length?`<div><dt>素材の代替</dt><dd>${check.materialPayment.substitutions.map(row=>`${esc(row.source)}不足${row.missing} → ${esc(row.resource)} ${row.amount}`).join('<br>')}</dd></div>`:''}
    </dl>${check.reasons.length?`<div class="v39-land-build-blocked"><h4>建築できない理由</h4>${check.reasons.map(reason=>`<p>${esc(reason)}</p>`).join('')}</div>`:''}`:'<p>施設を選択してください</p>'}${planning&&base?`<section class="v39-build-plan-order"><h3>建設順</h3>${renderV39OperationPlans(state,player,base,{scope:'construction',showFinish:false})}</section>`:''}</section></div>
    <footer><p role="status" title="${esc(ownershipNotice||session.message||check?.reasons.join(' / ')||'')}">${esc(ownershipNotice||session.message||(!selected?'候補なし':check.available?(planning?'資材は着手時に消費します':'建築できます'):planning&&!territoryPhase?'領土運営フェーズで予約してください':check.reasons[0]))}</p><button type="button" data-land-construction-start${ownTile&&check?.available?'':' disabled'}>${session.scaleSettlementId?'拠点発展へ':planning?'計画に追加':check?.replacesFacilityName?'改築開始':'建築開始'}</button></footer>`);
  if(changed)host.querySelector('.v39-land-build-detail').scrollTop=0;
  host.dataset.selectedFacility=session.facilityName;
  announcePreview();
}
function open(tile=window.getV39SelectedLandDetail?.(),{facilityName=''}={}){
  if(facilityName)category='すべて';
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
  session={playerId:state.activePlayerId,worldId:state.activeWorldId||'surface',turn:state.timeline.turnNumber,tile:{x:tile.x,y:tile.y},edges:[],facilityName};
  window.activateV39FooterTab?.('tile');render();return true;
}
document.addEventListener('click',event=>{
  const el=event.target instanceof Element?event.target:null;
  if(el?.closest('[data-land-construction-open]')){open();return;}
  if(el?.closest('[data-land-construction-back]')){const planning=usesV39OperationPhases(stateNow());close();if(planning)window.openV39SettlementConstructionPlans?.();return;}
  const wallMode=el?.closest('[data-wall-mode]');
  if(wallMode&&session){session.wallMode=wallMode.dataset.wallMode;session.message='';render();return;}
  const direction=el?.closest('[data-wall-direction]');
  if(direction&&session){if(session.wallMode==='tiles')session.wallMode='edges';toggleEdge({from:{...session.tile},to:v39DefenseNeighbors(session.tile)[Number(direction.dataset.wallDirection)]});return;}
  if(el?.closest('[data-wall-clear]')&&session){setWallTiles([]);render();return;}
  if(el?.closest('[data-wall-perimeter]')&&session){
    const state=stateNow(),player=state.players.find(p=>p.id===session.playerId);
    const base=getSettlementForTerritory(player.factionState,state.territoryStateByTile?.[`${session.tile.x},${session.tile.y}`]);
    setWallTiles(currentDevelopmentOccupiedTiles(base).map(key=>{const [x,y]=key.split(',').map(Number);return {x,y};}));session.wallMode='edges';
    render();return;
  }
  const candidate=el?.closest('[data-land-build-facility]');
  if(candidate&&session){session.facilityName=candidate.dataset.landBuildFacility;session.message='';render();return;}
  if(el?.closest('[data-land-construction-start]')&&session){
    if(!valid(stateNow())){close();return;}
    if(!usesV39OperationPhases(stateNow())&&stateNow().territoryOwnerByTile?.[`${session.tile.x},${session.tile.y}`]!==session.playerId){render();return;}
    if(session.scaleSettlementId){const id=session.scaleSettlementId;close();window.openV39SettlementDevelopment?.(id);return;}
    const result=V39_DEFENSE_BALANCE.facilityWalls[session.facilityName]
      ?window.startV39WallConstruction?.(session.facilityName,orderV39WallConstructionEdges(session.edges,session.startEdgeKey||undefined)):window.startV39Construction?.(session.facilityName,session.tile);
    if(result?.ok&&result.plan){session.message='建設順に追加しました。続けて施設・土地を選べます。';render();}
    else if(result?.ok)close();else if(session){session.message=result?.reason||'';render();}
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
  if(session&&(event.detail?.x!==session.tile.x||event.detail?.y!==session.tile.y)){
    if(!Number.isInteger(event.detail?.x)||!Number.isInteger(event.detail?.y))return;
    session.tile={x:event.detail.x,y:event.detail.y};session.message='';render();
  }
});
window.addEventListener('v39:game-state-changed',event=>{if(session&&event.detail?.reason!=='activity-log')render();});
for(const name of ['v39:field-generated','v39:save-loaded'])window.addEventListener(name,()=>{if(session)close();});
window.addEventListener('keydown',event=>{if(session&&event.key==='Escape')close();});
window.openV39LandConstruction=open;
window.isV39LandConstructionOpen=()=>!!session&&!!valid(stateNow());
window.getV39LandConstructionPreview=()=>session&&valid(stateNow())?session.preview:null;
window.handleV39WallConstructionTap=(tile,point)=>{
  if(!session||!valid(stateNow())||!V39_DEFENSE_BALANCE.facilityWalls[session.facilityName])return false;
  const state=stateNow(),map=window.__v39FieldRuntime?.mapData;
  if(session.wallMode==='tiles'){
    const player=state.players.find(p=>p.id===session.playerId),key=`${tile.x},${tile.y}`;
    const base=plannedBase||getSettlementForTerritory(player.factionState,state.territoryStateByTile?.[key]);
    if(state.territoryOwnerByTile?.[key]!==session.playerId){
      session.tile={x:tile.x,y:tile.y};render();return true;
    }
    if(base?.settlementId!==session.wallSettlementId){
      session.tile={x:tile.x,y:tile.y};session.wallSettlementId=base?.settlementId;setWallTiles([{...session.tile}]);render();return true;
    }
    const tiles=[...(session.wallTiles||[])],index=tiles.findIndex(p=>p.x===tile.x&&p.y===tile.y);
    if(index>=0)tiles.splice(index,1);else tiles.push({x:tile.x,y:tile.y});
    session.tile={x:tile.x,y:tile.y};setWallTiles(tiles);render();return true;
  }
  const candidates=v39DefenseNeighbors(tile).map(to=>({from:{x:tile.x,y:tile.y},to}));
  const distance=edge=>{const [a,b]=resolveV39WallEdgeSegment(edge,centerAt,HEX_TILE_CONFIG);return Math.hypot((a.x+b.x)/2-point.x,(a.y+b.y)/2-point.y);};
  const edge=candidates.sort((a,b)=>distance(a)-distance(b))[0];
  if(state.territoryOwnerByTile?.[`${edge.from.x},${edge.from.y}`]!==session.playerId){
    [edge.from,edge.to]=[edge.to,edge.from];
  }
  if(!map.grid?.[edge.to.y]?.[edge.to.x]||state.territoryOwnerByTile?.[`${edge.from.x},${edge.from.y}`]!==session.playerId){
    session.tile={x:tile.x,y:tile.y};session.message='自領に接する辺を選択してください';render();return true;
  }
  session.tile={...edge.from};toggleEdge(edge);return true;
};
