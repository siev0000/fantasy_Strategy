import {PhaserEffectPlayer} from '../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs';
import {resolveV39EffectPlaybackDescriptor} from '../combat/v39-effect-player.js';
import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';
import {V39_TORNADO_DISPLAY as config} from '../../lib/v39-tornado-display.js';
import {v39VortexPlacement} from '../../lib/v39-vortex-display.js';
import {loadV39SharedImageTexture} from './v39-shared-image-texture.js';
const layers=new WeakMap();
function remove(entry){
  entry.player.effectImage?.clearMask(false);entry.player.previousImage?.clearMask(false);
  entry.player.destroy();entry.mask.destroy();entry.graphic.destroy();
}
function clear(scene){
  const layer=layers.get(scene);if(!layer)return;
  for(const entry of layer.entries.values())remove(entry);
  scene.events.off('shutdown',layer.cleanup);scene.events.off('sleep',layer.cleanup);layers.delete(scene);
  scene.game.v39InvalidateRender?.();
}
export function drawV39TornadoLayer(scene,fields){
  if(!fields.length){clear(scene);return;}
  const descriptor=resolveV39EffectPlaybackDescriptor(config.effectName);if(!descriptor)return;
  let layer=layers.get(scene);
  if(!layer){layer={entries:new Map(),cleanup:()=>clear(scene)};layers.set(scene,layer);scene.events.once('shutdown',layer.cleanup);scene.events.once('sleep',layer.cleanup);}
  const keep=new Set(fields.map(field=>field.id));
  for(const [id,entry]of layer.entries)if(!keep.has(id)){remove(entry);layer.entries.delete(id);}
  for(const field of fields){
    const signature=JSON.stringify([field,descriptor]);
    const previous=layer.entries.get(field.id);if(previous?.signature===signature)continue;
    if(previous)remove(previous);
    const graphic=scene.make.graphics({add:false});graphic.fillStyle(0xffffff,1);
    for(const key of field.tileKeys){
      const [x,y]=key.split(',').map(Number),left=x*hex.width+(y%2?hex.oddRowOffsetX:0),top=y*hex.rowStep;
      graphic.fillPoints([{x:left+hex.width/2,y:top},{x:left+hex.width,y:top+hex.height-hex.rowStep},{x:left+hex.width,y:top+hex.rowStep},{x:left+hex.width/2,y:top+hex.height},{x:left,y:top+hex.rowStep},{x:left,y:top+hex.height-hex.rowStep}],true);
    }
    const mask=graphic.createGeometryMask();
    const player=new PhaserEffectPlayer(scene,{depth:config.depth,textureLoader:async src=>{
      const key=`v39-field-effect:${src}`;
      return await loadV39SharedImageTexture(scene,key,src)?key:null;
    }});
    const entry={signature,player,mask,graphic};layer.entries.set(field.id,entry);
    const placement=v39VortexPlacement(field,hex);
    void player.play({...descriptor,sequenceSources:descriptor.sequenceSources.slice(0,1),x:placement.x,y:placement.y,
      fitDiameterPx:placement.diameter*descriptor.scaleMultiplierPercent/100,angleDeg:descriptor.rotationDeg,
      loop:true,totalDurationMs:config.frameMilliseconds*(config.lastFrame-config.firstFrame+1),
      showPreviousFrameGhost:false,renderStyle:'none',depth:config.depth,displayName:'v39-tornado-effect',
      onFrame:()=>{
        player.effectImage?.setMask(mask);
        const view=scene.cameras.main.worldView;
        if(placement.x+placement.diameter/2>=view.x&&placement.x-placement.diameter/2<=view.x+view.width&&placement.y+placement.diameter/2>=view.y&&placement.y-placement.diameter/2<=view.y+view.height)scene.game.v39InvalidateRender?.();
      }}).catch(error=>console.error('[v39 tornado effect]',error));
  }
}
