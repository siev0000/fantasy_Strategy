import {HEX_TILE_CONFIG as metrics} from '../../lib/phaser-map-panel-config.js';
import {getHexOffsetNeighbors} from '../../lib/hex-grid.js';
import {cacheStaticGraphicsLayer,removeStaticGraphicsCache} from './v39-static-graphics-cache.js';

const NAME='v39-weather-overlay',LABELS=`${NAME}-labels`,DEPTH=8;
const TEMPERATURE_COLORS=[[0,0x639ee2],[10,0x69cece],[20,0xd9df80],[30,0xf2ad62],[Infinity,0xe66e5c]];
const EDGE_BY_NEIGHBOR=[4,1,5,0,3,2];
const attached=new WeakSet(),layers=new WeakMap();
let enabled=false,pending=0,lastScene=null,lastMap=null,lastSignature='',renderCount=0;

function visible(){
  return enabled&&window.isV39TestMode?.()===true;
}

function clear(scene){
  if(scene)layers.delete(scene);
  for(const child of [...(scene?.children?.list||[])])if([NAME,LABELS].includes(child.name))child.destroy();
  if(scene)removeStaticGraphicsCache(scene,NAME);
}

function points(x,y){
  const {width:w,height:h,rowStep:s,oddRowOffsetX:o}=metrics,left=x*w+(y%2?o:0),top=y*s;
  return [{x:left+w/2,y:top},{x:left+w,y:top+h-s},{x:left+w,y:top+s},
    {x:left+w/2,y:top+h},{x:left,y:top+s},{x:left,y:top+h-s}];
}

function render(){
  const runtime=window.__v39FieldRuntime,map=runtime?.mapData,scene=runtime?.game?.scene?.getScenes(true)?.[0];
  if(!scene?.add)return;
  const active=visible()&&!map?.isUnderground;
  if(!active){
    if(lastSignature||layers.has(scene))clear(scene);lastSignature='';
    window.__v39WeatherOverlayStatus={active:false,renderCount};return;
  }
  const state=window.getV39GameState?.({includeWorlds:false}),profile=map?.climateProfile,weather=state?.worldEnvironment?.weather;
  if(!profile||weather?.profileId!==profile.id){clear(scene);lastSignature='';window.__v39WeatherOverlayStatus={active:false,renderCount};return;}
  const selected=scene.v39SelectedTile,size=profile.regionSize;
  const selectedRegion=selected?`${Math.floor(selected.x/size)},${Math.floor(selected.y/size)}`:'';
  const signature=JSON.stringify([profile.id,selectedRegion,weather.regions]);
  if(scene===lastScene&&map===lastMap&&signature===lastSignature&&scene.children.list.some(c=>c.name===LABELS))return;
  lastScene=scene;lastMap=map;lastSignature=signature;
  clear(scene);
  const graphic=scene.add.graphics().setDepth(DEPTH).setName(NAME);
  const labels=scene.add.container(0,0).setDepth(30).setName(LABELS);
  layers.set(scene,labels);
  if(!attached.has(scene)){attached.add(scene);scene.events.on('postupdate',()=>scaleLabels(scene));}
  let tileCount=0;
  for(const region of Object.values(profile.regions)){
    const row=weather.regions[region.id];if(!row)continue;
    const color=TEMPERATURE_COLORS.find(([maximum])=>row.temperature<=maximum)[1],selected=region.id===selectedRegion;
    const endX=Math.min(map.w,region.x+size),endY=Math.min(map.h,region.y+size);
    graphic.fillStyle(color,selected?0.2:0.12);graphic.lineStyle(selected?3:2,selected?0xffefab:color,.9);
    for(let y=region.y;y<endY;y++)for(let x=region.x;x<endX;x++){
      const p=points(x,y);graphic.fillPoints(p,true);tileCount++;
      getHexOffsetNeighbors(x,y).forEach((neighbor,index)=>{
        if(neighbor.x>=region.x&&neighbor.x<endX&&neighbor.y>=region.y&&neighbor.y<endY)return;
        const edge=EDGE_BY_NEIGHBOR[index],a=p[edge],b=p[(edge+1)%6];
        graphic.lineBetween(a.x,a.y,b.x,b.y);
      });
    }
    const x=(region.x+(endX-region.x)/2)*metrics.width,y=region.y*metrics.rowStep+metrics.height;
    const label=scene.add.text(x,y,`${Math.round(row.temperature)}℃`,{
      fontFamily:'Noto Sans JP, Meiryo, sans-serif',fontSize:'32px',fontStyle:'bold',color:'#ffffff',
      backgroundColor:'#14242a',padding:{x:6,y:3},stroke:'#10202a',strokeThickness:2
    }).setOrigin(.5,0).setName(`v39-weather-region:${region.id}`).setData('regionId',region.id).setData('weather',row.weather)
      .setData('bounds',{left:region.x*metrics.width,top:region.y*metrics.rowStep,
        right:endX*metrics.width,bottom:(endY-1)*metrics.rowStep+metrics.height,
        partialX:endX-region.x<size,partialY:endY-region.y<size});
    labels.add(label);
  }
  cacheStaticGraphicsLayer(scene,map,graphic,{name:NAME,depth:DEPTH});
  runtime.game.v39InvalidateRender?.();
  window.__v39WeatherOverlayStatus={active:true,regionCount:labels.list.length,tileCount,selectedRegion,renderCount:++renderCount};
  scaleLabels(scene);
}

