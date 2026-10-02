import { getFactionSettlementById, getFactionSettlements, replaceFactionSettlement } from "./settlement-state.js";
import { FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS, normalizeV39Village } from "./v39-economy-rules.js";
import { getV39SquadUnitIds, normalizeV39Cargo, isV39CargoEmpty, resolveV39CargoLoad, resolveV39UnitCargoCapacity } from "./v39-logistics-state.js";
import { getHexNeighborCoords } from "./hex-grid.js";
import { resolveV39UnitMovementStepCost } from "./v39-terrain-traversal.js";

const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const key = point => `${point.x},${point.y}`;
export const V39_TRANSPORT_RESOURCE_KEYS = [...MATERIAL_RESOURCE_KEYS, ...FOOD_RESOURCE_KEYS];
const stockField = resource => FOOD_RESOURCE_KEYS.includes(resource) ? "foodStockByType" : "materialStockByType";
const living = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state || unit?.statusName) !== "死亡";
const cargoSquad = (faction, unitId) => (faction?.squads || []).find(row => getV39SquadUnitIds(row).includes(text(unitId)));
export const getV39TransportCargo = (faction, unitId) => normalizeV39Cargo(cargoSquad(faction, unitId)?.cargoByUnitId?.[unitId]);

export function isV39AutomaticTransport(unit) {
  return unit?.transportAssignment?.enabled === true && !!unit.transportAssignment.destinationSettlementId;
}

export function isV39ArmyTransportUnit(unit) {
  return text(unit?.unitType).includes("軍隊") && unit?.isNamed !== true;
}

export function isV39UnitInsideSettlement(unit, settlement) {
  if (!settlement?.placed || !Number.isInteger(unit?.x) || !Number.isInteger(unit?.y)) return false;
  const key = `${unit.x},${unit.y}`;
  const center = `${settlement.x},${settlement.y}`;
  return key === center || text(settlement.territoryResidentialCenterMap?.[key]) === center;
}

export function setV39UnitTransportAssignment(state, playerId, settlementId, unitId, enabled) {
  const player = state?.players?.find(row => text(row.id) === text(playerId));
  const settlement = getFactionSettlementById(player?.factionState, settlementId);
  const unit = player?.factionState?.units?.find(row => text(row.id) === text(unitId));
  if (!player || !settlement || !unit) return { ok:false, reason:"拠点またはユニットが見つかりません", state };
  if (enabled) {
    if (!isV39ArmyTransportUnit(unit)) return { ok:false, reason:"輸送指定は軍隊ユニットのみ可能です", state };
    if (Number(unit.hp ?? unit.currentHp) <= 0 || text(unit.state || unit.statusName) === "死亡") return { ok:false, reason:"死亡したユニットは指定できません", state };
    if (!isV39UnitInsideSettlement(unit, settlement)) return { ok:false, reason:"拠点の占有マス内にいるユニットを指定してください", state };
    if (unit.transportAssignment) return { ok:false, reason:"既に輸送用に指定されています", state };
  } else if (text(unit.transportAssignment?.originSettlementId) !== text(settlementId)) {
    return { ok:false, reason:"この拠点の輸送指定ではありません", state };
  } else if (!isV39CargoEmpty(getV39TransportCargo(player.factionState, unitId))) {
    return { ok:false, reason:"積載中です。往復を停止し、拠点へ戻して荷下ろししてから解除してください", state };
  }
  const units = player.factionState.units.map(row => {
    if (text(row.id) !== text(unitId)) return row;
    const next = { ...row };
    if (enabled) next.transportAssignment = {
      originSettlementId:text(settlementId),
      status:"awaiting-route",
      assignedTurn:Number(state.timeline?.turnNumber) || 1
    };
    else delete next.transportAssignment;
    return next;
  });
  return { ok:true, state:{ ...state, players:state.players.map(row => row.id === player.id
    ? { ...row, factionState:{ ...row.factionState, units } } : row) } };
}

