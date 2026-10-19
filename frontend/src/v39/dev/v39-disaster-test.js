import fixture from '../../../../config/v39-disaster-test.json';
import {getHexDistance,getHexOffsetNeighbors} from '../../lib/hex-grid.js';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {createV39ClimateProfile,setV39WeatherAt} from '../../lib/v39-weather.js';
import {resolveV39DisasterRule} from '../../lib/v39-disaster-rules.js';

window.startV39DisasterTest=(options={})=>{
  const natural=options.natural===true;
  const atmosphere=options.atmosphere!==false&&!natural;
  const result=window.startV39ExpeditionTest?.(false,{silentBanner:natural});
  if(!result?.ok)return result;
  const map=window.__v39FieldRuntime.mapData,state=window.getV39GameState({includeWorlds:false});
  const player=state.players.find(p=>p.id===state.activePlayerId),f=player.factionState;
  const events=fixture.events;
  if(natural)for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
    map.grid[y][x]=y<12?(x<12?(x%4===0?'平地':'森'):(x%4===0?'山岳':'平地')):(x<12?(x%4===0?'山岳':'河川'):'雪原');
    map.specialMap[y][x]='';map.heightLevelMap[y][x]=map.grid[y][x]==='山岳'?3:0;
  }
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
    const area=events.find(event=>getHexDistance(event,{x,y})<=2);
    if(area&&!natural){map.grid[y][x]=area.terrain;map.specialMap[y][x]='';}
  }
  map.disasterTestFixture=true;
  map.disasterNaturalTestFixture=natural;
  map.disasterAtmosphereTestFixture=atmosphere;
  if(atmosphere)for(const sample of fixture.atmosphere.samples.filter(row=>!row.disasters.length)){
    for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(getHexDistance(sample,{x,y})<=fixture.atmosphere.radius){
      map.grid[y][x]='平地';map.specialMap[y][x]='';map.heightLevelMap[y][x]=0;
    }
  }
  map.climateProfile=createV39ClimateProfile(map);
  let weather=null;
  for(const sample of fixture.weatherSamples)weather=setV39WeatherAt(map,weather,state.timeline.turnNumber,sample.x,sample.y,sample.weather);
  if(natural){
    const turn=state.timeline.turnNumber,n=fixture.natural;
    weather={...weather,regions:Object.fromEntries(Object.entries(weather.regions).map(([key,row])=>{
      const dry=row.weather==='晴れ';
      return [key,{...row,humidity:dry?n.dryHumidity:n.wetHumidity,dryness:dry?n.dryness:0,
        dryTurns:dry?n.conditionTurns:0,wetTurns:dry?0:n.conditionTurns,weatherUntilTurn:turn+n.initialWeatherTurns-1}];
    }))};
  }
  const units=f.units.map((unit,i)=>{
    if(i>=3)return {...unit,caveDuty:null,transportAssignment:null};
    const event=events[i];return {...unit,x:event.x,y:event.y,position:[event.x,event.y],
      name:['山火事観察者','洪水観察者','干ばつ観察者'][i],caveDuty:null,transportAssignment:null,
      worldId:'surface',hp:unit.maxHp,currentHp:unit.maxHp};
  });
  const {x,y,durationTurns}=fixture.lightning;
  const lightningObservers=[{x,y},...getHexOffsetNeighbors(x,y)].map((point,index)=>({...units[0],
    id:`lightning-observer-${index}`,name:`落雷観察者${index+1}`,x:point.x,y:point.y,position:[point.x,point.y],
    squadId:'solo',hp:units[0].maxHp,currentHp:units[0].maxHp}));
  units.push(...lightningObservers);
  const additionalObservers=natural?[]:events.slice(3).map(event=>({...units[0],
    id:`disaster-observer-${event.id}`,name:`${resolveV39DisasterRule(event.id).name}観察者`,
    x:event.x,y:event.y,position:[event.x,event.y],worldId:'surface',squadId:'solo',isSovereign:false,testOnly:true,
    hp:units[0].maxHp,currentHp:units[0].maxHp}));
  units.push(...additionalObservers);
  const atmosphereObservers=atmosphere?fixture.atmosphere.samples.filter(row=>!row.disasters.length).map((sample,index)=>({...units[0],
    id:`atmosphere-observer-${index}`,name:`${sample.name}観察者`,x:sample.x,y:sample.y,position:[sample.x,sample.y],
    worldId:'surface',squadId:'solo',isSovereign:false,testOnly:true})):[];
  units.push(...atmosphereObservers);
  const squads=f.squads.map(squad=>squad.id==='solo'?{...squad,unitIds:[...squad.unitIds,...lightningObservers.map(unit=>unit.id),...additionalObservers.map(unit=>unit.id),...atmosphereObservers.map(unit=>unit.id)]}:squad);
  const wolf={...buildV39UnitEntity({id:'disaster-test-wolf',name:'暴走生成用ウルフ',race:'ウルフ',className:'ウルフ',level:5,x:16,y:14}),worldId:'surface'};
  window.setV39GameState({players:state.players.map(p=>p.id===player.id?{...p,factionState:{...f,units,squads,selectedUnitId:units[0].id}}:p),
    worldEnvironment:{weather,activeDisasters:[],lastDisasterEvents:[],lastNaturalEventTurn:state.timeline.turnNumber},enemies:natural?[]:[wolf],enemySquads:natural?[]:[{id:'disaster-test-wolf-squad',unitIds:[wolf.id]}],groundLootByTile:{}},{reason:'disaster-test-started',trackUnitDeaths:false});
  window.updateV39FieldData?.({...map},{silent:true});
  if(!natural){
    for(const event of events)window.forceV39Disaster(event.id,{x:event.x,y:event.y});
    window.forceV39Disaster('災害:落雷嵐',{x,y});
  }
  if(atmosphere){
    const turn=state.timeline.turnNumber;
    map.fogMap=[];
    for(const sample of fixture.atmosphere.samples){
      for(const id of sample.disasters)window.forceV39Disaster(id,{x:sample.x,y:sample.y});
      for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(getHexDistance(sample,{x,y})<=fixture.atmosphere.radius){
        map.fogMap[y]||=[];
        map.fogMap[y][x]={kind:sample.fog==='death'?'death':'normal',source:'skill',expiresAtTurn:turn+fixture.atmosphere.durationTurns};
      }
    }
    window.updateV39FieldData?.({...map},{silent:true});
  }
  const env=window.getV39GameState().worldEnvironment;
  const atmosphereIds=new Set(fixture.atmosphere.samples.flatMap(sample=>sample.disasters));
  window.setV39GameState({worldEnvironment:{...env,activeDisasters:env.activeDisasters.map(event=>{
    const duration=!natural&&event.disasterId==='災害:落雷嵐'?durationTurns:atmosphere&&atmosphereIds.has(event.disasterId)?fixture.atmosphere.durationTurns:null;
    return duration?{...event,expiresAtTurn:state.timeline.turnNumber+duration-1}:event;
  })}},{reason:'disaster-test-duration'});
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.renderV39DisasterIcons?.();
  window.showV39TurnBanner?.(atmosphere?`災害＋霧・重なり比較：テスト操作の環境欄で比較地点を選び「比較地点へ」。霧と対象災害は検証用${fixture.atmosphere.durationTurns}ターン。`:natural?'自然発生テスト：災害なしで開始。通常確率のまま「1T経過」で抽選し、環境欄に結果を表示します。':`災害テスト: ${events.length+1}種類を配置。環境欄で災害を選び「発生地点へ」で比較できます。落雷は観察者7体・持続${durationTurns}ターン。`);
  window.activateV39FooterTab?.('test');
  window.dispatchEvent(new CustomEvent('v39:disaster-test-ready',{detail:{x:events[0].x,y:events[0].y}}));
  return {ok:true,natural,events:natural?[]:[...events.map(event=>({...event})),{id:'災害:落雷嵐',x,y}]};
};
