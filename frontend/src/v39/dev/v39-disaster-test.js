import fixture from '../../../../config/v39-disaster-test.json';
import {getHexDistance,getHexOffsetNeighbors} from '../../lib/hex-grid.js';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {createV39ClimateProfile,setV39WeatherAt} from '../../lib/v39-weather.js';

window.startV39DisasterTest=()=>{
  const result=window.startV39ExpeditionTest?.();
  if(!result?.ok)return result;
  const map=window.__v39FieldRuntime.mapData,state=window.getV39GameState({includeWorlds:false});
  const player=state.players.find(p=>p.id===state.activePlayerId),f=player.factionState;
  const events=fixture.events;
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
    const area=events.find(event=>getHexDistance(event,{x,y})<=2);
    if(area){map.grid[y][x]=area.terrain;map.specialMap[y][x]='';}
  }
  map.disasterTestFixture=true;
  map.climateProfile=createV39ClimateProfile(map);
  let weather=null;
  for(const sample of fixture.weatherSamples)weather=setV39WeatherAt(map,weather,state.timeline.turnNumber,sample.x,sample.y,sample.weather);
  const units=f.units.map((unit,i)=>{
    if(i>=events.length)return {...unit,caveDuty:null,transportAssignment:null};
    const event=events[i];return {...unit,x:event.x,y:event.y,position:[event.x,event.y],
      name:['山火事観察者','洪水観察者','干ばつ観察者'][i],caveDuty:null,transportAssignment:null,
      worldId:'surface',hp:unit.maxHp,currentHp:unit.maxHp};
  });
  const {x,y,durationTurns}=fixture.lightning;
  const lightningObservers=[{x,y},...getHexOffsetNeighbors(x,y)].map((point,index)=>({...units[0],
    id:`lightning-observer-${index}`,name:`落雷観察者${index+1}`,x:point.x,y:point.y,position:[point.x,point.y],
    squadId:'solo',hp:units[0].maxHp,currentHp:units[0].maxHp}));
  units.push(...lightningObservers);
  const squads=f.squads.map(squad=>squad.id==='solo'?{...squad,unitIds:[...squad.unitIds,...lightningObservers.map(unit=>unit.id)]}:squad);
  const wolf={...buildV39UnitEntity({id:'disaster-test-wolf',name:'暴走生成用ウルフ',race:'ウルフ',className:'ウルフ',level:5,x:16,y:14}),worldId:'surface'};
  window.setV39GameState({players:state.players.map(p=>p.id===player.id?{...p,factionState:{...f,units,squads,selectedUnitId:units[0].id}}:p),
    worldEnvironment:{weather},enemies:[wolf],enemySquads:[{id:'disaster-test-wolf-squad',unitIds:[wolf.id]}],groundLootByTile:{}},{reason:'disaster-test-started',trackUnitDeaths:false});
  for(const event of events)window.forceV39Disaster(event.id,{x:event.x,y:event.y});
  window.forceV39Disaster('災害:落雷嵐',{x,y});
  const env=window.getV39GameState().worldEnvironment;
  window.setV39GameState({worldEnvironment:{...env,activeDisasters:env.activeDisasters.map(event=>event.disasterId==='災害:落雷嵐'
    ?{...event,expiresAtTurn:state.timeline.turnNumber+durationTurns-1}:event)}},{reason:'disaster-test-lightning-duration'});
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.renderV39DisasterIcons?.();
  window.showV39TurnBanner?.(`災害テスト: 山火事(4,4)・洪水(10,5)・干ばつ(8,10)・落雷(12,10)。落雷は観察者7体・持続${durationTurns}ターン。「1T経過」で確認できます。`);
  window.activateV39FooterTab?.('test');
  window.dispatchEvent(new CustomEvent('v39:disaster-test-ready',{detail:{x:events[0].x,y:events[0].y}}));
  return {ok:true,events:[...events.map(event=>({...event})),{id:'災害:落雷嵐',x,y}]};
};
