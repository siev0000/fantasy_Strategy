import {getHexDistance} from './hex-grid.js';
import {resolveV39DefenseReducedPower} from './v39-defense-rules.js';
import {applyV39TerrainModifiers} from './v39-terrain-modifiers.js';

// Projection follows the live disaster footprint; no unit state, HP or protection is consumed.
export function resolveV39DisasterMovementPenalty(map,unit,points=[unit]){
  let movementReduction=0,flightReduction=0;
  const fields=(map?.disasterFields||[]).filter(field=>field.movementImpediment&&points.some(point=>point&&field.tileKeys?.includes(`${point.x},${point.y}`)));
  if(!fields.length)return {movementReduction,flightReduction};
  const adjusted=applyV39TerrainModifiers({...unit,...points[0]},map);
  for(const field of fields){
    const rule=field.movementImpediment;
    if(!['power','edgeMultiplier','reductionPerPower','flightMultiplier','maximumReduction'].every(key=>typeof rule[key]==='number'&&Number.isFinite(rule[key]))||rule.maximumReduction<0||rule.maximumReduction>=1)continue;
    const radius=Math.max(0,Number(field.radius)||0);
    for(const point of points){
      if(!point||!field.tileKeys?.includes(`${point.x},${point.y}`))continue;
      const distance=getHexDistance(field,point);
      const falloff=radius>0?1-(1-rule.edgeMultiplier)*Math.min(1,distance/radius):1;
      const power=rule.power*falloff;
      const effectivePower=resolveV39DefenseReducedPower(power,adjusted?.status?.防御);
      const rate=effectivePower*rule.reductionPerPower;
      movementReduction=Math.max(movementReduction,Math.min(rule.maximumReduction,rate));
      flightReduction=Math.max(flightReduction,Math.min(rule.maximumReduction,rate*rule.flightMultiplier));
    }
  }
  return {movementReduction,flightReduction};
}
