import { getSelectedSettlement } from "../../lib/settlement-state.js";
import {isV39Undead,resolveV39CorpseKind} from '../../lib/v39-corpse-types.js';
import {expireV39Summons} from "../../lib/v39-summon-rules.js";
import {recordV39GuardianTrialDefeats} from '../../lib/v39-guardian-quests.js';
import { isV39UnitInWorld } from "../../lib/v39-cave-spatial-rules.js";
import { applyV39DerivedCharacterData } from "../unit/v39-character-derived-rules.js";
import {V39_CORPSE_LIFETIME_BALANCE} from '../../lib/v39-gameplay-balance.js';
import {resolveV39CorpseExpiry,expireV39GroundCorpses} from '../../lib/v39-corpse-lifetime.js';
import { releaseV39ExpeditionCargoOnDeath } from "../../lib/v39-expedition-tools.js";
import {
  resolveV39UnitRaceCategory,
  resolveV39UnitTotalExpForLevel
} from "../../lib/v39-unit-experience.js";
import {
  addV39CargoToFactionUnit,
  getV39SquadUnitIds,
  isV39CargoEmpty,
  mergeV39Cargo,
  normalizeV39Cargo
} from "../../lib/v39-logistics-state.js";
import {
  DEFAULT_CORPSE_FIELD_TURNS,
  currentV39TurnNumber,
  isV39TurnDeadlineReached
} from "../../lib/v39-turn-timing.js";

const DEAD_UNIT_FIELD_TIMEOUT_TURNS = DEFAULT_CORPSE_FIELD_TURNS;

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const coordKey = (unit) => `${Math.floor(number(unit?.x))},${Math.floor(number(unit?.y))}`;
const isDead = (unit) => text(unit?.state) === "死亡" || number(unit?.hp, unit?.currentHp) <= 0;

function attachCargoToUnit(units, unitId, cargo) {
  return units.map(unit => text(unit?.id) === text(unitId)
    ? { ...unit, corpseCargo:mergeV39Cargo(unit?.corpseCargo, cargo) }
    : unit);
}

function lastDeadMember(members) {
  return [...members].sort((left, right) =>
    number(right?.diedAtTurn, right?.deathTurn) - number(left?.diedAtTurn, left?.deathTurn)
      || text(left?.id).localeCompare(text(right?.id), "ja"))[0] || null;
}

function moveDefeatedPlayerCargoToCorpses(rawUnits, rawSquads) {
  let moved = 0;
  let units = rawUnits.map(unit => {
    const changed = releaseV39ExpeditionCargoOnDeath(unit);
    if(changed !== unit)moved += 1;
    return changed;
  });
  const unitById = () => new Map(units.map(unit => [text(unit?.id), unit]));
  const squads = rawSquads.map(squad => {
    {
      const cargoByUnitId = { ...(squad?.cargoByUnitId || {}) };
      for (const [unitId, cargo] of Object.entries(cargoByUnitId)) {
        const unit = unitById().get(text(unitId));
        if (!unit || !isDead(unit) || isV39CargoEmpty(cargo)) continue;
        units = attachCargoToUnit(units, unitId, cargo);
        delete cargoByUnitId[unitId];
        moved += 1;
      }
      squad = { ...squad, cargoByUnitId };
    }
    if (text(squad?.id) === "solo") return squad;
    const members = getV39SquadUnitIds(squad).map(id => unitById().get(id)).filter(Boolean);
    if (!members.length || members.some(unit => !isDead(unit)) || isV39CargoEmpty(squad?.cargo)) return squad;
    const carrier = lastDeadMember(members);
    units = attachCargoToUnit(units, carrier.id, squad.cargo);
    moved += 1;
    return { ...squad, cargo:normalizeV39Cargo() };
  });
  return { units, squads, moved };
}

function moveDefeatedEnemyCargoToCorpses(rawEnemies, rawSquads) {
  let enemies = rawEnemies;
  const enemyById = () => new Map(enemies.map(enemy => [text(enemy?.id), enemy]));
  let moved = 0;
  const squads = rawSquads.map(squad => {
    const members = getV39SquadUnitIds(squad).map(id => enemyById().get(id)).filter(Boolean);
    if (!members.length || members.some(enemy => !isDead(enemy)) || isV39CargoEmpty(squad?.cargo)) return squad;
    const carrier = lastDeadMember(members);
    enemies = attachCargoToUnit(enemies, carrier.id, squad.cargo);
    moved += 1;
    return { ...squad, cargo:normalizeV39Cargo() };
  });
  return { enemies, squads, moved };
}

