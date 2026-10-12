import defaults from "../../../config/v39-facility-recruitment-defaults.json";

export function resolveV39FacilityClassGrowth(unit, raceKind) {
  const start = unit?.classGrowthStart;
  const caps = defaults.growthCaps[raceKind];
  const prior = Object.values(unit?.prerequisiteClassLevels || {}).reduce((sum,value) => sum + Math.max(0,Number(value) || 0),0);
  if (!start || !caps || !prior) return null;
  const raceStart = Math.min(caps.raceLevels,Math.max(0,Number(start.raceLevels) || 0));
  const classStart = Math.min(caps.classLevels,Math.max(0,Number(start.classLevels) || 0));
  const raceRoom = caps.raceLevels - raceStart, classRoom = caps.classLevels - classStart;
  const gained = Math.min(raceRoom + classRoom,Math.max(0,Math.floor(Number(unit.level) || 1) - Number(start.level)));
  let raceGain = Math.min(raceRoom,raceKind === "人族" ? 0 : Math.ceil(gained / 2));
  let classGain = Math.min(classRoom,raceKind === "人族" ? gained : Math.floor(gained / 2));
  // 上限側で余った成長分は、未上限の側へ回す。
  let remainder = gained - raceGain - classGain;
  const classOverflow = Math.min(remainder,classRoom - classGain);
  classGain += classOverflow;
  remainder -= classOverflow;
  raceGain += Math.min(remainder,raceRoom - raceGain);
  return {raceLevels:raceStart + raceGain,classLevels:classStart + classGain,
    levelCap:prior + caps.classLevels + caps.raceLevels,caps};
}