export function configureV39TransportRoute(state, playerId, unitId, destinationId, resource, enabled = true) {
  const player = state?.players?.find(row => text(row.id) === text(playerId));
  const unit = player?.factionState?.units?.find(row => text(row.id) === text(unitId));
  const assignment = unit?.transportAssignment;
  if (!assignment || !living(unit)) return { ok:false, reason:"生存する輸送担当者を選択してください", state };
  const destination = getFactionSettlementById(player.factionState, destinationId);
  if (enabled && (!destination?.placed || destinationId === assignment.originSettlementId
    || !V39_TRANSPORT_RESOURCE_KEYS.includes(resource) || !cargoSquad(player.factionState, unitId))) {
    return { ok:false, reason:"別の自拠点と運ぶ資源を選択してください", state };
  }
  if (enabled && !isV39CargoEmpty(getV39TransportCargo(player.factionState, unitId))
    && (destinationId !== assignment.destinationSettlementId || resource !== assignment.resource)) {
    return { ok:false, reason:"積載中は搬入先・資源を変更できません", state };
  }
  const nextAssignment = { ...assignment, enabled };
  if (enabled) Object.assign(nextAssignment, { destinationSettlementId:destinationId, resource,
    leg:isV39CargoEmpty(getV39TransportCargo(player.factionState, unitId)) ? "return" : "outbound", status:"ready", reason:"" });
  else Object.assign(nextAssignment, { status:"paused", reason:"" });
  return { ok:true, state:{ ...state, players:state.players.map(row => row !== player ? row : {
    ...row, factionState:{ ...row.factionState, units:row.factionState.units.map(item => item !== unit ? item :
      { ...item, transportAssignment:nextAssignment }) }
  }) } };
}

// AP最小の経路を探索する。占有マス・通行条件・高度差は通常移動と同じ制約を使う。
function routePath(state, mapData, playerId, unit, destination, worldWrapEnabled) {
  const occupied = new Set([
    ...(state.players || []).flatMap(player => (player.factionState?.units || [])
      .filter(row => living(row) && !(player.id === playerId && row.id === unit.id))),
    ...(state.enemies || []).filter(living)
  ].map(key));
  const goals = new Set([key(destination), ...Object.entries(destination.territoryResidentialCenterMap || {})
    .filter(([, center]) => text(center) === key(destination)).map(([tile]) => tile)]);
  const heap = [];
  function push(node) {
    let index = heap.push(node) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].cost <= node.cost) break;
      heap[index] = heap[parent]; index = parent;
    }
    heap[index] = node;
  }
  function pop() {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
        if (heap[child].cost >= last.cost) break;
        heap[index] = heap[child]; index = child;
      }
      heap[index] = last;
    }
    return first;
  }
  const start = key(unit), costs = new Map([[start, 0]]), previous = new Map();
  push({ x:unit.x, y:unit.y, cost:0 });
  const maxAp = number(unit.maxAp ?? unit.maxActionPoint ?? 100);
  while (heap.length) {
    const current = pop(), currentKey = key(current);
    if (current.cost !== costs.get(currentKey)) continue;
    if (goals.has(currentKey)) {
      const path = [];
      for (let cursor = currentKey; cursor !== start;) {
        const step = previous.get(cursor); path.unshift(step); cursor = step.from;
      }
      return path;
    }
    for (const next of getHexNeighborCoords(mapData.w, mapData.h, current.x, current.y, worldWrapEnabled)) {
      if (occupied.has(next.key)) continue;
      const stepCost = resolveV39UnitMovementStepCost(mapData, current.x, current.y, next.x, next.y, unit);
      if (!Number.isFinite(stepCost) || stepCost > maxAp) continue;
      const cost = current.cost + stepCost;
      if (cost >= (costs.get(next.key) ?? Infinity)) continue;
      costs.set(next.key, cost); previous.set(next.key, { ...next, from:currentKey, stepCost });
      push({ ...next, cost });
    }
  }
  return null;
}

