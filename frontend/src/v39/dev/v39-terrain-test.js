import {getGameDataRows} from '../../lib/game-data-registry.js';
import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';
import {getHexOffsetNeighbors} from '../../lib/hex-grid.js';
import {v39VictoryLandmarkDefinitions} from '../../lib/v39-victory-landmarks.js';
import patterns from '../../../../config/v39-terrain-patterns.json';

const BASES={洞窟:'山岳',峡谷:'丘陵',死の霧:'平地',薬草の群生地:'平地',金山:'山岳',銀鉱脈:'山岳',宝石脈:'山岳',水脈:'平地',戦場後:'荒野',道路1:'平地',道路2:'平地',道路3:'平地',太陽の山:'山岳',黄昏の樹:'森',星の火口:'火山',宇宙の海:'湖',大河:'河川',溶岩:'火山'};
const SPECIAL_ICONS=new Set(['洞窟','峡谷','死の霧','薬草の群生地']);
let renderId=0;

function center(x,y){return {x:x*hex.width+(y%2?hex.oddRowOffsetX:0)+hex.width/2,y:y*hex.rowStep+hex.height/2};}

window.focusV39TerrainTestSample=index=>{
  const runtime=window.__v39FieldRuntime,sample=runtime?.mapData?.terrainTestSamples?.[index];
  const scene=runtime?.game?.scene?.getScenes(true)?.[0];
  if(!sample||!scene||!window.isV39TestMode?.())return false;
  const point=center(sample.x+1,sample.y+1);
  scene.cameras.main.setZoom(Math.min(1.2,(scene.v39FitZoom||1)*10)).centerOn(point.x,point.y);
  scene.v39RequestedZoom=scene.cameras.main.zoom;
  scene.v39SelectedTile={x:sample.x+1,y:sample.y+1};
  scene.game.v39InvalidateRender?.();
  window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:scene.v39SelectedTile}));
  return true;
};

window.overviewV39TerrainTest=()=>{
  const runtime=window.__v39FieldRuntime,scene=runtime?.game?.scene?.getScenes(true)?.[0],map=runtime?.mapData;
  if(!map?.terrainTestSamples||!scene||!window.isV39TestMode?.())return false;
  scene.cameras.main.setZoom(scene.v39FitZoom).centerOn((map.w*hex.width+hex.oddRowOffsetX)/2,((map.h-1)*hex.rowStep+hex.height)/2);
  scene.v39RequestedZoom=scene.cameras.main.zoom;scene.game.v39InvalidateRender?.();return true;
};

function scheduleLabels(){
  const id=++renderId;
  const render=attempt=>{
    if(id!==renderId)return;
    const runtime=window.__v39FieldRuntime,scene=runtime?.game?.scene?.getScenes(true)?.[0],samples=runtime?.mapData?.terrainTestSamples;
    if(!scene){if(samples&&attempt<120)requestAnimationFrame(()=>render(attempt+1));return;}
    const old=scene.children.list.find(child=>child.name==='v39-terrain-test-labels');
    if(!samples||!window.isV39TestMode?.()){old?.destroy();return;}
    if(old)return;
    const layer=scene.add.container().setName('v39-terrain-test-labels').setDepth(15);
    for(const sample of samples){
      const point=center(sample.x+1,sample.y+3);
      layer.add(scene.add.text(point.x,point.y,`${sample.index+1}. ${sample.name}`,{fontSize:'17px',color:'#ffffff',backgroundColor:'#102026',padding:{x:4,y:2}}).setOrigin(.5));
    }
    scene.game.v39InvalidateRender?.();
  };
  requestAnimationFrame(()=>render(0));
}

