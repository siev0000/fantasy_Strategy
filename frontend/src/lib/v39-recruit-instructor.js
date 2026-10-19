import {getV39FacilityRecruitmentClasses} from "./v39-facility-recruitment.js";
import {V39_RECRUIT_TRAINING_BALANCE as balance} from "./v39-gameplay-balance.js";
import {resolveV39AutomaticRoute,resolveV39AutomaticMovementSteps} from "./v39-transport-rules.js";
import {resolveV39UnitMovementStepCost} from "./v39-terrain-traversal.js";
import {applyV39DisasterMovementDamage} from './v39-disaster-damage.js';

const surface = unit => !unit.worldId || unit.worldId === "surface";
const alive = unit => Number(unit.hp ?? unit.currentHp) > 0;
const keyOf = unit => `${unit.x},${unit.y}`;

export function getV39RecruitInstructorFacility(faction, village, className, state = {}) {
  const facilityName = getV39FacilityRecruitmentClasses().find(entry => entry.className === className)?.facilityName
    || balance.defaultInstructorFacilityName;
  const tiles = Object.entries(village.tileFacilityMap || {}).filter(([key,names]) => {
    const health = village.facilityStateByTile?.[key]?.[facilityName];
    return names.includes(facilityName) && (!state.territoryOwnerByTile || state.territoryOwnerByTile[key] === village.ownerPlayerId)
      && health?.status !== "損壊" && !(health && Number(health.hp) <= 0);
  }).map(([key]) => key);
  const assigned = tiles.find(key => faction.recruitInstructorTransfers?.[key]?.className === className
    || faction.recruitInstructorByTile?.[key]?.className === className);
  return {facilityName, tileKeys:tiles, tileKey:assigned || tiles[0] || "", settlementId:village.settlementId, className};
}

export function getV39RecruitInstructorCandidates(state, player, village, className) {
  const faction = player.factionState;
  const facility = getV39RecruitInstructorFacility(faction, village, className, state);
  if (village.ownerPlayerId && village.ownerPlayerId !== player.id) facility.tileKey = "";
  return {facility, candidates:(faction.units || []).filter(unit =>
    unit.className === className && alive(unit) && !unit.isMob
  ).map(unit => {
    const reasons = [];
    if(unit.tradeAssignment)reasons.push('取引の任務中');
    if(unit.caveDuty)reasons.push("鉱床の任務中");
    if (!surface(unit) || unit.x == null || unit.y == null || state.territoryOwnerByTile?.[keyOf(unit)] !== player.id) reasons.push("領土外");
    if (!facility.tileKey) reasons.push(`${facility.facilityName}未建設・損壊`);
    return {unit, reasons, available:reasons.length === 0};
  })};
}

export function assignV39RecruitInstructor(state, playerId, settlementId, className, unitId) {
  const player = state.players.find(row => row.id === playerId);
  const village = player?.factionState.settlements?.find(row => row.settlementId === settlementId && row.placed);
  if (!village || (village.ownerPlayerId && village.ownerPlayerId !== playerId)) return {ok:false, reason:"自分の拠点がありません", state};
  const {facility,candidates} = getV39RecruitInstructorCandidates(state, player, village, className);
  if (!facility.tileKey) return {ok:false, reason:`${facility.facilityName}の建設完了が必要`, state};
  const candidate = candidates.find(row => row.unit.id === unitId);
  if (unitId && !candidate?.available) return {ok:false, reason:candidate?.reasons.join(" / ") || "教官が見つかりません", state};
  const faction = player.factionState;
  const assignments = {...faction.recruitInstructorByTile};
  const previous = assignments[facility.tileKey];
  const transfers = {...faction.recruitInstructorTransfers};
  const previousTransfer = transfers[facility.tileKey];
  let units = faction.units.map(unit => unit.id === previousTransfer?.unitId
    ? {...unit,movementHold:previousTransfer.previousMovementHold === true} : unit);
  delete transfers[facility.tileKey];
  if (unitId) {
    if (previous?.unitId === unitId) return {ok:true,facility,state:{...state,players:state.players.map(row => row.id === playerId
      ? {...row,factionState:{...faction,units,recruitInstructorTransfers:transfers}} : row)}};
    const old = Object.values(assignments).find(row => row.unitId === unitId);
    const oldTransfer = Object.values(faction.recruitInstructorTransfers || {}).find(row => row.unitId === unitId);
    for (const [key,entry] of Object.entries(assignments)) if (entry.unitId === unitId) delete assignments[key];
    for (const [key,entry] of Object.entries(transfers)) if (entry.unitId === unitId) delete transfers[key];
    transfers[facility.tileKey] = {...facility, unitId, previousMovementHold:old?.previousMovementHold ?? oldTransfer?.previousMovementHold ?? candidate.unit.movementHold === true,
      lastProcessedTurn:0, status:"moving", reason:""};
    units = units.map(unit => unit.id === unitId ? {...unit,movementHold:true} : unit);
  } else {
    delete assignments[facility.tileKey];
    units = units.map(unit => unit.id === previous?.unitId ? {...unit,movementHold:previous.previousMovementHold === true} : unit);
  }
  return {ok:true, facility, state:{...state,players:state.players.map(row => row.id === playerId
    ? {...row,factionState:{...faction,units,recruitInstructorByTile:assignments,recruitInstructorTransfers:transfers}} : row)}};
}

