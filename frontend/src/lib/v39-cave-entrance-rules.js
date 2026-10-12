// 地下の通路「洞窟」は対象外。地上では基本/特殊地形のどちらの配置にも対応する。
export function isV39SurfaceCaveEntrance(map,x,y){
  return !!map&&!map.isUnderground&&(map.grid?.[y]?.[x]==="洞窟"||map.specialMap?.[y]?.[x]==="洞窟");
}

export function isV39CaveEntranceDiscovered(faction,map,x,y){
  if(!isV39SurfaceCaveEntrance(map,x,y))return false;
  const key=`${x},${y}`,exploration=faction?.exploration;
  // 旧セーブの完了済み調査も有効。視界/探索済みだけでは発見しない。
  return !!exploration?.discoveredCaveEntrancesByTile?.[key]
    || (!exploration?.researchDiscoveryVersion && !!exploration?.surveyedTileKeys?.includes(key));
}

// 表示だけを隠す。入場/建築などに使う元の地形データは書き換えない。
export function visibleV39CaveTerrainLabel(faction,map,x,y){
  const terrain=map?.grid?.[y]?.[x]||"",special=map?.specialMap?.[y]?.[x]||"";
  if(isV39SurfaceCaveEntrance(map,x,y)&&!isV39CaveEntranceDiscovered(faction,map,x,y)){
    return special&&special!=="洞窟"?special:terrain==="洞窟"?"土地":terrain;
  }
  return special||terrain;
}
