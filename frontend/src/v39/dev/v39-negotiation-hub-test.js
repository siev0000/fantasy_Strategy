import fixture from '../../../../config/v39-negotiation-hub-test.json';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {getGameDataRows} from '../../lib/game-data-registry.js';
import {getV39ConversationPersonalities} from '../../lib/v39-conversation-personality.js';
import {recordV39Conversation} from '../world/v39-negotiation-conversation.js';
import {advanceV39VillagePlans} from '../../lib/v39-village-plans.js';
import {getHexNeighborCoords} from '../../lib/hex-grid.js';
import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const footprint=(x,y)=>[{x,y},...getHexNeighborCoords(24,24,x,y)].map(t=>`${t.x},${t.y}`);

export async function startV39NegotiationHubTest(){
  if(!window.isV39TestMode?.())return {ok:false,reason:'テストモードを有効にしてください'};
  const result=window.startV39VillageIncidentTest?.();if(!result?.ok)return result;
  window.closeV39VillageMenu?.();
  const state=window.getV39GameState(),player=state.players[0],source=state.neutralVillages.find(v=>v.incidentTest);
  const visitors=fixture.villages.map(sample=>({...buildV39UnitEntity({id:`negotiator-${sample.key}`,name:`交渉担当・${sample.name}`,race:'只人',className:'ファイター',level:20,x:sample.x,y:sample.y,isNamed:true}),
    worldId:'surface',squadId:'solo',testSkillNames:[...fixture.testSkills],conversationPersonality:'冷静'}));
  const villages=fixture.villages.map(sample=>{
    const village={...structuredClone(source),id:`negotiation-${sample.key}`,name:sample.name,race:sample.race,combatRaceName:sample.race,x:sample.x,y:sample.y,
      negotiationHubTest:sample.key,incidentTest:false,leader:undefined,conversationPersonality:sample.personality,vassalPlayerId:'',
      populationByRace:{[sample.race]:200},
      territoryTileKeys:footprint(sample.x,sample.y),relationsByPlayerId:{[player.id]:sample.relation},questsByPlayerId:{},eventCompletedTurnByPlayerId:{},
      foodStockByType:{穀物:0,野菜:0,肉:0,魚:0},materialStockByType:{木材:1000,石材:1000,鉄:1000,金:1000,銀:100},
      defenseUnits:sample.noGuards?[]:source.defenseUnits.map((guard,i)=>({...guard,
        ...buildV39UnitEntity({id:`negotiation-${sample.key}-guard-${i}`,name:`${sample.name}の守備兵${i+1}`,race:sample.race,className:'ファイター',level:5,x:sample.x-1,y:sample.y-i}),
        neutralVillageId:`negotiation-${sample.key}`,ownerNeutralVillageId:`negotiation-${sample.key}`})),
      heldUnits:[],incidentByPlayerId:{},sacrificeContract:{...source.sacrificeContract,active:false},planSchedule:undefined,defenseRosterInitialized:true};
    return village;
  });
  player.factionState.units=visitors;player.factionState.squads=[{id:'solo',label:'単独',unitIds:visitors.map(u=>u.id)}];player.factionState.selectedUnitId=visitors[0].id;player.factionState.eventDialogueById={};
  for(const bank of player.factionState.settlements){
    for(const key of Object.keys(bank.foodStockByType||{}))bank.foodStockByType[key]=10000;
    for(const key of Object.keys(bank.materialStockByType||{}))bank.materialStockByType[key]=10000;
    bank.materialStockByType.銀=50;bank.materialStockByType.黒木=50;
  }
  const bank=player.factionState.settlements[0],definitions=getGameDataRows('特産品').filter(row=>row.分類!=='特殊資源');
  const sites={};bank.territoryTileKeys.slice(0,4).forEach((key,index)=>{const row=definitions[index];if(!row)return;const [x,y]=key.split(',').map(Number);sites[key]={key,x,y,name:row.名前,category:row.分類};});
  player.factionState.exploration={...player.factionState.exploration,discoveredSpecialtiesByTile:sites};
  const owners={...state.territoryOwnerByTile},territories={...state.territoryStateByTile};
  for(const key of bank.territoryTileKeys){owners[key]=player.id;territories[key]={status:'領土',settlementId:bank.settlementId,hp:100,maxHp:100};}
  for(const key of Object.keys(owners))if(String(owners[key]).startsWith('neutral-')||state.neutralVillages.some(v=>v.id===owners[key])){delete owners[key];delete territories[key];}
  for(const village of villages)for(const key of village.territoryTileKeys){owners[key]=village.id;territories[key]={status:'領土',settlementId:village.id,hp:100,maxHp:100};}
  const enemies=state.enemies.map((u,i)=>({...u,...buildV39UnitEntity({id:u.id,name:'村を脅かすウルフ',race:'ウルフ',className:'ウルフ',level:18,x:8+i,y:8,isMob:true,isNamed:false}),worldId:'surface',strength:1000,aggressive:true,testOnly:true}));
  const demon=state.players[1]?.factionState.units[0],occupied=new Set([...visitors,...villages[0].defenseUnits].map(u=>`${u.x},${u.y}`));
  const arrival=villages[0].territoryTileKeys.find(key=>!occupied.has(key));
  if(demon&&arrival){const [x,y]=arrival.split(',').map(Number);Object.assign(demon,{x,y,position:[x,y]});}
  const map=structuredClone(window.__v39FieldRuntime.mapData);map.negotiationHubTest=true;
  for(const village of villages)for(const key of village.territoryTileKeys){const [x,y]=key.split(',').map(Number);map.grid[y][x]='平地';if(map.heightLevelMap?.[y])map.heightLevelMap[y][x]=0;}
  window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
  let next={...state,players:[player,...state.players.slice(1)],neutralVillages:villages,
    settlements:[...player.factionState.settlements,...villages],enemies,specialtiesByTile:sites,territoryOwnerByTile:owners,territoryStateByTile:territories};
  const planned=next.neutralVillages.map(village=>advanceV39VillagePlans(next,village,map,next.timeline.turnNumber).village);
  next={...next,neutralVillages:planned,settlements:[...player.factionState.settlements,...planned]};
  window.setV39GameState(next,{reason:'negotiation-hub-test'});
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();
  await window.waitForV39MapRenderSettled?.();focusV39NegotiationHubTest('standard');
  return {ok:true};
}