export function advanceV39RecruitInstructorMovement(state, playerId, mapData, turnNumber) {
  const player = state.players.find(row => row.id === playerId);
  if (!player || !mapData?.grid?.length) return {state};
  const faction = player.factionState;
  let units = [...faction.units];
  const assignments = {...faction.recruitInstructorByTile};
  const transfers = {...faction.recruitInstructorTransfers};
  for (const [tileKey,raw] of Object.entries(transfers)) {
    let unit = units.find(row => row.id === raw.unitId);
    if (!unit || !alive(unit) || !surface(unit) || raw.lastProcessedTurn >= turnNumber) continue;
    const transfer = {...raw,lastProcessedTurn:turnNumber,status:"moving",reason:""};
    const village = faction.settlements.find(row => row.settlementId === transfer.settlementId);
    if (!village || (village.ownerPlayerId && village.ownerPlayerId !== playerId)
      || getV39RecruitInstructorFacility({...faction,recruitInstructorTransfers:transfers},village,transfer.className,state).tileKey !== tileKey
      || unit.className !== transfer.className) { transfers[tileKey]={...transfer,status:"blocked",reason:"施設またはクラスが変わりました"}; continue; }
    const [x,y] = tileKey.split(",").map(Number);
    const old = units.find(row => row.id === assignments[tileKey]?.unitId && keyOf(row) === tileKey);
    const currentState={...state,players:state.players.map(row => row.id === playerId ? {...row,factionState:{...faction,units}} : row)};
    const path = resolveV39AutomaticRoute(currentState,mapData,playerId,unit,{x,y},mapData.worldWrapEnabled !== false,old ? [old.id] : []);
    let ap = Number(unit.ap ?? unit.currentAp) || 0;
    if (!path) {transfer.status="blocked";transfer.reason="通行可能な経路がありません";}
    else for (const step of resolveV39AutomaticMovementSteps(path,ap,(step,index) => {
      if (step.key !== tileKey || !old || old.id === unit.id) return true;
      const previous = index > 0 ? path[index - 1] : unit;
      // 現教官の移動先も空きマスでなければ交代しない。
      if (previous.friendlyUnitId) {transfer.reason="現教官の交代先が空くのを待っています";return false;}
      const cost=resolveV39UnitMovementStepCost(mapData,old.x,old.y,previous.x,previous.y,old);
      if (!Number.isFinite(cost) || cost > Number(old.ap ?? old.currentAp) || Number(old.waitTurnNumber) === turnNumber) {
        transfer.reason="現教官の交代移動AP待ち";return false;
      }
      return true;
    })) {
      if (step.stepCost > ap || Number(unit.waitTurnNumber) === turnNumber) break;
      if (step.key === tileKey && old && old.id !== unit.id) {
        const cost = resolveV39UnitMovementStepCost(mapData,old.x,old.y,unit.x,unit.y,old);
        const oldAp=Number(old.ap ?? old.currentAp) || 0;
        if (!Number.isFinite(cost) || cost > oldAp || Number(old.waitTurnNumber) === turnNumber) {transfer.reason="現教官の交代移動AP待ち";break;}
        units=units.map(row => row.id === old.id ? {...row,x:unit.x,y:unit.y,position:[unit.x,unit.y],
          ap:oldAp-cost,currentAp:oldAp-cost,actionPoint:oldAp-cost,lastActionTurn:turnNumber,
          movementHold:assignments[tileKey].previousMovementHold === true} : row);
      }
      ap -= step.stepCost;
      unit=applyV39DisasterMovementDamage({...unit,ap,currentAp:ap,actionPoint:ap,lastActionTurn:turnNumber},[step],state,turnNumber).unit;
      if(!alive(unit)){transfer.status='blocked';transfer.reason='災害で教官が死亡しました';break;}
    }
    if (path?.waitingForFriendlyUnitId && (path.length === 0 || keyOf(unit) === path.at(-1).key)) {
      transfer.status="waiting-unit";transfer.reason="味方ユニットの移動待ち";
    }
    units=units.map(row => row.id === unit.id ? unit : row);
    if (alive(unit)&&keyOf(unit) === tileKey) {assignments[tileKey]={...transfer};delete transfers[tileKey];}
    else transfers[tileKey]=transfer;
  }
  return {state:{...state,players:state.players.map(row => row.id === playerId
    ? {...row,factionState:{...faction,units,recruitInstructorByTile:assignments,recruitInstructorTransfers:transfers}} : row)}};
}

export function resolveV39AssignedRecruitInstructor(faction, village, unit, state = {}, tileKey) {
  const facility = getV39RecruitInstructorFacility(faction, village, unit.className, state);
  if (tileKey !== undefined) facility.tileKey = facility.tileKeys.includes(tileKey) ? tileKey : "";
  const assigned = faction.recruitInstructorByTile?.[facility.tileKey];
  if (!assigned || assigned.className !== unit.className || assigned.settlementId !== village.settlementId) return null;
  return faction.units?.find(candidate => candidate.id === assigned.unitId && !candidate.isMob && alive(candidate)
    && surface(candidate) && keyOf(candidate) === facility.tileKey && candidate.className === unit.className) || null;
}