function addGroundLoot(groundLootByTile, key, cargo) {
  const remaining = normalizeV39Cargo(cargo);
  if (isV39CargoEmpty(remaining)) return { value:groundLootByTile, added:false };
  const current = groundLootByTile[key] || {};
  return {
    value:{
      ...groundLootByTile,
      [key]:{
        ...current,
        discoveredByPlayerIds:Array.isArray(current.discoveredByPlayerIds) ? current.discoveredByPlayerIds : [],
        cargo:mergeV39Cargo(current.cargo, remaining)
      }
    },
    added:true
  };
}

function historyEntry(unit, type, turnNumber) {
  const recordedAtMs = Date.now();
  return {
    id:`death-${text(unit?.id)}-${recordedAtMs}-${type}`,
    unitId:text(unit?.id),
    unitName:text(unit?.name, text(unit?.id)),
    type,
    atMs:recordedAtMs,
    turn:Math.max(0, Math.floor(number(turnNumber, unit?.deathTurn))),
    x:Math.floor(number(unit?.x)),
    y:Math.floor(number(unit?.y)),
    cause:text(unit?.deathCause),
    equipment:(Array.isArray(unit?.equipment) ? unit.equipment : []).map(item => ({
      id:text(item?.id),
      name:text(item?.name, text(item?.装備名)),
      slot:text(item?.slot),
      quality:text(item?.quality, text(item?.rarity))
    })),
    affiliation:{
      squadId:text(unit?.squadId),
      role:text(unit?.role),
      race:text(unit?.race),
      className:text(unit?.className)
    }
  };
}

function normalizeDeadUnit(unit, turnNumber) {
  if (!isDead(unit)) return unit;
  const diedAtTurn = Math.max(1, Math.floor(number(unit?.diedAtTurn, unit?.deathTurn || turnNumber)));
  return {
    ...unit,
    ...(isV39Undead(unit)?{corpseKind:resolveV39CorpseKind(unit),equipment:[],
      corpseCargo:mergeV39Cargo(unit.corpseCargo,{equipmentInventory:unit.equipment})}:{}),
    hp:0,
    currentHp:0,
    state:"死亡",
    diedAtTurn,
    deathTurn:diedAtTurn,
    corpseLifetimeVersion:1,
    deadExpireTurn:resolveV39CorpseExpiry(unit,turnNumber),
    deathPosition:unit?.deathPosition || { x:Math.floor(number(unit?.x)), y:Math.floor(number(unit?.y)) }
  };
}

