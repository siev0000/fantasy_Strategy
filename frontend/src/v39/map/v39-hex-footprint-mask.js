export function createV39HexFootprintMask(scene,tileKeys,hex){
  const graphic=scene.make.graphics({add:false});
  graphic.fillStyle(0xffffff,1);
  for(const key of tileKeys){
    const [x,y]=key.split(',').map(Number),left=x*hex.width+(y%2?hex.oddRowOffsetX:0),top=y*hex.rowStep;
    graphic.fillPoints([{x:left+hex.width/2,y:top},{x:left+hex.width,y:top+hex.height-hex.rowStep},{x:left+hex.width,y:top+hex.rowStep},{x:left+hex.width/2,y:top+hex.height},{x:left,y:top+hex.rowStep},{x:left,y:top+hex.height-hex.rowStep}],true);
  }
  const mask=graphic.createGeometryMask();
  return {mask,graphic,destroy(){mask.destroy();graphic.destroy();}};
}
