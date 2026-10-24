import {V39_RECRUIT_TRAINING_BALANCE as balance} from "./v39-gameplay-balance.js";
import {resolveV39UnitRaceCategory, resolveV39UnitTotalExpForLevel, grantV39UnitExperience} from "./v39-unit-experience.js";
import {resolveV39AssignedRecruitInstructor, getV39RecruitInstructorFacility} from "./v39-recruit-instructor.js";
import {getV39FacilityRecruitmentClasses} from "./v39-facility-recruitment.js";
import {supplyV39DefaultTools} from "./v39-consumables.js";
import {resolveV39CitySpecializationModifiers} from './v39-city-specialization-rules.js';

export function inspectV39RecruitTraining(faction, village, unit, state = {}, tileKey) {
  const instructor = resolveV39AssignedRecruitInstructor(faction, village, unit, state, tileKey);
  const expPerTurn = Math.max(1,Math.floor((balance.baseExpPerTurn + (instructor ? Number(instructor.level) * balance.instructorExpPerLevel : 0))
    * Math.max(0,1+resolveV39CitySpecializationModifiers(village).trainingExpPercent/100)));
  const requiredExp = Math.max(balance.minimumTrainingExp,
    resolveV39UnitTotalExpForLevel(unit.level, resolveV39UnitRaceCategory(unit)));
  return {requiredExp, expPerTurn, instructor, instructorRewardExp:balance.instructorRewardExpPerTurn, turns:Math.ceil(requiredExp / expPerTurn)};
}

export function getV39RecruitTrainingSlots(faction, village, className, state = {}) {
  const facility = getV39RecruitInstructorFacility(faction, village, className, state);
  const slots = facility.tileKeys.flatMap(tileKey => Array.from({length:balance.trainingSlotsPerFacility}, (_, index) => ({
    id:`${tileKey}:${index}`, tileKey, facilityName:facility.facilityName
  })));
  // 基礎職の施設なし作成は既存ルールを維持し、拠点の基礎枠に限定する。
  const hasFacility = Object.values(village.tileFacilityMap || {}).some(names => names.includes(facility.facilityName));
  const upperClass = getV39FacilityRecruitmentClasses().some(entry => entry.className === className);
  if (!hasFacility && !upperClass) slots.push(...Array.from({length:balance.basicTrainingSlots}, (_, index) => ({
    id:`base:${village.settlementId}:${index}`, tileKey:"", facilityName:"拠点の基礎訓練枠"
  })));
  return slots;
}

export function inspectV39RecruitTrainingQueue(faction, state = {}) {
  const occupied = new Set();
  const playerId = state.players?.find(p => p.factionState === faction)?.id;
  return (faction.unitTrainingQueue || []).map(entry => {
    const village = faction.settlements?.find(row => row.settlementId === entry.settlementId && row.placed
      && (!playerId || !row.ownerPlayerId || row.ownerPlayerId === playerId));
    if (!village) return {entry, status:"paused", reason:"拠点が利用できません"};
    const slots = getV39RecruitTrainingSlots(faction, village, entry.unit.className, state);
    const free = slots.filter(slot => !occupied.has(slot.id));
    const slot = free.find(slot => slot.id === entry.trainingSlotId) || free[0];
    if (!slot) return {entry, village, status:slots.length ? "waiting" : "paused", reason:slots.length ? "順番待ち" : "利用できる訓練施設がありません"};
    occupied.add(slot.id);
    return {entry, village, slot, status:"training", training:inspectV39RecruitTraining(faction, village, entry.unit, state, slot.tileKey)};
  });
}

// 全プレイヤー・敵ターン終了後に一度だけ呼ぶ。予約は所属拠点に固定する。
export function advanceV39RecruitTraining(state, turnNumber) {
  const completedUnits = [];
  const players = state.players.map(player => {
    const faction = player.factionState;
    let stockFaction=faction;
    const queue = [];
    let units = [...(faction.units || [])];
    const instructorIds = new Set();
    // ターン開始時に枠を確定し、完了した枠で同じターンに次の予約を進めない。
    for (const task of inspectV39RecruitTrainingQueue(faction, state)) {
      const {entry, village, training, slot} = task;
      if (turnNumber <= entry.lastProcessedTurn) { queue.push(entry); continue; }
      if (task.status !== "training") {queue.push({...entry, lastProcessedTurn:turnNumber});continue;}
      if (training.instructor) instructorIds.add(training.instructor.id);
      const progressExp = Math.min(entry.requiredExp, entry.progressExp + training.expPerTurn);
      if (progressExp < entry.requiredExp) {
        queue.push({...entry, progressExp, trainingSlotId:slot.id, lastProcessedTurn:turnNumber});
      } else {
        const supplied=supplyV39DefaultTools(stockFaction,entry.settlementId,{...entry.unit,x:village.x,y:village.y,position:[village.x,village.y],worldId:'surface'});
        stockFaction=supplied.faction;
        const unit=supplied.unit;
        units.push(unit);
        completedUnits.push({playerId:player.id, unit});
      }
    }
    // 同時訓練数で報酬を増やさず、全予約を同じターン開始時の教官Lvで進行する。
    units = units.map(unit => {
      if (!instructorIds.has(unit.id) || Number(unit.lastRecruitInstructorExpTurn || 0) >= turnNumber) return unit;
      const result = grantV39UnitExperience(unit, balance.instructorRewardExpPerTurn);
      return {...result.unit, lastRecruitInstructorExpTurn:turnNumber};
    });
    return {...player, factionState:{...stockFaction, units, unitTrainingQueue:queue}};
  });
  return {state:{...state, players}, completedUnits};
}