window.startV39TerrainTest=async()=>{
  if(!window.isV39TestMode?.()||window.isV39MapInputLocked?.())return {ok:false};
  const result=window.startV39ExpeditionTest?.(false,{silentBanner:true});if(!result?.ok)return result;
  const rows=getGameDataRows('地形').filter(row=>String(row.地形||'').trim());
  const landmarks=v39VictoryLandmarkDefinitions(),markers={};
  const w=26,h=Math.ceil(rows.length/4)*6+2;
  const grid=Array.from({length:h},()=>Array(w).fill('海'));
  const heights=grid.map(row=>row.map(()=>0)),special=grid.map(row=>row.map(()=>''));
  const samples=rows.map((row,index)=>{
    const name=String(row.地形).trim(),x=2+index%4*6,y=2+Math.floor(index/4)*6;
    const landmark=landmarks.find(item=>item.name===name);
    const base=BASES[name]||name;
    for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){
      grid[y+dy][x+dx]=base;heights[y+dy][x+dx]=dx*3;
      if(SPECIAL_ICONS.has(name))special[y+dy][x+dx]=name;
    }
    if(landmark){
      const point={x:x+1,y:y+1},key=`${point.x},${point.y}`;
      markers[key]={id:`terrain-test-${index}`,kind:'victory-landmark',name,key,...point,
        occupiedTileKeys:[point,...getHexOffsetNeighbors(point.x,point.y)].map(p=>`${p.x},${p.y}`)};
    }
    const mode=patterns.terrains[name]?'地形画像':landmark?'勝利対象アイコン':SPECIAL_ICONS.has(name)?'特殊地形アイコン':row.生成対象===true?'通常地形':'専用描画未対応（下地を表示）';
    return {index,name,x,y,base,mode};
  });
  grid[0][0]='平地';
  const template=window.__v39FieldRuntime.mapData;
  const map={...template,w,h,grid,heightLevelMap:heights,specialMap:special,reliefMap:[],
    lavaMap:grid.map(row=>row.map(()=>false)),snowCoverMap:grid.map(row=>row.map(()=>false)),snowfallMap:[],
    dormantVolcanoMap:[],riverData:null,lavaFlowData:null,volcanoState:null,fogMap:[],
    terrainTestSamples:samples,disasterTestFixture:false,expeditionTestFixture:false,climateProfile:null,
    victoryTerrainSupport:null,victoryLandmarkPlan:null,entrances:[],specialtiesByTile:{}};
  const state=window.getV39GameState({includeWorlds:false}),player=state.players[0];
  const unit={...player.factionState.units[0],x:0,y:0,position:[0,0],worldId:'surface',squadId:'solo',transportAssignment:null,caveDuty:null};
  const faction={...player.factionState,units:[unit],squads:[{id:'solo',label:'単独',unitIds:[unit.id]}],settlements:[],selectedSettlementId:'',village:null,selectedUnitId:unit.id};
  const spatial={enemies:[],enemySquads:[],enemyNests:[],settlements:[],neutralVillages:[],wandererGroups:[],
    territoryOwnerByTile:{},territoryStateByTile:{},facilitiesByTile:{},groundLootByTile:{},specialtiesByTile:{},
    explorationSitesByTile:{},victoryLandmarksByTile:markers,worldEnvironment:{}};
  window.loadV39FieldSnapshot(map,{...window.__v39FieldRuntime.settings,w,h},{layerChange:true});
  window.setV39GameState({...spatial,players:[{...player,factionState:faction}],activeWorldId:'surface',
    explorationWorlds:{surface:{map,spatial,visibility:{}}}},{reason:'terrain-test-started',trackUnitDeaths:false});
  window.setV39WeatherOverlayEnabled?.(false);
  await window.waitForV39MapRenderSettled();
  scheduleLabels();window.activateV39FooterTab?.('test');
  window.dispatchEvent(new CustomEvent('v39:terrain-test-ready'));
  window.focusV39TerrainTestSample(0);
  return {ok:true,count:samples.length};
};
for(const event of ['v39:field-generated','v39:save-loaded','v39:display-settings-changed'])window.addEventListener(event,scheduleLabels);