function scaleLabels(scene){
  const labels=layers.get(scene);if(!labels?.scene)return;
  const camera=scene.cameras.main,zoom=Math.max(.05,camera.zoom);
  const key=[zoom,camera.scrollX,camera.scrollY,camera.width,camera.height].join(':');
  if(labels.getData('camera')===key)return;
  labels.setData('camera',key);
  const left=camera.scrollX+camera.width/2*(1-1/zoom),top=camera.scrollY+camera.height/2*(1-1/zoom);
  for(const label of labels.list){
    const bounds=label.getData('bounds'),x1=Math.max(left,bounds.left),x2=Math.min(left+camera.width/zoom,bounds.right),
      y1=Math.max(top,bounds.top),y2=Math.min(top+camera.height/zoom,bounds.bottom);
    const availableWidth=bounds.partialX?Math.max(x2-x1-8/zoom,32/zoom):x2-x1-8/zoom;
    const scale=Math.max(0,Math.min(1/zoom,availableWidth/label.width));
    const labelY=bounds.partialY?Math.min(y1+3/zoom,top+camera.height/zoom-label.height*scale-2/zoom):y1+5/zoom;
    const halfWidth=label.width*scale/2;
    const labelX=Math.min(left+camera.width/zoom-halfWidth-2/zoom,Math.max(left+halfWidth+2/zoom,(x1+x2)/2));
    label.setScale(scale).setPosition(labelX,labelY)
      .setVisible(x2>x1&&y2>y1&&(bounds.partialY||y2-y1>label.height*scale+4/zoom)&&scale*zoom>=.35);
  }
}

function schedule(){
  if(pending)return;
  pending=requestAnimationFrame(()=>{pending=0;render();});
}

window.setV39WeatherOverlayEnabled=value=>{enabled=value===true;schedule();};
window.isV39WeatherOverlayEnabled=()=>enabled;
window.getV39WeatherOverlayStatus=()=>({...window.__v39WeatherOverlayStatus});
for(const event of ['v39:field-generated','v39:game-state-changed','v39:map-render-batch-ended',
  'v39:footer-tab-changed','v39:test-tool-tab-changed','v39:display-settings-changed','v39:tile-selected'])window.addEventListener(event,schedule);
document.addEventListener('toggle',event=>{if(event.target?.matches?.('[data-test-section="field"]'))schedule();},true);
// Labels follow the visible part of each region; weather graphics stay cached.
schedule();
