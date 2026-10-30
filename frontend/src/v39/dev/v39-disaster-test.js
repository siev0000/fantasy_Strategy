import fixture from '../../../../config/v39-disaster-test.json';
import {getHexDistance,getHexOffsetNeighbors} from '../../lib/hex-grid.js';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {createV39ClimateProfile,setV39WeatherAt} from '../../lib/v39-weather.js';
import {resolveV39DisasterRule} from '../../lib/v39-disaster-rules.js';
import {getV39HazardDefinitions,projectV39HazardEvents} from '../../lib/v39-hazard-zones.js';

window.startV39DisasterTest=(options={})=>{
  const natural=options.natural===true;
  const extended=options.extended===true;
  const atmosphere=options.atmosphere!==false&&!natural&&!extended;
  const result=window.startV39ExpeditionTest?.(false,{silentBanner:natural});
  if(!result?.ok)return result;
  const map=window.__v39FieldRuntime.mapData,state=window.getV39GameState({includeWorlds:false});
  map.hazardZones=[];
  const player=state.players.find(p=>p.id===state.activePlayerId),f=player.factionState;
  const events=extended?fixture.extendedEvents:fixture.events;
  if(natural)for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
    map.grid[y][x]=y<12?(x<12?(x%4===0?'平地':'森'):(x%4===0?'山岳':'平地')):(x<12?(x%4===0?'山岳':'河川'):'雪原');
    map.specialMap[y][x]='';map.heightLevelMap[y][x]=map.grid[y][x]==='山岳'?3:0;
  }
  for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
    const area=events.find(event=>getHexDistance(event,{x,y})<=2);
    if(area&&!natural){map.grid[y][x]=area.terrain;map.specialMap[y][x]='';}
  }
  if(extended){
    for(let y=4;y<=9;y++)for(let x=18;x<=20;x++){map.grid[y][x]='雪山';map.heightLevelMap[y][x]=Math.max(0,8-y);}
    for(let y=13;y<=19;y++)for(let x=2;x<=21;x++){
      map.grid[y][x]=x<=6||x>=15&&x<=17?'海':'平地';map.heightLevelMap[y][x]=map.grid[y][x]==='海'?0:1;
    }
    map.terrainDamage={};map.disasterFields=[];
  }
  map.disasterTestFixture=true;
  map.disasterExtendedTestFixture=extended;
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
      name:`${resolveV39DisasterRule(event.id).name}観察者`,caveDuty:null,transportAssignment:null,
      worldId:'surface',hp:unit.maxHp,currentHp:unit.maxHp};
  });
  const {x,y,durationTurns}=fixture.lightning;
  const lightningObservers=(extended?[]:[{x,y},...getHexOffsetNeighbors(x,y)]).map((point,index)=>({...units[0],
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
    if(!extended)window.forceV39Disaster('災害:落雷嵐',{x,y});
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

window.startV39HazardTest=()=>{
  const result=window.startV39ExpeditionTest?.(false,{silentBanner:true});if(!result?.ok)return result;
  const map=window.__v39FieldRuntime.mapData,state=window.getV39GameState(),turn=state.timeline.turnNumber;
  map.hazardTurn=turn;map.hazardZones=[];map.fogMap=[];map.disasterTestFixture=true;map.hazardTestFixture=true;
  const units=[],points=[[4,5],[11,5],[18,5],[4,15],[11,15],[18,15]];
  getV39HazardDefinitions().forEach((definition,index)=>{
    const [x,y]=points[index],tileKeys=[];
    for(let ty=0;ty<map.h;ty++)for(let tx=0;tx<map.w;tx++)if(getHexDistance({x,y},{x:tx,y:ty})<=1){
      map.grid[ty][tx]=['沼地','湿地','平地','平地','雪原','平地'][index];map.heightLevelMap[ty][tx]=0;
      map.specialMap[ty][tx]='';tileKeys.push(`${tx},${ty}`);
    }
    map.hazardZones.push({id:`hazard-test-${index}`,disasterId:definition.disasterId,name:definition.name,x,y,tileKeys,suppressedUntilByTile:{}});
    for(const immune of [false,true]){
      const id=`hazard-observer-${index}-${immune?'immune':'normal'}`;
      const unit=buildV39UnitEntity({id,name:`${definition.name}${immune?'耐性100':'観察者'}`,race:'只人',className:'ファイター',level:1,x:x+(immune?1:0),y});
      units.push({...unit,worldId:'surface',squadId:'solo',maxHp:300,hp:300,currentHp:300,
        status:{...unit.status,HP:300,防御:0,精神:0,毒耐性:immune?100:0,炎耐性:immune?100:0,氷耐性:immune?100:0},
        resistanceOverrides:{毒耐性:immune?100:0,炎耐性:immune?100:0,氷耐性:immune?100:0}});
    }
  });
  const players=state.players.map(p=>p.id===state.activePlayerId?{...p,factionState:{...p.factionState,units,
    squads:[{id:'solo',name:'単独',unitIds:units.map(u=>u.id)}],selectedSquadId:'solo',selectedUnitId:units[0].id}}:p);
  window.updateV39FieldData({...map},{silent:true});
  window.setV39GameState({players,enemies:[],enemySquads:[],enemyNests:[],neutralVillages:[],
    worldEnvironment:{...state.worldEnvironment,activeDisasters:projectV39HazardEvents(map,turn),lastNaturalEventTurn:turn}},{reason:'hazard-test-start',trackUnitDeaths:false});
  window.activateV39FooterTab?.('test');window.refreshV39MapEntities?.();window.renderV39DisasterIcons?.();
  window.showV39TurnBanner?.('危険地帯6種：各地点に通常・耐性100の観察者。1T経過で継続被害、土地で環境効果を確認。');
  return {ok:true,zones:map.hazardZones};
};
