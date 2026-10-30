import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';
import {V39_VORTEX_DISPLAY as config,v39VortexPlacement} from '../../lib/v39-vortex-display.js';
import {loadV39SharedImageTexture} from './v39-shared-image-texture.js';
import {createV39HexFootprintMask} from './v39-hex-footprint-mask.js';
const KEY='v39-typhoon-vortex',layers=new WeakMap();
function clear(scene){
  const layer=layers.get(scene);if(!layer)return;
  scene.events.off('update',layer.update);scene.events.off('shutdown',layer.cleanup);
  layer.container.destroy();for(const mask of layer.masks)mask.destroy();for(const graphic of layer.graphics)graphic.destroy();layers.delete(scene);
}
export function drawV39VortexLayer(scene,fields,url){
  if(!fields.length){clear(scene);return;}
  const signature=JSON.stringify(fields),previous=layers.get(scene);
  if(previous?.signature===signature)return;
  if(!scene.textures.exists(KEY)){
    if(!scene.v39VortexLoading){scene.v39VortexLoading=true;loadV39SharedImageTexture(scene,KEY,url,()=>{scene.v39VortexLoading=false;if(scene.sys.isActive())window.renderV39Visibility?.();scene.game.v39InvalidateRender?.();});}
    return;
  }
  clear(scene);
  const container=scene.add.container().setDepth(config.depth).setName('v39-typhoon-vortex-layer');
  const layer={container,signature,masks:[],graphics:[],images:[],lastTime:-Infinity};
  for(const field of fields){
    const p=v39VortexPlacement(field,hex),{mask,graphic}=createV39HexFootprintMask(scene,field.tileKeys,hex);
    layer.masks.push(mask);layer.graphics.push(graphic);
    const image=scene.add.image(p.x,p.y,KEY).setDisplaySize(p.diameter,p.diameter).setAlpha(config.opacity).setMask(mask).setData('disasterId',config.disasterId);
    container.add(image);layer.images.push(image);
  }
  layer.update=time=>{
    if(time-layer.lastTime<config.frameMilliseconds)return;layer.lastTime=time;
    let visible=false;const view=scene.cameras.main.worldView;
    for(const image of layer.images){
      if(image.x+image.displayWidth/2<view.x||image.x-image.displayWidth/2>view.x+view.width||image.y+image.displayHeight/2<view.y||image.y-image.displayHeight/2>view.y+view.height)continue;
      image.rotation=-time/config.rotationMilliseconds*Math.PI*2;visible=true;
    }
    if(visible)scene.game.v39InvalidateRender?.();
  };
  layer.cleanup=()=>clear(scene);layers.set(scene,layer);scene.events.on('update',layer.update);scene.events.once('shutdown',layer.cleanup);
  scene.game.v39InvalidateRender?.();
}
