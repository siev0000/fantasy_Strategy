import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';
import {V39_RAIN_DISPLAY as config,buildV39RainStreaks} from '../../lib/v39-rain-display.js';

const layers=new WeakMap();
export function drawV39RainLayer(scene,tiles){
  let layer=layers.get(scene);
  if(!tiles.length){
    if(layer){scene.events.off('update',layer.update);scene.events.off('shutdown',layer.cleanup);layer.graphic.destroy();layers.delete(scene);scene.game.v39InvalidateRender?.();}
    return;
  }
  if(!layer){
    layer={tiles:[],signature:'',lastTime:-Infinity,visibleKey:'',visibleTiles:[]};
    layer.graphic=scene.add.graphics().setDepth(config.depth).setName('v39-rain-layer');
    layer.update=(time)=>{
      if(time-layer.lastTime<config.frameMilliseconds)return;
      layer.lastTime=time;
      const view=scene.cameras.main.worldView;
      const cameraKey=[view.x,view.y,view.width,view.height,layer.signature].join(':');
      if(layer.visibleKey!==cameraKey){
        layer.visibleKey=cameraKey;
        layer.visibleTiles=layer.tiles.filter(tile=>{
          const left=tile.x*hex.width+(tile.y%2?hex.oddRowOffsetX:0),top=tile.y*hex.rowStep;
          return left+hex.width>=view.x&&left<=view.x+view.width&&top+hex.height>=view.y&&top<=view.y+view.height;
        });
      }
      const streaks=buildV39RainStreaks(layer.visibleTiles,time,hex);
      if(!streaks.length&&!layer.hadStreaks)return;
      const width=Math.max(config.lineWidth,config.minimumScreenWidth/Math.max(.1,scene.cameras.main.zoom||1));
      layer.graphic.clear().lineStyle(width,parseInt(config.color.slice(1),16),config.opacity);
      for(const streak of streaks)if(streak.kind!=='snow')layer.graphic.lineBetween(streak.x1,streak.y1,streak.x2,streak.y2);
      for(const streak of streaks){
        if(streak.kind!=='snow')continue;
        layer.graphic.fillStyle(parseInt(streak.color.slice(1),16),streak.opacity).fillCircle(streak.x1,streak.y1,streak.radius);
        if(streak.outlineWidth>0&&streak.outlineColor)layer.graphic.lineStyle(streak.outlineWidth,parseInt(streak.outlineColor.slice(1),16),streak.outlineOpacity??1)
          .strokeCircle(streak.x1,streak.y1,streak.radius);
      }
      layer.graphic.setData('rain',{tileCount:layer.tiles.length,visibleTileCount:layer.visibleTiles.length,streakCount:streaks.length,snowCount:streaks.filter(streak=>streak.kind==='snow').length,snowTileCount:layer.tiles.filter(tile=>config.types[tile.strength]?.kind==='snow').length});
      layer.hadStreaks=streaks.length>0;scene.game.v39InvalidateRender?.();
    };
    layers.set(scene,layer);scene.events.on('update',layer.update);
    layer.cleanup=()=>{scene.events.off('update',layer.update);layers.delete(scene);};
    scene.events.once('shutdown',layer.cleanup);
  }
  const signature=JSON.stringify(tiles);
  if(signature!==layer.signature){layer.tiles=tiles;layer.signature=signature;layer.lastTime=-Infinity;layer.update(scene.time.now);}
}