export function focusV39NegotiationHubTest(key,personality='',column=''){
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return false;
  const state=window.getV39GameState(),village=state.neutralVillages.find(v=>v.negotiationHubTest===key),player=state.players.find(p=>p.id===state.activePlayerId);
  const unit=player?.factionState.units.find(u=>u.id===`negotiator-${key}`);if(!village||!unit)return false;
  if(personality&&getV39ConversationPersonalities().some(row=>row.性格===personality)){
    village.leader={...village.leader,conversationPersonality:personality};village.conversationPersonality=personality;
  }
  player.factionState.selectedUnitId=unit.id;
  window.setV39GameState({players:state.players,neutralVillages:state.neutralVillages},{reason:'negotiation-test-focus'});
  window.activateV39FooterTab?.('interaction');
  window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:village.x,y:village.y}}));
  const scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
  scene?.cameras.main.centerOn(village.x*hex.width+(village.y%2?hex.oddRowOffsetX:0)+hex.width/2,village.y*hex.rowStep+hex.height/2);
  window.openV39VillageMenu?.(village.id);
  if(column&&fixture.previewColumns.includes(column)){
    recordV39Conversation(village.id,'会話パターンを確認します。','',{speechColumn:column});
    window.dispatchEvent(new CustomEvent('v39:conversation-updated'));
  }
  return true;
}

export function renderV39NegotiationHubTestTools(state){
  const active=state?.neutralVillages?.some(v=>v.negotiationHubTest);
  if(!active)return '';
  return `<details class="v39-test-section" data-test-section="negotiation-hub" open><summary>村長・交渉総合テスト</summary><div class="v39-test-section-body"><p>会話・依頼・取引・情報、交渉/威圧スキル、休息・属国化・襲撃を実操作で確認。実行で状態が変わるため、必要なら開始し直してください。</p>${active?`<label>村<select id="v39-test-negotiation-village">${fixture.villages.map(v=>`<option value="${v.key}">${esc(state.neutralVillages.find(row=>row.negotiationHubTest===v.key)?.name||v.name)}</option>`).join('')}</select></label><button data-test-action="negotiation-hub-focus">選んだ村と話す</button><label>性格<select id="v39-test-negotiation-personality">${getV39ConversationPersonalities().map(p=>`<option>${esc(p.性格)}</option>`).join('')}</select></label><label>確認する台詞<select id="v39-test-negotiation-column">${fixture.previewColumns.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label><button data-test-action="negotiation-hub-preview">性格・台詞を確認</button><small>台詞確認は表示だけのプレビューです。承諾・降伏・金品の移転などは実行しません。通常の交渉判定は各画面から行ってください。</small>`:''}</div></details>`;
}
