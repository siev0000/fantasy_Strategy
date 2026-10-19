import fixture from '../../../../config/v39-animal-army-test.json';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {getHexDistance} from '../../lib/hex-grid.js';
import {canUnitEnterV39Tile} from '../../lib/v39-terrain-traversal.js';

window.startV39AnimalArmyTest=()=>{
  const result=window.startV39FusionTest?.();if(!result?.ok)return result;
  const state=window.getV39GameState({includeWorlds:false}),player=state.players.find(p=>p.id===state.activePlayerId),f=player.factionState;
  const map=window.__v39FieldRuntime.mapData,[x,y]=fixture.storageTile.split(',').map(Number);
  const make=(level,id)=>({...buildV39UnitEntity({id,name:`ウルフ Lv${level}`,race:fixture.race,className:fixture.race,level,x,y,isNamed:false,unitType:'通常ユニット'}),worldId:'surface',testOnly:true});
  const occupied=new Set([...state.players.flatMap(p=>p.factionState.units),...(state.enemies||[]),...(state.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])].filter(u=>u.hp>0&&(u.worldId||'surface')==='surface').map(u=>`${u.x},${u.y}`));
  const tiles=Object.keys(state.territoryOwnerByTile).map(key=>{const [tx,ty]=key.split(',').map(Number);return {x:tx,y:ty};})
    .filter(t=>state.territoryOwnerByTile[`${t.x},${t.y}`]===player.id&&getHexDistance({x,y},t)<=1&&!occupied.has(`${t.x},${t.y}`)&&canUnitEnterV39Tile(map,t.x,t.y,make(3,'probe')));
  if(tiles.length<fixture.fieldLevels.length)return {ok:false,reason:'テスト個体の配置マスが不足しています'};
  const units=fixture.fieldLevels.map((level,i)=>({...make(level,`animal-army-field-${i}`),...tiles[i],position:[tiles[i].x,tiles[i].y]}));
  const stored=fixture.storedLevels.map((level,i)=>({unit:make(level,`animal-army-stored-${i}`),tileKey:fixture.storageTile,facilityName:fixture.storageFacility,worldId:'surface',runtimeByKey:{}}));
  const next={...f,units:[...units,...f.units],facilityStorage:[...(f.facilityStorage||[]).filter(e=>e.unit.race!==fixture.race),...stored],selectedUnitId:units[0].id,
    squads:f.squads.map(s=>s.id==='solo'?{...s,unitIds:[...units.map(u=>u.id),...s.unitIds]}:s)};
  window.setV39GameState({players:state.players.map(p=>p.id===player.id?{...p,factionState:next}:p)},{reason:'animal-army-test'});
  window.showV39TurnBanner?.(`動物軍隊テスト：ユニット一覧からウルフを選び「軍隊化」。活動中${units.length}体・研究所内${stored.length}体。`);
  window.openV39CharacterModal?.();return {ok:true,unitIds:units.map(u=>u.id)};
};
