// Capture world coordinates before unit selection can recenter the camera.
export function captureV39PointerTap(camera,clientPoint,resolveTile,data,clientX,clientY){
  camera.preRender?.();
  const point=clientPoint(clientX,clientY),world=camera.getWorldPoint(point.x,point.y);
  const tile=resolveTile(data,world.x,world.y);
  return {tile:tile?{x:tile.x,y:tile.y}:null,world:{x:world.x,y:world.y}};
}
