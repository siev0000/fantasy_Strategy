export function resolveV39ResistanceReduction(power,level,resistance,penetration=0) {
  const n=value=>Number.isFinite(Number(value))?Number(value):0;
  const effectiveResistance=Math.max(0,n(resistance)-Math.max(0,n(penetration)));
  const resistanceRate=Math.min(1,effectiveResistance/100);
  const targetLevel=Math.max(1,Math.floor(n(level)||1));
  const levelReduction=targetLevel/10*effectiveResistance;
  return {effectiveResistance,resistanceRate,targetLevel,levelReduction,reducedPower:Math.max(0,n(power)-levelReduction)};
}