export function runV39DeathLifecycle(turnNumber = currentV39TurnNumber()) {
  const before = window.getV39GameState?.();
  if (!before) return { collected:0, expired:0 };
  const summons=expireV39Summons(recordV39GuardianTrialDefeats(before),turnNumber),state=summons.state;
  let collected = 0;
  let expired = 0;
  let cargoRecovered = 0;
  let groundLootCreated = 0;
  let changed = summons.state!==before;
  const groundExpiry=expireV39GroundCorpses(state.groundLootByTile,turnNumber);
  let groundLootByTile = groundExpiry.groundLootByTile;
  changed ||= groundExpiry.changed;
  const normalizeUnit=unit=>{
    if(!isV39UnitInWorld(unit,state.activeWorldId))return unit;
    const next=normalizeDeadUnit(unit,turnNumber);
    if(isDead(unit)&&(unit.deadExpireTurn!==next.deadExpireTurn||unit.corpseLifetimeVersion!==1))changed=true;
    if(isDead(unit)&&isV39Undead(unit)&&(unit.corpseKind!==next.corpseKind||unit.equipment?.length))changed=true;
    return next;
  };
  const dropDissolvedUnit=unit=>{
    const key=coordKey(unit),loot=groundLootByTile[key]||{};
    if(!unit.guardianTrial&&!isV39CargoEmpty(unit.corpseCargo)){
      groundLootByTile[key]={...loot,cargo:mergeV39Cargo(loot.cargo,unit.corpseCargo)};
      groundLootCreated++;
    }
    changed=true;expired++;
  };
  // 村の輸送役は軍隊cargoを持たないため、死亡時に携帯物を直接戦利品へ移す。
  const neutralVillages = (state.neutralVillages || []).map(village => ({ ...village,
    defenseUnits:(village.defenseUnits || []).flatMap(raw => {
      let unit=normalizeUnit(raw);
      if (!isDead(unit) || !isV39UnitInWorld(unit,state.activeWorldId)) return [unit];
      if(!isV39CargoEmpty(unit.tradeCargo)){
        const key=coordKey(unit),loot=groundLootByTile[key] || {};
        groundLootByTile[key]={ ...loot,cargo:mergeV39Cargo(loot.cargo,unit.tradeCargo) };
        changed=true;groundLootCreated+=1;
        unit={ ...unit,tradeCargo:normalizeV39Cargo() };
      }
      if(resolveV39CorpseKind(unit)==='none'){dropDissolvedUnit(unit);return [];}
      if(isV39TurnDeadlineReached(unit.deadExpireTurn,turnNumber)){
        const drop=addGroundLoot(groundLootByTile,coordKey(unit),mergeV39Cargo(unit.corpseCargo,{equipmentInventory:unit.equipment}));
        groundLootByTile=drop.value;if(drop.added)groundLootCreated++;
        changed=true;expired++;return [];
      }
      return [unit];
    }) }));
  let players = state.players.map((player) => {
    let faction = player.factionState;
    let sourceUnits = Array.isArray(faction?.units) ? faction.units.map(normalizeUnit) : [];
    const defeated = moveDefeatedPlayerCargoToCorpses(sourceUnits, Array.isArray(faction?.squads) ? faction.squads : []);
    sourceUnits = defeated.units;
    let squads = defeated.squads;
    if (defeated.moved) changed = true;
    const aliveUnits = sourceUnits.filter((unit) => !isDead(unit)&&isV39UnitInWorld(unit,state.activeWorldId));
    const units = [];
    const reserve = [...(Array.isArray(faction?.deadUnitReserve) ? faction.deadUnitReserve : [])];
    const history = [...(Array.isArray(faction?.deathHistory) ? faction.deathHistory : [])];
    const removedIds = new Set();
    for (let unit of sourceUnits) {
      if (!isDead(unit)||!isV39UnitInWorld(unit,state.activeWorldId)) {
        units.push(unit);
        continue;
      }
      if(resolveV39CorpseKind(unit)==='none'){
        dropDissolvedUnit(unit);history.push(historyEntry(unit,'消滅',turnNumber));removedIds.add(text(unit.id));continue;
      }
      const collector = aliveUnits.find(row => coordKey(row) === coordKey(unit));
      if (collector) {
        if (!isV39CargoEmpty(unit?.corpseCargo)) {
          const result = addV39CargoToFactionUnit({ ...faction, units:sourceUnits, squads }, collector.id, unit.corpseCargo);
          if (result.ok) {
            squads = result.faction.squads;
            cargoRecovered += 1;
            unit = { ...unit, corpseCargo:normalizeV39Cargo() };
            changed = true;
          }
        }
        // Loot remains automatic; bodies are recovered explicitly through a mausoleum.
      }
      if (isV39TurnDeadlineReached(unit.deadExpireTurn, turnNumber)) {
        const groundResult = addGroundLoot(groundLootByTile, coordKey(unit), mergeV39Cargo(unit.corpseCargo,{equipmentInventory:unit.equipment}));
        groundLootByTile = groundResult.value;
        if (groundResult.added) groundLootCreated += 1;
        history.push(historyEntry(unit, "消滅", turnNumber));
        removedIds.add(text(unit.id));
        expired += 1;
        changed = true;
        continue;
      }
      units.push(unit);
    }
    squads = squads.map((squad) => ({
      ...squad,
      unitIds:Array.isArray(squad?.unitIds) ? squad.unitIds.filter((id) => !removedIds.has(text(id))) : squad?.unitIds,
      memberIds:Array.isArray(squad?.memberIds) ? squad.memberIds.filter((id) => !removedIds.has(text(id))) : squad?.memberIds
    }));
    const selectedUnitId = units.some((unit) => text(unit.id) === text(faction?.selectedUnitId))
      ? text(faction.selectedUnitId)
      : text(units.find((unit) => !isDead(unit))?.id, text(units[0]?.id));
    return { ...player, factionState:{ ...faction, units, squads, deadUnitReserve:reserve, deathHistory:history, selectedUnitId } };
  });
  const normalizedEnemies = state.enemies.map(normalizeUnit);
  const defeatedEnemies = moveDefeatedEnemyCargoToCorpses(normalizedEnemies, Array.isArray(state.enemySquads) ? state.enemySquads : []);
  if (defeatedEnemies.moved) changed = true;
  const enemies = [];
  for (let enemy of defeatedEnemies.enemies) {
    if(isDead(enemy)&&isV39UnitInWorld(enemy,state.activeWorldId)&&resolveV39CorpseKind(enemy)==='none'){
      dropDissolvedUnit(enemy);continue;
    }
    const collector = isDead(enemy)
      ? players.flatMap(player => player.factionState.units
        .filter(unit => !isDead(unit) && isV39UnitInWorld(unit,state.activeWorldId) && coordKey(unit) === coordKey(enemy))
        .map(unit => ({ playerId:player.id, unit }))).at(0)
      : null;
    if (collector) {
      if (!isV39CargoEmpty(enemy?.corpseCargo)) {
        players = players.map(player => {
          if (text(player?.id) !== text(collector.playerId)) return player;
          const result = addV39CargoToFactionUnit(player.factionState, collector.unit.id, enemy.corpseCargo);
          if (!result.ok) return player;
          cargoRecovered += 1;
          enemy = { ...enemy, corpseCargo:normalizeV39Cargo() };
          changed = true;
          return { ...player, factionState:result.faction };
        });
      }
    }
    if (isDead(enemy) && isV39UnitInWorld(enemy,state.activeWorldId) && isV39TurnDeadlineReached(enemy.deadExpireTurn, turnNumber)) {
      const groundResult = addGroundLoot(groundLootByTile, coordKey(enemy), mergeV39Cargo(enemy.corpseCargo,{equipmentInventory:enemy.equipment}));
      groundLootByTile = groundResult.value;
      if (groundResult.added) groundLootCreated += 1;
      expired += 1;
      changed = true;
    } else {
      enemies.push(enemy);
    }
  }
  const livingEnemyIds = new Set(enemies.filter((enemy) => !isDead(enemy)).map((enemy) => text(enemy?.id)).filter(Boolean));
  const enemySquads = defeatedEnemies.squads.map((squad) => ({
    ...squad,
    unitIds:(Array.isArray(squad?.unitIds) ? squad.unitIds : []).map(text).filter((id) => livingEnemyIds.has(id))
  }));
  const enemyNests = (Array.isArray(state.enemyNests) ? state.enemyNests : []).map((nest) => {
    const unitIds = (Array.isArray(nest?.unitIds) ? nest.unitIds : []).map(text).filter((id) => livingEnemyIds.has(id));
    if (unitIds.length !== (Array.isArray(nest?.unitIds) ? nest.unitIds.length : 0)) changed = true;
    return { ...nest, unitIds };
  });
  if (changed) {
    groundLootByTile=expireV39GroundCorpses(groundLootByTile,turnNumber).groundLootByTile;
    const villageById=new Map(neutralVillages.map(village=>[village.id,village]));
    window.setV39GameState({ players, enemies, enemySquads, enemyNests, groundLootByTile,neutralVillages,victoryLandmarksByTile:state.victoryLandmarksByTile,
      settlements:(state.settlements || []).map(row=>villageById.get(row.id)||row) }, { reason:"death-lifecycle" });
    window.dispatchEvent(new CustomEvent("v39:death-lifecycle", { detail:{ collected, expired, cargoRecovered, groundLootCreated } }));
    for(const report of summons.reports)window.appendV39ActivityLog?.(report.playerId,'召喚',report.message);
  }
  return { collected, expired, cargoRecovered, groundLootCreated };
}

