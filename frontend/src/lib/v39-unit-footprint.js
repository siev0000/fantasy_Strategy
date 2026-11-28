import {getHexDistance,getHexOffsetNeighbors,normalizeWrappedCoordinate} from './hex-grid.js';
import {V39_SIZ_STATUS_BALANCE} from './v39-gameplay-balance.js';
import {resolveV39TransformedUnitSiz} from './v39-transformation.js';

export const v39FootprintKey=({x,y})=>`${x},${y}`;

export function v39MapHexDistance(map,from,to) {
  let distance=getHexDistance(from,to);
  if(map?.worldWrapEnabled) {
    for(const dx of [-map.w,0,map.w])for(const dy of [-map.h,0,map.h]){
      distance=Math.min(distance,getHexDistance(from,{x:to.x+dx,y:to.y+dy}));
    }
  }
  return distance;
}

export function v39FootprintForSiz(anchor,siz,map) {
  const top={x:anchor.x,y:anchor.y};
  if(!(Number(siz)>=V39_SIZ_STATUS_BALANCE.largeUnitMinSiz))return [top];
  const bottom=getHexOffsetNeighbors(top.x,top.y).slice(4,6);
  return [top,...bottom.map(point=>map?.worldWrapEnabled
    ? {x:normalizeWrappedCoordinate(point.x,map.w),y:normalizeWrappedCoordinate(point.y,map.h)}
    : point)];
}

export function isV39FootprintOnMap(tiles,map) {
  return new Set(tiles.map(v39FootprintKey)).size===tiles.length
    &&tiles.every(tile=>!!map?.grid?.[tile.y]?.[tile.x]);
}

export function getV39UnitFootprint(unit,map,state,anchor=unit) {
  return v39FootprintForSiz(anchor,resolveV39TransformedUnitSiz(unit,state),map);
}

export function v39UnitOccupiesTile(unit,tile,map,state) {
  return getV39UnitFootprint(unit,map,state).some(point=>point.x===tile.x&&point.y===tile.y);
}

export function getV39UnitFootprintDistance(a,b,map,state) {
  let distance=Infinity;
  for(const from of getV39UnitFootprint(a,map,state)){
    for(const to of getV39UnitFootprint(b,map,state)){
      distance=Math.min(distance,v39MapHexDistance(map,from,to));
    }
  }
  return distance;
}

export function v39FootprintAreaScale(unit,area,map,state) {
  let scale;
  for(const point of getV39UnitFootprint(unit,map,state)){
    const key=v39FootprintKey(point);
    const candidate=area.blockedUnitKeys?.has(key)?undefined:area.get(key);
    if(candidate!==undefined&&(scale===undefined||candidate>scale))scale=candidate;
  }
  return scale;
}
