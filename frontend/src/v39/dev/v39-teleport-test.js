import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {replaceFactionSettlement} from '../../lib/settlement-state.js';

window.startV39TeleportTest=()=>{
  if(!window.isV39TestMode?.())return {ok:false,reason:'テストモードで実行してください'};
  const started=window.startV39ExpeditionTest();if(!started?.ok)return started;
  const state=window.getV39GameState(),player=state.players.find(p=>p.id===state.activePlayerId);
  const map=window.__v39FieldRuntime.mapData;
  map.grid=map.grid.map(row=>row.map(()=>'森'));map.fogMap=[];map.hazardZones=[];map.defenseStructures=[];
  window.updateV39FieldData(map);
  const base=player.factionState.settlements.find(s=>s.placed);
  const faction=replaceFactionSettlement(player.factionState,{...base,name:'転移先拠点',x:12,y:6},{ownerPlayerId:player.id});
  const caster={...buildV39UnitEntity({id:'teleport-test',name:'転移試験官',race:'デヴィル',className:'ウィザード',level:20,x:6,y:6}),worldId:'surface',testSkillNames:['TEST_木々渡り','TEST_転移門','TEST_強制転移']};
  const escort={...buildV39UnitEntity({id:'teleport-escort',name:'同行兵',race:'ヒューマン',className:'ファイター',level:10,x:7,y:6}),worldId:'surface'};
  const enemies=[{id:'teleport-victim',name:'転移の標的',x:6,y:5,resistances:{魔法耐性:0}},
    {id:'teleport-immune',name:'魔法耐性100の標的',x:5,y:6,resistances:{魔法耐性:100}}]
    .map(u=>({...u,hp:200,maxHp:200,ap:0,maxAp:0,status:{HP:200,AP:0,精神:0,隠密:0,索敵:0},state:'生存',worldId:'surface',techniques:[]}));
  window.setV39GameState({teleportGates:[],enemies,neutralVillages:[],enemyNests:[],worldEnvironment:{},players:[{...player,factionState:{...faction,units:[caster,escort],selectedUnitId:caster.id,squads:[{id:'teleport-party',name:'転移試験部隊',unitIds:[caster.id,escort.id]}]}}],
    explorationWorlds:{surface:state.explorationWorlds.surface}},{reason:'teleport-test'});
  window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI?.();document.querySelector('[data-squad-detail-tab="action"]')?.click();
  window.focusV39MapTile?.({x:6,y:6});
  return {ok:true,unitId:caster.id};
};
