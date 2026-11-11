const key=point=>`${point.x},${point.y}`;

export function findV39RouteBlockingRubble(map,resolvePath){
  const rubble=map?.terrainDamage?.rubbleByTile||{};
  if(!Object.keys(rubble).length)return null;
  const clearMap={...map,terrainDamage:{...map.terrainDamage,rubbleByTile:{}}};
  const path=resolvePath(clearMap);
  const tile=path?.find(point=>rubble[key(point)]);
  return tile?{x:tile.x,y:tile.y,key:key(tile)}:null;
}
