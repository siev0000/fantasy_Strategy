import {captureV39SettlementIntel,settlementIntelGroups} from '../../lib/v39-settlement-intel.js';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {createPlayerFactionState} from '../../lib/player-state.js';
import {normalizeV39EquipmentInventory} from '../../lib/v39-equipment-rules.js';
import {researchTreeData} from '../../lib/research-tree-config.js';

const targetLayouts=[
  {id:'spy-test-defender',label:'防諜側',name:'防諜拠点',x:8,y:5,
    facilities:[[9,5,'兵舎'],[8,4,'鍛冶場'],[9,4,'倉庫']]},
  {id:'spy-test-golem',label:'ゴーレム研究勢力',name:'ゴーレム研究拠点',x:17,y:4,
    facilities:[[16,4,'ゴーレム工房（小）'],[18,4,'ゴーレム工房（中）'],[17,3,'ゴーレム工房（大）'],[17,5,'鍛冶場'],[18,5,'倉庫'],[18,3,'兵舎']]},
  {id:'spy-test-beast',label:'魔獣研究勢力',name:'魔獣収容拠点',x:16,y:12,
    facilities:[[15,12,'魔獣研究所'],[17,12,'兵舎'],[16,11,'魔獣研究所'],[16,13,'倉庫'],[17,13,'鍛冶場']]}
];

export function createSpyTestFixture(player,map){
  const ownerId=player.id;
  const base=(id,ownerPlayerId,name,x,y,facilities=[])=>({
    id,settlementId:id,ownerPlayerId,name,x,y,placed:true,worldId:'surface',type:'村',population:50,
    foodStockByType:{穀物:500},materialStockByType:{木材:100},
    territoryTileKeys:[...new Set([x+','+y,...facilities.map(([fx,fy])=>fx+','+fy)])],
    buildings:facilities.map(([, ,name])=>name),
    tileFacilityMap:Object.fromEntries(facilities.map(([fx,fy,name])=>[fx+','+fy,[name]]))
  });
  const home=base('spy-home',ownerId,'派遣拠点',4,7);
  const targets=targetLayouts.map(layout=>({
    ...layout,
    settlement:{...base(layout.id+'-base',layout.id,layout.name,layout.x,layout.y,layout.facilities),
      equipmentInventory:normalizeV39EquipmentInventory([
        {name:'剣',quality:'common',count:3},{name:'弓',quality:'rare',count:1}])}
  }));
  const makeUnit=(id,name,x,y,settlementId,className,minimum={},prerequisiteClassLevels={},race='只人')=>({
    ...buildV39UnitEntity({id,name,x,y,settlementId,race,level:30,className,prerequisiteClassLevels}),
    testOnly:true,testSkillMinimum:minimum,worldId:'surface'
  });
  const minimum={隠密:180,変装:180};
  const spies=[makeUnit('spy-test-agent','検証スパイ',4,7,home.id,'スパイ',minimum),
    makeUnit('spy-test-thief','検証怪盗',5,7,home.id,'スパイ',minimum,{怪盗:1})];
  const buildSide=(id,label,v,units,overrides={})=>({...player,id,name:label,label,isPlayer:true,isNpc:false,ready:true,
    factionState:createPlayerFactionState({units,settlements:[v],selectedSettlementId:v.id,selectedUnitId:units[0].id,
      squads:[{id:'solo',name:'単独',unitIds:units.map(u=>u.id)}],...overrides},id)});
  const observers=buildSide(ownerId,'派遣側',home,spies,{
    visibility:{exploredTileKeys:targets.flatMap(({settlement})=>settlement.territoryTileKeys)},
    factionSightings:Object.fromEntries(targets.map(({id,x,y})=>[id,{x,y,worldId:'surface',turn:1,size:'単独'}])),
    spyOperations:{agents:[],networks:[],alerts:{},intel:targets.map(({id,name,settlement})=>({
      turn:1,targetId:id,settlementId:settlement.id,mission:'事前偵察',
      message:name+'の施設を確認。'+settlement.buildings.join('、'),facilities:settlement.tileFacilityMap
    }))}
  });
  const defenders=targets.map(({id,label,x,y,facilities,settlement},index)=>{
    const category=index===0?'鍛冶Lv':'魔法Lv';
    const items=researchTreeData.categories[category]?.levels[0]?.items||[];
    const facilityStorage=facilities.flatMap(([fx,fy,name])=>{
      if(name!=='兵舎'&&name!=='魔獣研究所')return [];
      const animal=name==='魔獣研究所';
      const unit=makeUnit(id+'-stored-'+fx+'-'+fy,animal?'収容中のウルフ':'兵舎の兵士',fx,fy,settlement.id,
        animal?'ウルフ':'ファイター',{}, {},animal?'ウルフ':'只人');
      return [{unit,tileKey:fx+','+fy,facilityName:name,worldId:'surface',runtimeByKey:{}}];
    });
    const guard=makeUnit(id+'-guard',label+'の警備担当者',x,y,settlement.id,'ファイター',
      index===0?{索敵:220,看破:180}:{索敵:120,看破:100});
    return buildSide(id,label,settlement,[guard],{facilityStorage,research:{
      selection:items[0]?{[category]:items[0].id}:{},
      progress:{completedByCategoryLevel:items[1]?{[category]:{1:[items[1].id]}}:{}}
    }});
  });
  const settlements=[home,...targets.map(target=>target.settlement)];
  const scenario={
    map:{...map,spyTestFixture:true},players:[observers,...defenders],diplomacyRelations:{},
    facilitiesByTile:Object.assign({},...settlements.map(v=>v.tileFacilityMap)),
    territoryOwnerByTile:Object.fromEntries(settlements.flatMap(v=>v.territoryTileKeys.map(tile=>[tile,v.ownerPlayerId]))),
    territoryStateByTile:Object.fromEntries(settlements.flatMap(v=>v.territoryTileKeys.map(tile=>[tile,{status:'領土',settlementId:v.id}])))
  };
  const completeTarget=defenders.find(side=>side.id==='spy-test-beast');
  const completeBase=completeTarget.factionState.settlements[0];
  const report=observers.factionState.spyOperations.intel.find(entry=>entry.targetId===completeTarget.id);
  const parts=settlementIntelGroups.flatMap(group=>group.keys.map(([key])=>key));
  report.message=completeBase.name+'の概況・生産・施設・ユニット・運用を調査済みです。';
  report.settlementIntel=captureV39SettlementIntel(scenario,completeTarget,completeBase,parts,map);
  return scenario;
}