export function reviveV39Unit(playerId, unitId, options = {}) {
  const state = window.getV39GameState?.();
  const player = state?.players?.find((row) => text(row.id) === text(playerId));
  if (!state || !player) return { ok:false, reason:"プレイヤーが見つかりません" };
  const reserve = [...player.factionState.deadUnitReserve];
  const reserveIndex = reserve.findIndex((entry) => text(entry?.unitId) === text(unitId));
  const fieldIndex = player.factionState.units.findIndex((unit) => text(unit?.id) === text(unitId) && isDead(unit));
  if (reserveIndex < 0 && fieldIndex < 0) return { ok:false, reason:"蘇生対象の死亡者がいません" };
  if(reserveIndex>=0&&reserve[reserveIndex].corpseStorage)return {ok:false,reason:'霊廟から遺体を取り出してから蘇生してください'};
  const source = reserveIndex >= 0 ? reserve[reserveIndex].unit : player.factionState.units[fieldIndex];
  if(resolveV39CorpseKind(source)!=='organic')return {ok:false,reason:'アンデッドの残骸は通常の蘇生対象にできません'};
  if(source?.soulCollected)return {ok:false,reason:'魂が回収された死体は蘇生できません'};
  const levelBefore = Math.max(1, Math.floor(number(source?.level, source?.Lv || 1)));
  const levelLoss = Math.max(0, Math.floor(number(options.levelLoss)));
  const levelAfter = levelBefore - levelLoss;
  if (levelAfter <= 0) return { ok:false, reason:`Lv${levelBefore}から${levelLoss}低下すると0以下になるため蘇生できません` };
  const recalculated = applyV39DerivedCharacterData({ ...source, level:levelAfter });
  const expCategory = resolveV39UnitRaceCategory(recalculated);
  const totalExp = resolveV39UnitTotalExpForLevel(levelAfter, expCategory);
  const maxHp = Math.max(1, number(recalculated?.maxHp, recalculated?.status?.HP || 1));
  const hp = Math.max(1, Math.min(maxHp, Math.floor(number(options.hp, Math.ceil(maxHp * 0.25)))));
  const village = getSelectedSettlement(player.factionState);
  const revived = {
    ...recalculated,
    exp:0,
    totalExp,
    status:{ ...(recalculated?.status || {}), exp:0, totalExp },
    x:Math.floor(number(options.x, village?.x ?? source?.x)),
    y:Math.floor(number(options.y, village?.y ?? source?.y)),
    hp,
    currentHp:hp,
    state:"生存"
  };
  for (const key of ["diedAtMs", "deadExpireAtMs", "diedAtTurn", "deadExpireTurn", "deathPosition", "deathCause", "deathTurn", "corpseCargo", "corpseLifetimeVersion"]) delete revived[key];
  if (reserveIndex >= 0) reserve.splice(reserveIndex, 1);
  const units = reserveIndex >= 0
    ? [...player.factionState.units, revived]
    : player.factionState.units.map((unit, index) => index === fieldIndex ? revived : unit);
  const history = Array.isArray(player.factionState.deathHistory) ? player.factionState.deathHistory : [];
  const players = state.players.map((row) => row.id !== player.id ? row : ({
    ...row,
    factionState:{
      ...row.factionState,
      units,
      deadUnitReserve:reserve,
      deathHistory:[...history, historyEntry(revived, "蘇生", currentV39TurnNumber(state))],
      selectedUnitId:options.select === false ? text(row.factionState.selectedUnitId) : text(revived.id)
    }
  }));
  window.setV39GameState({ players }, { reason:"unit-revived" });
  return { ok:true, unit:revived, levelBefore, levelAfter, levelLoss, hp };
}

function install() {
  window.addEventListener("v39:turn-advanced", event => {if(!event?.detail?.worldLifecycleResolved)runV39DeathLifecycle(event?.detail?.turnNumber);});
  window.addEventListener("v39:unit-moved", () => runV39DeathLifecycle());
  window.addEventListener("v39:enemy-moved", () => runV39DeathLifecycle());
  window.addEventListener("v39:attack-resolved", () => runV39DeathLifecycle());
  window.runV39DeathLifecycle = runV39DeathLifecycle;
  window.reviveV39Unit = reviveV39Unit;
  window.getV39DeathRules = () => ({ fieldTimeoutTurns:DEAD_UNIT_FIELD_TIMEOUT_TURNS,...V39_CORPSE_LIFETIME_BALANCE });
}

install();
