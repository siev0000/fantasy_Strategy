import {renderV39ResourceIcon} from "../ui/v39-resource-item-icon.js";
import {getV39ConstructionPlans,renderV39ConstructionMaterialTotals,renderV39OperationPlans} from './v39-operation-plan-ui.js';
import {usesV39OperationPhases,isV39TerritoryPhase} from '../../lib/v39-operation-phases.js';
import {facilityDefinitions,inspectV39Construction,inspectV39SettlementDevelopment,terrainConditionMet,inspectV39WallConstruction,currentDevelopmentOccupiedTiles} from '../../lib/v39-economy-rules.js';
import {collectV39WallOuterEdges,v39WallEdgeKey,resolveV39WallEdgeSegment,orderV39WallConstructionEdges} from '../../lib/v39-wall-edges.js';
import {v39DefenseNeighbors} from '../../lib/v39-defense-rules.js';
import {V39_DEFENSE_BALANCE} from '../../lib/v39-gameplay-balance.js';
import {HEX_TILE_CONFIG} from '../../lib/phaser-map-panel-config.js';
import {getSelectedSettlement,getSettlementForTerritory} from '../../lib/settlement-state.js';
import {hasV39FacilityPrerequisites} from '../../lib/v39-facility-development-rules.js';
import {V39_CONSTRUCTION_CATEGORIES,getV39ConstructionCategories} from '../../lib/v39-construction-categories.js';
import {resolveFacilityIconArtwork} from '../../lib/facility-icon-artwork.js';
import {resolveSettlementArtwork} from '../../lib/map-entity-artwork.js';
import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import {renderV39ScreenHelp,renderV39ScreenHelpContent} from '../ui/v39-screen-help.js';
import {V39_SCREEN_HELP_COPY} from '../ui/v39-screen-help-copy.js';
import './v39-land-construction-ui.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null;
let category='すべて';
let placementGuides;
let placementGuideSignature='';
const isWall=definition=>!!V39_DEFENSE_BALANCE.facilityWalls[definition?.name];
const isScale=definition=>definition?.row?.分類==='拠点規模';
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
  drawPlacementGuides([]);
  window.refreshV39LandDetail?.();announcePreview();
}
function valid(state){
  return session&&state?.activePlayerId===session.playerId&&(state.activeWorldId||'surface')===session.worldId
    &&state.timeline?.turnNumber===session.turn&&state.timeline?.phase==='player';
}

function getPlannedSites(player,enabled){
  const sites=new Map();
  if(!enabled)return sites;
  for(const base of player.factionState.settlements||[]){
    for(const plan of base.operationPlans||[])if(plan.kind==='expansion')sites.set(`${plan.tile.x},${plan.tile.y}`,base);
    for(const project of base.landExpansionProjects||[])sites.set(project.tileKey,base);
  }
  return sites;
}

function drawPlacementGuides(tiles){
  const runtime=window.__v39FieldRuntime,scene=runtime?.game?.scene?.getScenes(true)?.[0];
  const signature=tiles.join(';');
  if(signature===placementGuideSignature&&(!signature||placementGuides?.scene===scene))return;
  placementGuides?.destroy();
  placementGuides=null;
  placementGuideSignature=signature;
  if(scene&&tiles.length){
    placementGuides=scene.add.graphics().setDepth(19);
    placementGuides.fillStyle(0x73deeb,.24).lineStyle(2,0x73deeb,.95);
    const {width,height,rowStep}=HEX_TILE_CONFIG;
    const corners=[[0,-height/2],[width/2,height/2-rowStep],[width/2,rowStep-height/2],
      [0,height/2],[-width/2,rowStep-height/2],[-width/2,height/2-rowStep]];
    for(const key of tiles){
      const [x,y]=key.split(',').map(Number),center=centerAt(x,y);
      const points=corners.map(([dx,dy])=>({x:center.x+dx,y:center.y+dy}));
      placementGuides.fillPoints(points,true);
      placementGuides.strokePoints(points,true);
    }
  }
  runtime?.game?.v39InvalidateRender?.();
}