export function advanceV39AutomaticTransport(state, playerId, mapData, turnNumber, worldWrapEnabled = false) {
  let nextState = state;
  const reports = [];
  if (!mapData?.grid?.length) return { state, reports };
  const player = state.players.find(row => row.id === playerId);
  if (!player) return { state, reports };
  let faction = player.factionState;
  for (const rawUnit of faction.units || []) {
    if (!isV39AutomaticTransport(rawUnit) || !living(rawUnit)
      || number(rawUnit.transportAssignment.lastProcessedTurn) >= turnNumber
      || number(rawUnit.waitTurnNumber) === turnNumber) continue;
    const assignment = { ...rawUnit.transportAssignment, lastProcessedTurn:turnNumber, reason:"" };
    let unit = { ...rawUnit, transportAssignment:assignment };
    const origin = getFactionSettlementById(faction, assignment.originSettlementId);
    const destination = getFactionSettlementById(faction, assignment.destinationSettlementId);
    const squad = cargoSquad(faction, unit.id);
    let cargo = getV39TransportCargo(faction, unit.id);
    if (!origin?.placed || !destination?.placed || !squad) {
      assignment.status = "blocked"; assignment.reason = "輸送先または所属部隊がありません";
    } else {
      const resource = assignment.resource, field = stockField(resource);
      if (isV39UnitInsideSettlement(unit, origin) && assignment.leg === "return") {
        const amount = Math.max(0, Math.min(number(origin[field]?.[resource]),
          resolveV39UnitCargoCapacity(unit) - resolveV39CargoLoad(cargo)));
        if (amount > 0) {
          const updatedOrigin = normalizeV39Village({ ...origin, [field]:{ ...origin[field],
            [resource]:number(origin[field]?.[resource]) - amount } }, player.race);
          faction = replaceFactionSettlement(faction, updatedOrigin, { ownerPlayerId:player.id, select:false });
          cargo.resourcesByType[resource] = number(cargo.resourcesByType[resource]) + amount;
          reports.push({ unitId:unit.id, action:"積込", resource, amount, settlementId:origin.settlementId });
        }
        assignment.leg = isV39CargoEmpty(cargo) ? "return" : "outbound";
      }
      if (assignment.leg === "return" && isV39UnitInsideSettlement(unit, origin)) {
        assignment.status = "waiting-stock";
      } else {
        const target = assignment.leg === "outbound" ? destination : origin;
        const path = routePath({ ...nextState, players:nextState.players.map(row => row.id === playerId ? { ...row, factionState:faction } : row) },
          mapData, playerId, unit, target, mapData.worldWrapEnabled ?? worldWrapEnabled);
        if (!path) { assignment.status = "blocked"; assignment.reason = "通行可能な経路がありません"; }
        else {
          let ap = number(unit.ap ?? unit.currentAp);
          for (const step of path) {
            if (step.stepCost > ap) break;
            unit = { ...unit, x:step.x, y:step.y, lastActionTurn:turnNumber };
            ap -= step.stepCost;
          }
          unit.ap = ap; unit.currentAp = ap;
          assignment.status = assignment.leg === "outbound" ? "delivering" : "returning";
          if (assignment.leg === "outbound" && isV39UnitInsideSettlement(unit, destination)) {
            const updated = { ...destination, foodStockByType:{ ...destination.foodStockByType }, materialStockByType:{ ...destination.materialStockByType },
              equipmentInventory:[...(destination.equipmentInventory || []), ...cargo.equipmentInventory] };
            for (const [name, amount] of Object.entries(cargo.resourcesByType)) {
              const bag = stockField(name); updated[bag][name] = number(updated[bag][name]) + amount;
              reports.push({ unitId:unit.id, action:"搬入", resource:name, amount, settlementId:destination.settlementId });
            }
            faction = replaceFactionSettlement(faction, normalizeV39Village(updated, player.race), { ownerPlayerId:player.id, select:false });
            cargo = normalizeV39Cargo(); assignment.leg = "return"; assignment.status = "returning";
          }
        }
      }
      faction = { ...faction, squads:faction.squads.map(row => row.id !== squad.id ? row : {
        ...row, cargoByUnitId:{ ...row.cargoByUnitId, [unit.id]:cargo }
      }) };
    }
    faction = { ...faction, units:faction.units.map(row => row.id === unit.id ? unit : row) };
    nextState = { ...nextState, players:nextState.players.map(row => row.id === playerId ? { ...row, factionState:faction } : row) };
  }
  return { state:nextState, reports };
}
