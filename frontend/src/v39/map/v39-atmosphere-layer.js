import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';
import {V39_FOG_BALANCE} from '../../lib/v39-gameplay-balance.js';
import {V39_ATMOSPHERE_DISPLAY as config,collectV39AtmosphereTiles,v39AtmospherePalette} from '../../lib/v39-atmosphere-display.js';

const SOURCE='v39-atmosphere-source',LAYER='v39-atmosphere-fog-layer';

export function v39AtmosphereArtworkVersion(scene){return scene.textures.exists(SOURCE)?1:0;}

function clear(scene){
  scene.children.list.find(child=>child.name===LAYER)?.destroy();
  for(const key of scene.v39AtmosphereTextureKeys||[])scene.textures.remove(key);
  scene.v39AtmosphereTextureKeys=[];
}

export function drawV39AtmosphereLayer(scene,data,state,vision,testMode){
  const palette=v39AtmospherePalette(),ready=!!v39AtmosphereArtworkVersion(scene);
  const tiles=collectV39AtmosphereTiles(data,state).filter(tile=>testMode||vision.has(tile.key));
  const signature=JSON.stringify([data.w,data.h,ready,palette,tiles]);
  if(scene.v39AtmosphereSignature===signature&&scene.children.list.some(child=>child.name===LAYER))return;
  scene.v39AtmosphereSignature=signature;clear(scene);
  const layer=scene.add.container().setDepth(13).setName(LAYER);
  const combinations=[...new Set(tiles.map(tile=>tile.kinds.join('|')))];
  layer.setData('atmosphere',{tileCount:tiles.length,combinations,palette,ready});
  if(!scene.v39AtmosphereCleanup){
    scene.v39AtmosphereCleanup=true;scene.events.once('shutdown',()=>clear(scene));
  }
  if(!tiles.length)return;
  if(!ready&&!scene.v39AtmosphereLoading){
    scene.v39AtmosphereLoading=true;
    const loaded=()=>{scene.v39AtmosphereSignature=null;window.renderV39Visibility?.();scene.game.v39InvalidateRender?.();};
    scene.load.once(`filecomplete-image-${SOURCE}`,loaded);
    scene.events.once('shutdown',()=>scene.load.off(`filecomplete-image-${SOURCE}`,loaded));
    scene.load.image(SOURCE,V39_FOG_BALANCE.normalImage);if(!scene.load.isLoading())scene.load.start();
  }
  const source=ready?scene.textures.get(SOURCE).getSourceImage():null;
  const variants=new Map(),chunks=new Map(),scale=config.resolution,size=config.chunkSize;
  const worldW=Math.ceil((data.w*hex.width+hex.oddRowOffsetX)*scale),worldH=Math.ceil(((data.h-1)*hex.rowStep+hex.height)*scale);
  for(const tile of tiles){
    const id=tile.kinds.join('|');let image=variants.get(id);
    if(!image){
      image=document.createElement('canvas');image.width=hex.width;image.height=hex.height;
      const ctx=image.getContext('2d');
      if(source)ctx.drawImage(source,0,0,image.width,image.height);else{ctx.fillStyle='#ffffff';ctx.fillRect(0,0,image.width,image.height);}
      // Multiply one ordered colour ramp into the fog's luminance; alpha is applied once below.
      const ramp=document.createElement('canvas');ramp.width=image.width;ramp.height=1;
      const r=ramp.getContext('2d'),gradient=r.createLinearGradient(0,0,ramp.width,0);
      tile.kinds.forEach((kind,index)=>gradient.addColorStop(tile.kinds.length===1?0:index/(tile.kinds.length-1),palette.find(row=>row.id===kind).color));
      r.fillStyle=gradient;r.fillRect(0,0,ramp.width,1);
      const colors=r.getImageData(0,0,ramp.width,1).data,pixels=ctx.getImageData(0,0,image.width,image.height);
      for(let i=0;i<pixels.data.length;i+=4){
        const column=(i/4)%image.width,alpha=pixels.data[i+3]/255;
        const luminance=255*(1-alpha)+(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3*alpha;
        for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(luminance*colors[column*4+c]/255);
        pixels.data[i+3]=Math.round(255*(config.textureAlphaFloor+(1-config.textureAlphaFloor)*alpha));
      }
      ctx.putImageData(pixels,0,0);variants.set(id,image);
    }
    const left=tile.x*hex.width+(tile.y%2?hex.oddRowOffsetX:0),top=tile.y*hex.rowStep;
    for(let cy=Math.floor(top*scale/size);cy<=Math.floor((top+hex.height)*scale/size);cy++)for(let cx=Math.floor(left*scale/size);cx<=Math.floor((left+hex.width)*scale/size);cx++){
      if(cx*size>=worldW||cy*size>=worldH)continue;
      const key=`v39-atmosphere-chunk-${cx}-${cy}`;let chunk=chunks.get(key);
      if(!chunk){
        chunk=scene.textures.createCanvas(key,Math.min(size,worldW-cx*size),Math.min(size,worldH-cy*size));chunks.set(key,chunk);scene.v39AtmosphereTextureKeys.push(key);
        layer.add(scene.add.image(cx*size/scale,cy*size/scale,key).setOrigin(0).setScale(1/scale).setAlpha(V39_FOG_BALANCE.displayAlpha));
      }
      const ctx=chunk.context;ctx.save();ctx.translate(-cx*size,-cy*size);ctx.scale(scale,scale);
      ctx.beginPath();ctx.moveTo(left+hex.width/2,top);ctx.lineTo(left+hex.width,top+hex.height-hex.rowStep);
      ctx.lineTo(left+hex.width,top+hex.rowStep);ctx.lineTo(left+hex.width/2,top+hex.height);
      ctx.lineTo(left,top+hex.rowStep);ctx.lineTo(left,top+hex.height-hex.rowStep);ctx.closePath();ctx.clip();
      ctx.drawImage(image,left,top);ctx.restore();
    }
  }
  for(const chunk of chunks.values())chunk.refresh();
  scene.game.v39InvalidateRender?.();
}