function render(){
  const state=stateNow();if(!valid(state)){close();return;}
  const editor=window.v39FixedMapPlacement;
  const player=state.players.find(row=>row.id===session.playerId),map=window.__v39FieldRuntime?.mapData;
  const tile=session.tile;
  const key=tile?`${tile.x},${tile.y}`:'';
  const planning=!editor&&usesV39OperationPhases(state),territoryPhase=!editor&&isV39TerritoryPhase(state);
  const plannedSites=getPlannedSites(player,territoryPhase);
  const plannedBase=plannedSites.get(key);
  const ownTile=state.territoryOwnerByTile?.[key]===player.id||!!plannedBase;
  const ownershipNotice=!tile||ownTile?'':state.territoryOwnerByTile?.[key]?'他勢力の領土には建築できません。自領を選択してください。':'未所属の土地には建築できません。領土にするか、自領を選択してください。';
  const definitions=facilityDefinitions({includeSettlementScales:true});
  const existing=state.facilitiesByTile?.[key]||[];
  const base=tile?(plannedBase||getSettlementForTerritory(player.factionState,state.territoryStateByTile?.[key])):getSelectedSettlement(player.factionState);
  const development=tile?inspectV39SettlementDevelopment(state,player.id,base?.settlementId):null;
  const wallsByBase=new Map();
  for(const wall of map?.defenseStructures||[]){
    if(wall.hp<=0||wall.ownerId!==player.id)continue;
    if(!wallsByBase.has(wall.settlementId))wallsByBase.set(wall.settlementId,[]);
    wallsByBase.get(wall.settlementId).push(wall.wallFacilityName||wall.facilityName);
  }
  const fitsSite=(definition,site,siteBase,siteFacilities)=>{
    if(editor) return !!siteBase && (isWall(definition) || !siteFacilities.length || siteFacilities.includes(String(definition.row.改築元||'').trim()))
      && terrainConditionMet(definition.terrainCondition,site,map);
    if(!siteBase||!hasV39FacilityPrerequisites(siteBase,definition.row,wallsByBase.get(siteBase.settlementId)||[]))return false;
    if(isWall(definition))return terrainConditionMet(definition.terrainCondition,site,map);
    const upgradeFrom=String(definition.row.改築元||'').trim();
    const upgradesFacility=upgradeFrom&&definitions.some(row=>row.name===upgradeFrom&&!isScale(row));
    if(upgradesFacility&&!siteFacilities.includes(upgradeFrom))return false;
    return terrainConditionMet(definition.terrainCondition,site,map)&&(!siteFacilities.length||siteFacilities.includes(upgradeFrom));
  };
  const eligible=definitions.filter(definition=>{
    if(editor)return !isScale(definition);
    if(session.facilityFirst)return !isScale(definition);
    if(isScale(definition))return base&&hasV39FacilityPrerequisites(base,definition.row,wallsByBase.get(base.settlementId)||[])
      && !existing.length&&[development.current?.name,development.next?.name].includes(definition.name);
    return fitsSite(definition,tile,base,existing);
  });
  const candidates=eligible.filter(definition=>getV39ConstructionCategories(definition).includes(category));
  const inspect=definition=>{
    if(!tile)return {available:false,reasons:[],levels:{}};
    if(editor){
      const result=editor.inspect(tile,{kind:'facility',name:definition.name,upgradeFrom:definition.row.改築元,edges:session.edges});
      return {available:result.ok,reasons:result.ok?[]:[result.reason],village:base,levels:{},buildTurns:0};
    }
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
    session.facilityName=session.facilityFirst?'':candidates.find(row=>inspect(row).available)?.name||candidates[0]?.name||'';
  }
  if(ownTile&&V39_DEFENSE_BALANCE.facilityWalls[session.facilityName]&&!session.wallMode){
    session.wallMode='tiles';session.wallSettlementId=base?.settlementId;setWallTiles([{...session.tile}]);
  }
  const checkedCandidates=session.facilityFirst?candidates.filter(row=>row.name===session.facilityName):candidates;
  const checks=new Map(checkedCandidates.map(row=>{
    const check=inspect(row);
    if(!tile)return [row.name,check];
    const fits=isScale(row)||fitsSite(row,tile,base,existing);
    return [row.name,ownTile?{...check,available:fits&&(!planning||territoryPhase)&&(check.available||(planning&&(!isScale(row)||(row.name===development.next?.name&&!base?.developmentProject)))),
      reasons:fits?check.reasons:[...new Set([...check.reasons,'このマスは設置条件を満たしていません'])]}:{...check,available:false,reasons:[ownershipNotice,...check.reasons]}];
  }));
  const selected=candidates.find(row=>row.name===session.facilityName),check=checks.get(session.facilityName);
  const placementPending=session.facilityFirst&&!!selected&&(!tile||!ownTile||!fitsSite(selected,tile,base,existing));
  const placementSites=placementPending?new Set([...Object.keys(state.territoryOwnerByTile||{}).filter(siteKey=>state.territoryOwnerByTile[siteKey]===player.id),...plannedSites.keys()]):[];
  const candidateSites=[...placementSites].filter(siteKey=>{
    const [x,y]=siteKey.split(',').map(Number);
    const siteBase=plannedSites.get(siteKey)||getSettlementForTerritory(player.factionState,state.territoryStateByTile?.[siteKey]);
    return map?.grid?.[y]?.[x]&&fitsSite(selected,{x,y},siteBase,state.facilitiesByTile?.[siteKey]||[]);
  });
  drawPlacementGuides(candidateSites);
  session.scaleSettlementId=ownTile&&selected&&isScale(selected)?base?.settlementId:null;
  const orderedEdges=orderV39WallConstructionEdges(session.edges,session.startEdgeKey||undefined);
  session.preview=ownTile&&selected&&(!session.facilityFirst||!placementPending)?{tileKey:key,facilityName:selected.name,worldId:session.worldId,...(isWall(selected)?{edges:orderedEdges,wallTiles:session.wallTiles||[],startEdgeKey:orderedEdges[0]&&v39WallEdgeKey(orderedEdges[0])}:{}),...(isScale(selected)?{settlementType:selected.name}:{})}:null;
  const costs=editor?[]:Object.entries(check?.materialPayment?.cost||selected?.cost||{}).filter(([,amount])=>amount>0);
  const locationHint=candidateSites.length?'水色のマスから設置先を選んでください。':'条件に合う設置先がありません。';
  const status=ownershipNotice||session.message||(!selected?'建築する施設を選んでください。'
    :!tile?locationHint
    :check.available?(editor?'選択したマスにすぐ配置できます':planning?'資材は着手時に消費します':'建築できます')
    :planning&&!territoryPhase?'領土運営フェーズで予約してください':check.reasons[0]);
  const copy=V39_SCREEN_HELP_COPY.construction;
  const help=renderV39ScreenHelp('建築',[...copy.select,editor?['配置','配置先を選ぶと、費用・研究・工期なしで建築できます。']:planning?copy.plan:copy.start,copy.back]);
  const materials=costs.map(([name,amount])=>`<span class="v39-build-material${tile&&Number(check?.village?.materialStockByType?.[name]||0)<amount?' shortage':''}" title="${esc(name)}"><span aria-hidden="true">${renderV39ResourceIcon(name)}</span><span>${esc(name)}</span><b>${amount}</b>${tile?`<small>所持 ${Number(check?.village?.materialStockByType?.[name]||0).toLocaleString('ja-JP')}</small>`:''}</span>`).join('')||'<span>なし</span>';
  const showOrder=planning&&base;
  const orderActive=!!showOrder&&session.buildTab==='order';
  const positions=new Map();
  if(showOrder) getV39ConstructionPlans(base).forEach((plan,index)=>{
    const list=positions.get(plan.facilityName)||[];
    list.push(index+1);
    positions.set(plan.facilityName,list);
  });
  const orderTabs=showOrder?`<nav class="v39-build-tabs" aria-label="建築情報">${[['details','施設詳細'],['order','建設順']].map(([tab,label])=>
    `<button type="button" data-land-build-tab="${tab}" aria-pressed="${orderActive===(tab==='order')}">${label}</button>`).join('')}</nav>`:'';
  const materialHelp=showOrder?renderV39ScreenHelpContent('予約の必要素材',
    renderV39ConstructionMaterialTotals(base)||`<p>${esc(copy.noReservations)}</p>`,{inline:true}):'';
  const order=orderActive?`<section class="v39-build-plan-order" aria-label="建設順">${renderV39OperationPlans(state,player,base,{scope:'construction',showFinish:false,showMaterialTotals:false})}</section>`:'';
  let host=document.getElementById('v39-land-construction');
  if(!host){host=document.createElement('section');host.id='v39-land-construction';document.getElementById('footTile')?.append(host);}
  document.getElementById('footTile')?.classList.add('is-construction-open');
  const activeTab=orderActive?'order':'details';
  const changed=host.dataset.selectedFacility!==session.facilityName||host.dataset.buildTab!==activeTab;
  updateV39RetainedMarkup(host,`<header><button type="button" data-land-construction-back>${planning?'← 拠点へ':'← 戻る'}</button><strong>建築</strong><select data-land-build-category aria-label="建築カテゴリ">${V39_CONSTRUCTION_CATEGORIES.map(name=>`<option value="${name}"${name===category?' selected':''}>${name}</option>`).join('')}</select><span>${tile?`(${tile.x},${tile.y})`:'設置先未選択'}</span>${help}</header>
    <div class="v39-land-build-panes"><nav aria-label="建築施設" class="v39-land-build-list">${candidates.map(definition=>`<button type="button" data-land-build-facility="${esc(definition.name)}" aria-pressed="${definition.name===session.facilityName}" class="${tile&&checks.get(definition.name)?.available===false?'unavailable':''}"><span class="v39-build-art-wrap">${artwork(definition)}<span class="v39-build-order-numbers">${(positions.get(definition.name)||[]).map(number=>
      `<span class="v39-build-order-number" title="建設順 ${number}" aria-label="建設順 ${number}">${number<=20?String.fromCodePoint(0x245f+number):number}</span>`).join('')}</span></span><strong>${esc(definition.name)}</strong></button>`).join('')||'<p>このカテゴリで建築・改築できる施設はありません</p>'}</nav>
    <div class="v39-build-information">${orderTabs}<section class="v39-land-build-detail" aria-label="${orderActive?'建設順':'施設詳細'}">${orderActive?order:selected?`<h3>${esc(selected.name)}</h3><p>${esc(selected.description)}</p>${isWall(selected)&&tile?`<div class="v39-wall-selection"><div class="v39-wall-directions">${[["tiles","囲むマス"],["edges","辺を調整"],["start","開始辺"]].map(([mode,label])=>`<button type="button" data-wall-mode="${mode}" aria-pressed="${session.wallMode===mode}">${label}</button>`).join("")}</div><p>${session.wallMode==="tiles"?"囲む自領のマスをタップして追加・解除":session.wallMode==="start"?"最初に建てる辺をタップ（水色の点）":"辺をタップして追加・除外"}／${session.wallTiles?.length||0}マス・${session.edges.length}辺</p><button type="button" data-wall-perimeter>都市外周を選択</button><button type="button" data-wall-clear>選択解除</button><div class="v39-wall-directions">${v39DefenseNeighbors(session.tile).map((to,i)=>`<button type="button" data-wall-direction="${i}" aria-pressed="${session.edges.some(edge=>v39WallEdgeKey(edge)===v39WallEdgeKey({from:session.tile,to}))}">${['左上','右上','右','右下','左下','左'][i]}</button>`).join('')}</div></div>`:''}<dl>
      <div><dt>工期</dt><dd>${editor?'即時':isWall(selected)?`1辺 ${check.buildTurns??selected.buildTurns}T / 完成まで ${session.edges.length*(check.buildTurns??selected.buildTurns)+(check.village?.wallConstructionQueue||[]).reduce((sum,item)=>sum+item.remainingTurns,0)}T（先行工事込み）`:`${check.buildTurns??selected.buildTurns}ターン`}</dd></div><div class="v39-build-material-block"><dt>必要素材</dt><dd class="v39-build-materials">${materials}</dd>${materialHelp?`<dd>${materialHelp}</dd>`:""}</div><div><dt>維持費</dt><dd>なし（現行仕様）</dd></div>
      <div><dt>所属拠点</dt><dd>${esc(ownTile?(check.village?.name||'拠点'):tile?'対象外':'設置先を選択')}</dd></div>${isWall(selected)?`<div><dt>建築単位</dt><dd>${editor?'1辺ごとにHP':'1辺ごとに費用・工期・HP'}（HP${V39_DEFENSE_BALANCE.facilityWalls[selected.name].hp}）／味方の移動AP+${Number(selected.row.味方通行AP増加率)||0}%</dd></div><div><dt>内壁の不便</dt><dd>住居間の壁1辺で幸福度−${Number(selected.row.内壁幸福度低下)||0}（拠点上限−${Number(selected.row.内壁幸福度低下上限)||0}）。外周壁は対象外。</dd></div>`:isScale(selected)?'<div><dt>建築方法</dt><dd>拠点発展で拡張位置を選択します。</dd></div>':`<div><dt>同施設の上限</dt><dd>${!editor&&check.limit>0?`${check.sameCount}/${check.limit}（建設中含む）`:"なし"}</dd></div>`}
      ${Number(selected.row['1マス収容人数'])>0?`<div><dt>1マス収容人数</dt><dd>${Number(selected.row['1マス収容人数'])}人</dd></div>`:''}
      <div><dt>必要研究</dt><dd>${editor?'なし':esc(Object.entries(selected.requirements).map(([name,level])=>`${name} ${tile?`${check.levels[name]||0}/`:''}${level}`).join(' / ')||'なし')}${check.researchCheck?.mode==='item'?`<br>${esc(check.researchCheck.requirements.map(row=>`${row.name}：${row.completed?'完了':'未完了'}`).join(' / '))}`:''}</dd></div>
      <div><dt>前提施設</dt><dd>${editor?'なし':esc(selected.row.前提施設||'なし')}</dd></div>

      ${(check.materialPayment?.substitutions||[]).length?`<div><dt>素材の代替</dt><dd>${check.materialPayment.substitutions.map(row=>`${esc(row.source)}不足${row.missing} → ${esc(row.resource)} ${row.amount}`).join('<br>')}</dd></div>`:''}
    </dl>${check.reasons.length?`<div class="v39-land-build-blocked"><h4>建築できない理由</h4>${check.reasons.map(reason=>`<p>${esc(reason)}</p>`).join('')}</div>`:''}`:'<p>施設を選択してください</p>'}</section></div></div>
    <footer><p role="status" title="${esc(status)}">${esc(status)}</p><button type="button" data-land-construction-start${placementPending?' data-awaiting-land':''}${ownTile&&check?.available?'':' disabled'}>${editor?'配置する':session.scaleSettlementId?'拠点発展へ':planning?'計画に追加':check?.replacesFacilityName?'改築開始':'建築開始'}</button></footer>`);
  if(changed)host.querySelector('.v39-land-build-detail').scrollTop=0;
  host.dataset.selectedFacility=session.facilityName;
  host.dataset.buildTab=activeTab;
  announcePreview();
}
function open(tile=window.getV39SelectedLandDetail?.(),{facilityName='',facilityFirst=false}={}){
  if(facilityName)category='すべて';
  const state=stateNow();
  if(!state?.activePlayerId){window.showV39TurnBanner?.('先に勢力を追加してください');return false;}
  if(!facilityFirst&&(!tile||!Number.isInteger(tile.x)||!Number.isInteger(tile.y))){
    window.activateV39FooterTab?.('tile');window.showV39TurnBanner?.('建築する土地を選択してください');return false;
  }
  if(state?.timeline?.phase!=='player'||(!facilityFirst&&state?.territoryOwnerByTile?.[`${tile.x},${tile.y}`]!==state.activePlayerId)){
    window.showV39TurnBanner?.('自分のターンに自領の土地を選択してください');return false;
  }
  if((state.activeWorldId||'surface')!=='surface'){
    window.showV39TurnBanner?.('施設建築は地上の土地で行ってください');return false;
  }
  document.getElementById('buildModal')?.classList.remove('open');
  window.cancelV39SelectedUnitAttack?.('construction-selected');window.cancelV39SelectedUnitMove?.();
  session={playerId:state.activePlayerId,worldId:state.activeWorldId||'surface',turn:state.timeline.turnNumber,tile:facilityFirst?null:{x:tile.x,y:tile.y},edges:[],facilityName,facilityFirst};
  window.activateV39FooterTab?.('tile');render();return true;
}
document.addEventListener('click',event=>{
  const el=event.target instanceof Element?event.target:null;
  if(el?.closest('[data-land-construction-open]')){open(null,{facilityFirst:true});return;}
  if(el?.closest('[data-land-construction-back]')){const planning=!window.v39FixedMapPlacement&&usesV39OperationPhases(stateNow());close();if(planning)window.openV39SettlementConstructionPlans?.();return;}
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
  const tab=el?.closest('[data-land-build-tab]');
  if(tab&&session){session.buildTab=tab.dataset.landBuildTab;render();return;}
  const candidate=el?.closest('[data-land-build-facility]');
  if(candidate&&session){
    const name=candidate.dataset.landBuildFacility;
    if(session.facilityFirst&&name!==session.facilityName){session.tile=null;session.wallMode=null;setWallTiles([]);}
    session.facilityName=name;session.buildTab='details';session.message='';render();return;
  }
  if(el?.closest('[data-land-construction-start]:enabled')&&session?.tile){
    if(!valid(stateNow())){close();return;}
    const editor=window.v39FixedMapPlacement;
    if(editor){
      const facility=facilityDefinitions().find(row=>row.name===session.facilityName);
      const result=editor.place(session.tile,{kind:'facility',name:session.facilityName,
        upgradeFrom:facility?.row?.改築元,edges:session.edges});
      if(result.ok){session.tile=null;session.wallMode=null;setWallTiles([]);session.message='施設を配置しました。';}
      else session.message=result.reason;
      render();return;
    }
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
  if(session&&(!session.facilityFirst||session.facilityName)&&(event.detail?.x!==session.tile?.x||event.detail?.y!==session.tile?.y)){
    if(!Number.isInteger(event.detail?.x)||!Number.isInteger(event.detail?.y))return;
    session.tile={x:event.detail.x,y:event.detail.y};session.message='';render();
  }
});
window.addEventListener('v39:game-state-changed',event=>{if(session&&event.detail?.reason!=='activity-log')render();});
for(const name of ['v39:field-generated','v39:field-layer-changed','v39:save-loaded'])window.addEventListener(name,()=>{if(session)close();});
window.addEventListener('v39:field-input-ready',()=>{if(session?.facilityFirst&&!session.tile)render();});
window.addEventListener('keydown',event=>{if(session&&event.key==='Escape')close();});
window.openV39LandConstruction=open;
window.isV39LandConstructionOpen=()=>!!session&&!!valid(stateNow());
window.getV39LandConstructionPreview=()=>session&&valid(stateNow())?session.preview:null;
window.handleV39WallConstructionTap=(tile,point)=>{
  if(!session?.tile||!valid(stateNow())||!V39_DEFENSE_BALANCE.facilityWalls[session.facilityName])return false;
  const state=stateNow(),map=window.__v39FieldRuntime?.mapData;
  if(session.wallMode==='tiles'){
    const player=state.players.find(p=>p.id===session.playerId),key=`${tile.x},${tile.y}`;
    const base=getSettlementForTerritory(player.factionState,state.territoryStateByTile?.[key]);
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
