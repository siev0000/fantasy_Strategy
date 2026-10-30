import { getHexDistance, normalizeWrappedCoordinate } from "./hex-grid.js";
import {getV39Rubble} from './v39-terrain-destruction.js';
import {resolveV39WallStepStructures} from './v39-wall-edges.js';

const key = p => `${p.x},${p.y}`;
const cube = p => { const q = p.x - (p.y - (p.y & 1)) / 2; return [q, -q-p.y, p.y]; };
function tileAt(values) {
  const rounded = values.map(Math.round);
  const errors = rounded.map((v,i) => Math.abs(v-values[i]));
  const index = errors.indexOf(Math.max(...errors));
  rounded[index] = -rounded[(index+1)%3]-rounded[(index+2)%3];
  const y = rounded[2];
  return {x:rounded[0]+(y-(y&1))/2,y};
}

export function hasV39SkillEffect(row, effect) {
  return String(row?.効果 || "").split(/[\s,:：;；/／|｜、]+/u).includes(effect);
}

// 奇数行のずれを含むキューブ座標で直線を延長する。地図端の折返しも同じ経路を使う。
export function v39HexRay(map, from, to, length = null) {
  let destination = to;
  if (map?.worldWrapEnabled) {
    for (const dx of [-map.w,0,map.w]) for (const dy of [-map.h,0,map.h]) {
      const point = {x:to.x+dx,y:to.y+dy};
      if (getHexDistance(from,point)<getHexDistance(from,destination)) destination=point;
    }
  }
  const steps = getHexDistance(from,destination);
  if (!steps) return [];
  const a=cube(from),b=cube(destination),out=[],seen=new Set([key(from)]);
  for (let i=1;i<=(length ?? steps);i++) {
    let point=tileAt(a.map((v,j)=>v+(b[j]-v)*i/steps));
    if (map?.worldWrapEnabled) point={x:normalizeWrappedCoordinate(point.x,map.w),y:normalizeWrappedCoordinate(point.y,map.h)};
    if (!map?.grid?.[point.y]?.[point.x] || seen.has(key(point))) break;
    seen.add(key(point)); out.push(point);
  }
  return out;
}

export function v39RayStructureAtStep(map, from, to, {wallsOnly=false}={}) {
  const crossed=new Set(resolveV39WallStepStructures(map,from,to).map(w=>w.id));
  return (map?.defenseStructures || []).find(structure => {
    if (structure.hp<=0 || (wallsOnly && structure.kind!=="壁")) return false;
    if (structure.kind==="結界") {
      const inside=p=>(structure.tiles || []).some(tile=>key(tile)===key(p));
      return inside(from)!==inside(to);
    }
    if (structure.kind!=="壁") return false;
    if (structure.edge) return crossed.has(structure.id);
    return (structure.tiles || []).some(tile=>key(tile)===key(to));
  }) || null;
}

export function hasV39WallLineOfSight(map, from, to, {showWall=false,ignorePlacedWalls=false}={}) {
  if (!map?.isUnderground && !Object.keys(map?.terrainDamage?.rubbleByTile||{}).length && (ignorePlacedWalls || !(map?.defenseStructures || []).some(row=>row.kind==="壁"&&row.hp>0))) return true;
  const ray=v39HexRay(map,from,to);
  if (key(from)!==key(to) && (!ray.length || key(ray.at(-1))!==key(to))) return false;
  let previous=from;
  for (const point of ray) {
    if (getV39Rubble(map,point.x,point.y)||(map.isUnderground && map.grid[point.y][point.x]!=="洞窟")
      || (!ignorePlacedWalls && v39RayStructureAtStep(map,previous,point,{wallsOnly:true}))) return showWall&&key(point)===key(to);
    previous=point;
  }
  return true;
}

export function v39UnitBlocksRay(unit, turn) {
  return Number(unit?.rayBlockExpiresAtTurn)>turn
    || (unit?.techniques || []).some(technique => {
      const row=technique.source || technique;
      return String(row.行動).toUpperCase()==="P" && hasV39SkillEffect(row,"遮断");
    });
}

export function traceV39AttackRay(map, from, to, units, {length=null, ignoreUnits=false, ignoreUnit=null, turn=1}={}) {
  const tiles=[],ray=v39HexRay(map,from,to,length);
  let previous=from;
  for (const point of ray) {
    if(getV39Rubble(map,point.x,point.y))return {tiles:[...tiles,point],impact:point,reason:'瓦礫'};
    if (map.isUnderground && map.grid[point.y][point.x]!=="洞窟") return {tiles:[...tiles,point],impact:point,reason:"地形"};
    tiles.push(point);
    const structure=v39RayStructureAtStep(map,previous,point);
    if (structure) return {tiles,impact:point,reason:structure.kind,structure};
    const candidates=units instanceof Map ? units.get(key(point)) || [] : units;
    const occupants=candidates.filter(unit=>unit.id!==from.id && key(unit)===key(point)
      && Number(unit.hp ?? unit.currentHp)>0 && unit.state!=="死亡");
    if (occupants.some(unit=>v39UnitBlocksRay(unit,turn))) return {tiles,impact:point,reason:"遮断"};
    // 味方は通常射線を通すが、明示的な「遮断」は陣営に関係なく先に判定する。
    if (!ignoreUnits && occupants.some(unit=>!ignoreUnit?.(unit))) return {tiles,impact:point,reason:"ユニット"};
    previous=point;
  }
  return {tiles,impact:tiles.at(-1)||from,reason:""};
}
