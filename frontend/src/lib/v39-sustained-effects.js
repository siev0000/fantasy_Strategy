import {scaleV39TransformationHp} from './v39-transformation.js';
import {resolveV39DefenseFootprint,v39DefenseNeighbors} from './v39-defense-rules.js';

export const isV39SustainedSkill = row => String(row?.効果時間 ?? '').trim() === '持続';
export const isV39SustainedTornado = row => isV39SustainedSkill(row) && String(row?.効果 ?? '').split(/[\s/／,，、|]+/u).includes('竜巻');
export const v39TornadoTiles = (map,area) => resolveV39DefenseFootprint(map,area.center,{範囲:'三角形'},area.facing);
export function moveV39SustainedTornado(map,area){
  if(!area.moving)return area;
  const next=v39DefenseNeighbors(area.center)[area.facing];
  if(!next||!map?.grid?.[next.y]?.[next.x])return area;
  return {...area,center:{x:next.x,y:next.y}};
}

export function v39SustainCost(row) {
  return {
    ap: Math.ceil(Math.max(0, Number(row?.AP消費) || 0) / 2),
    hp: Math.ceil(Math.max(0, Number(row?.HP消費) || 0) / 2)
  };
}

export function advanceV39SustainedEffects(player) {
  const faction = player.factionState;
  const runtime = faction?.combatRuntime || {};
  const effectsById = { ...(runtime.activeEffectsByUnitId || {}) };
  let changed = false;
  const unitById = new Map((faction?.units || []).map(unit => [unit.id,unit]));
  for (const [targetId,effects] of Object.entries(effectsById)) {
    if (!Array.isArray(effects) || !effects.some(effect => effect.sustained)) continue;
    const remaining = [];
    let restoreMaxHp = null;
    for (const effect of effects) {
      if (!effect.sustained) { remaining.push(effect); continue; }
      const payerId=effect.sustainOwnerId || targetId;
      const payer=unitById.get(payerId);
      const cost = v39SustainCost(effect.skillRow);
      const ap=Number(payer?.ap ?? payer?.currentAp) || 0;
      const hp=Number(payer?.hp ?? payer?.currentHp) || 0;
      if (payer && unitById.get(targetId) && hp > 0 && ap >= cost.ap && hp > cost.hp) {
        unitById.set(payerId,{...payer,ap:ap-cost.ap,currentAp:ap-cost.ap,actionPoint:ap-cost.ap,hp:hp-cost.hp,currentHp:hp-cost.hp,
          sustainApPaid:(Number(payer.sustainApPaid)||0)+cost.ap});
        remaining.push(effect);
        changed = true;
      } else {
        if (effect.stackGroup === 'transformation') restoreMaxHp = effect.baseMaxHp;
        changed = true;
      }
    }
    if (remaining.length) effectsById[targetId] = remaining;
    else delete effectsById[targetId];
    if (restoreMaxHp)unitById.set(targetId,scaleV39TransformationHp(unitById.get(targetId),restoreMaxHp));
  }
  const units=(faction?.units || []).map(unit=>unitById.get(unit.id));
  return changed ? { ...player, factionState:{...faction,units,combatRuntime:{...runtime,activeEffectsByUnitId:effectsById}} } : player;
}
