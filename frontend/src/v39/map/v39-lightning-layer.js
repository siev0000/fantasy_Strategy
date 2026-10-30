import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';
import {V39_LIGHTNING_DISPLAY as config,v39LightningPaths} from '../../lib/v39-lightning-display.js';
const layers=new WeakMap();
const color=value=>parseInt(value.slice(1),16);
function inView(scene,tile){
  const view=scene.cameras?.main?.worldView;if(!view)return true;
  const x=tile.x*hex.width+(tile.y%2?hex.oddRowOffsetX:0),y=tile.y*hex.rowStep;
  return x+hex.width>=view.x&&x<=view.x+view.width&&y+hex.height>=view.y&&y-hex.height<=view.y+view.height;
}
function stroke(graphic,paths,width,alpha=1,impact=false){
  for(const [lineWidth,tint,opacity]of [[width*2.5,color(impact?config.strikeColor:config.color),impact ? 0.55 : 0.2],[width,color(impact?config.strikeCoreColor:config.coreColor),impact?1:config.opacity]]){
    graphic.lineStyle(lineWidth,tint,opacity*alpha);
    for(const path of paths){graphic.beginPath();graphic.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))graphic.lineTo(p.x,p.y);graphic.strokePath();}
  }
}
function clear(scene){
  const layer=layers.get(scene);if(!layer)return;
  scene.events.off('update',layer.frameUpdate);scene.events.off('sleep',layer.cleanup);scene.events.off('shutdown',layer.cleanup);
  layer.preview.destroy();layer.impact.destroy();layers.delete(scene);scene.game?.v39InvalidateRender?.();
}
function ensure(scene){
  let layer=layers.get(scene);if(layer)return layer;
  layer={tiles:[],strikes:[],seen:new Set(),lastTime:-Infinity};
  layer.preview=scene.add.graphics().setDepth(config.depth).setName('v39-lightning-preview');
  layer.impact=scene.add.graphics().setDepth(config.strikeDepth).setName('v39-lightning-impact');
  layer.update=(time=scene.time?.now||0,fromFrame=false)=>{
    if(fromFrame){
      const elapsed=layer.lastFrameTime==null?0:Math.min(config.maximumAnimationStepMilliseconds,Math.max(0,time-layer.lastFrameTime));
      layer.lastFrameTime=time;
      // Tick handlers can block rendering; do not expire a bolt before its first frame.
      for(const strike of layer.strikes){if(strike.presented)strike.age+=elapsed;else strike.presented=true;}
    }
    if(time-layer.lastTime<config.frameMilliseconds)return;
    layer.lastTime=time;
    const width=Math.max(config.lineWidth,config.minimumScreenWidth/Math.max(.1,scene.cameras?.main?.zoom||1));
    const visible=layer.tiles.filter(tile=>inView(scene,tile));
    const stride=Math.max(1,Math.ceil(visible.length/config.maximumPreviewTiles));
    layer.preview.clear();
    for(let i=0;i<visible.length;i+=stride)stroke(layer.preview,v39LightningPaths(visible[i],time,hex),width);
    const hadStrikes=layer.strikes.length>0;
    layer.strikes=layer.strikes.filter(strike=>strike.age<config.strikeMilliseconds);
    layer.impact.clear();
    for(const strike of layer.strikes)if(inView(scene,strike)){
      const alpha=1-Math.max(0,strike.age-config.strikeHoldMilliseconds)/(config.strikeMilliseconds-config.strikeHoldMilliseconds);
      stroke(layer.impact,v39LightningPaths(strike,time,hex,true),width*config.strikeWidthMultiplier,alpha,true);
    }
    layer.preview.setData('lightning',{tileCount:layer.tiles.length,visibleTileCount:visible.length});
    layer.impact.setData('strikeCount',layer.strikes.length);
    if(visible.length||hadStrikes)scene.game?.v39InvalidateRender?.();
    if(!layer.tiles.length&&!layer.strikes.length)clear(scene);
  };
  layer.cleanup=()=>clear(scene);
  layer.frameUpdate=time=>layer.update(time,true);
  layers.set(scene,layer);scene.events.on('update',layer.frameUpdate);scene.events.once('sleep',layer.cleanup);scene.events.once('shutdown',layer.cleanup);
  return layer;
}
export function drawV39LightningLayer(scene,tiles){
  if(!tiles.length&&!layers.has(scene))return;
  const layer=ensure(scene),signature=JSON.stringify(tiles);
  if(signature===layer.signature)return;
  layer.signature=signature;layer.tiles=tiles;layer.lastTime=-Infinity;layer.update(scene.time?.now||0);
}
export function playV39LightningStrikes(scene,strikes){
  if(!strikes.length)return;
  const layer=ensure(scene),now=scene.time?.now||0;
  for(const strike of strikes)if(!layer.seen.has(strike.id)&&inView(scene,strike)){
    layer.seen.add(strike.id);layer.strikes.push({...strike,age:0,presented:false});
  }
  while(layer.seen.size>512)layer.seen.delete(layer.seen.values().next().value);
  layer.lastTime=-Infinity;layer.update(now);
}
