import { computed, ref } from "vue";

export function useUnitMovePanel(options = {}) {
  const showMoveUnitModal = options.showMoveUnitModal;
  const moveUnitCandidateId = options.moveUnitCandidateId;
  const showMovePathConfirmModal = options.showMovePathConfirmModal;
  const plannedMovePathNodes = options.plannedMovePathNodes;
  const plannedMoveTarget = options.plannedMoveTarget;
  const plannedMoveSummaryText = options.plannedMoveSummaryText;
  const plannedMovePreview = options.plannedMovePreview && typeof options.plannedMovePreview === "object"
    ? options.plannedMovePreview
    : { value: { pathDistance: 0, estimatedCost: 0, remainingAfter: 0 } };
  const isPathMoveInProgress = options.isPathMoveInProgress;
  const movingUnitIdSet = options.movingUnitIdSet && typeof options.movingUnitIdSet === "object"
    ? options.movingUnitIdSet
    : ref(new Set());
  const moveCommandUnitId = options.moveCommandUnitId;
  const villagePlacementMode = options.villagePlacementMode;
  const unitList = options.unitList;
  const selectedUnitId = options.selectedUnitId;
  const selectedUnit = options.selectedUnit;
  const currentData = options.currentData;
  const mapClickInfo = options.mapClickInfo;

  const nonEmptyText = typeof options.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const toSafeNumber = typeof options.toSafeNumber === "function"
    ? options.toSafeNumber
    : ((value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    });
  const coordKey = typeof options.coordKey === "function"
    ? options.coordKey
    : ((x, y) => `${x},${y}`);
  const unitHasSquad = typeof options.unitHasSquad === "function"
    ? options.unitHasSquad
    : (() => false);
  const squadMemberIds = typeof options.squadMemberIds === "function"
    ? options.squadMemberIds
    : (() => []);
  const movementStepCost = typeof options.movementStepCost === "function"
    ? options.movementStepCost
    : (() => 1);
  const isPassableTerrain = typeof options.isPassableTerrain === "function"
    ? options.isPassableTerrain
    : (() => true);
  const findPathWithinDistanceSync = typeof options.findPathWithinDistanceSync === "function"
    ? options.findPathWithinDistanceSync
    : (() => null);
  const findPathWithinDistanceAsync = typeof options.findPathWithinDistanceAsync === "function"
    ? options.findPathWithinDistanceAsync
    : null;
  const clearLastMoveStopState = typeof options.clearLastMoveStopState === "function"
    ? options.clearLastMoveStopState
    : (() => {});
  const setLastMoveStopState = typeof options.setLastMoveStopState === "function"
    ? options.setLastMoveStopState
    : (() => {});
  const getLastMoveStopState = typeof options.getLastMoveStopState === "function"
    ? options.getLastMoveStopState
    : (() => ({}));
  const markPathExplored = typeof options.markPathExplored === "function"
    ? options.markPathExplored
    : (() => {});
  const buildOpposingFactionUnitsByTile = typeof options.buildOpposingFactionUnitsByTile === "function"
    ? options.buildOpposingFactionUnitsByTile
    : (() => new Map());
  const runHostilePassStealthCheckAtTile = typeof options.runHostilePassStealthCheckAtTile === "function"
    ? options.runHostilePassStealthCheckAtTile
    : (() => ({ blocked: false, reason: "" }));
  const runEnemyEncounterCheck = typeof options.runEnemyEncounterCheck === "function"
    ? options.runEnemyEncounterCheck
    : (() => ({ entries: [] }));
  const updateUnitInfoText = typeof options.updateUnitInfoText === "function"
    ? options.updateUnitInfoText
    : (() => {});
  const emitCharacterStateChange = typeof options.emitCharacterStateChange === "function"
    ? options.emitCharacterStateChange
    : (() => {});
  const requestMapRender = typeof options.requestMapRender === "function"
    ? options.requestMapRender
    : (() => {});
  const renderMapNow = typeof options.renderMapNow === "function"
    ? options.renderMapNow
    : requestMapRender;
  const clearHousingUpgradeSelectionState = typeof options.clearHousingUpgradeSelectionState === "function"
    ? options.clearHousingUpgradeSelectionState
    : (() => {});
  const onMapTileSelected = typeof options.onMapTileSelected === "function"
    ? options.onMapTileSelected
    : (() => {});
  const onStartEncounterBattle = typeof options.onStartEncounterBattle === "function"
    ? options.onStartEncounterBattle
    : (() => {});
  const setSelectedTileKey = typeof options.setSelectedTileKey === "function"
    ? options.setSelectedTileKey
    : (() => {});
  const getSelectedTileKey = typeof options.getSelectedTileKey === "function"
    ? options.getSelectedTileKey
    : (() => "");
  const resolveMoveUnitIconSrc = typeof options.resolveMoveUnitIconSrc === "function"
    ? options.resolveMoveUnitIconSrc
    : (() => "");
  const resolveMoveUnitIconGlyph = typeof options.resolveMoveUnitIconGlyph === "function"
    ? options.resolveMoveUnitIconGlyph
    : (() => "");
  const toUnitRoleLabel = typeof options.toUnitRoleLabel === "function"
    ? options.toUnitRoleLabel
    : (() => "");
  const turnSeconds = Math.max(1, toSafeNumber(options.turnSeconds, 60));
  const moveTimeBaseTurns = Math.max(0.1, toSafeNumber(options.moveTimeBaseTurns, 2));
  const getClockElapsedMs = typeof options.getClockElapsedMs === "function"
    ? options.getClockElapsedMs
    : (() => Date.now());

  function normalizeUnitIdSet(raw) {
    if (raw instanceof Set) return new Set(raw);
    if (Array.isArray(raw)) {
      return new Set(raw.map(value => nonEmptyText(value)).filter(Boolean));
    }
    if (raw && typeof raw === "object") {
      const next = new Set();
      for (const [key, enabled] of Object.entries(raw)) {
        if (enabled) {
          const unitId = nonEmptyText(key);
          if (unitId) next.add(unitId);
        }
      }
      return next;
    }
    return new Set();
  }

  function readMovingUnitIdSet() {
    return normalizeUnitIdSet(movingUnitIdSet?.value);
  }

  function writeMovingUnitIdSet(nextSet) {
    movingUnitIdSet.value = normalizeUnitIdSet(nextSet);
    if (isPathMoveInProgress && typeof isPathMoveInProgress === "object" && "value" in isPathMoveInProgress) {
      isPathMoveInProgress.value = movingUnitIdSet.value.size > 0;
    }
  }

  function isUnitMoving(unitOrId) {
    const unitId = typeof unitOrId === "string"
      ? nonEmptyText(unitOrId)
      : nonEmptyText(unitOrId?.id);
    if (!unitId) return false;
    return readMovingUnitIdSet().has(unitId);
  }

  function resolveMoveGroupUnitIds(moveGroup) {
    const explicitIds = Array.isArray(moveGroup?.participantIds) ? moveGroup.participantIds : [];
    const ids = explicitIds
      .map(id => nonEmptyText(id))
      .filter(Boolean);
    if (ids.length) return ids;
    const leaderId = nonEmptyText(moveGroup?.leader?.id);
    return leaderId ? [leaderId] : [];
  }

  function isMoveGroupInProgress(moveGroup) {
    const unitIds = resolveMoveGroupUnitIds(moveGroup);
    if (!unitIds.length) return false;
    const activeSet = readMovingUnitIdSet();
    return unitIds.some(unitId => activeSet.has(unitId));
  }

  function setMoveGroupInProgress(moveGroup, inProgress) {
    const unitIds = resolveMoveGroupUnitIds(moveGroup);
    if (!unitIds.length) return;
    const next = readMovingUnitIdSet();
    for (const unitId of unitIds) {
      if (inProgress) next.add(unitId);
      else next.delete(unitId);
    }
    writeMovingUnitIdSet(next);
  }

  function resolveUnitMoveRemaining(unit) {
    return Math.max(0, Math.floor(toSafeNumber(unit?.moveRemaining, unit?.moveRange)));
  }

  function resolveUnitMoveStat(unit) {
    const statusMove = toSafeNumber(unit?.status?.移動, Number.NaN);
    const directMove = toSafeNumber(unit?.移動, Number.NaN);
    const fallbackMove = toSafeNumber(unit?.moveRange, Number.NaN);
    const raw = Number.isFinite(statusMove)
      ? statusMove
      : (Number.isFinite(directMove) ? directMove : fallbackMove);
    return Math.max(1, Math.floor(toSafeNumber(raw, 1)));
  }

  function resolveMoveSecondsPerTile(unit) {
    const moveStat = resolveUnitMoveStat(unit);
    return (turnSeconds * moveTimeBaseTurns) / moveStat;
  }

  function resolveMoveDurationMsForStep(unit) {
    return Math.max(0, Math.round(resolveMoveSecondsPerTile(unit) * 1000));
  }

  function resolveMoveTravelSeconds(unit, tiles) {
    const tileCount = Math.max(0, Math.floor(toSafeNumber(tiles, 0)));
    if (tileCount <= 0) return 0;
    return Math.max(1, Math.round(resolveMoveSecondsPerTile(unit) * tileCount));
  }

  function resolveMoveGroupForUnit(unit, config = {}) {
    const allowMemberAsLeader = !!config?.allowMemberAsLeader;
    if (!unit) return { ok: false, reason: "ユニットが見つかりません。" };
    const leaderId = nonEmptyText(unit?.squadLeaderId);
    if (leaderId && !allowMemberAsLeader) {
      return { ok: false, reason: "部隊所属ユニットは単独移動できません。部隊リーダーを選択してください。" };
    }
    if (leaderId && allowMemberAsLeader) {
      const leader = unitList.value.find(row => row?.id === leaderId) || null;
      if (!leader) {
        return { ok: false, reason: "所属部隊のリーダーが見つかりません。" };
      }
      return resolveMoveGroupForUnit(leader, { allowMemberAsLeader: false });
    }

    const participants = [unit];
    if (unitHasSquad(unit)) {
      const memberIds = squadMemberIds(unit);
      for (const memberId of memberIds) {
        const member = unitList.value.find(row => row?.id === memberId) || null;
        if (!member) {
          return { ok: false, reason: "部隊メンバー情報が不足しています。" };
        }
        participants.push(member);
      }
    }

    const leaderX = Number(unit?.x);
    const leaderY = Number(unit?.y);
    if (!Number.isFinite(leaderX) || !Number.isFinite(leaderY) || leaderX < 0 || leaderY < 0) {
      return { ok: false, reason: "ユニット位置が未確定です。" };
    }

    for (const member of participants) {
      const x = Number(member?.x);
      const y = Number(member?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
        return { ok: false, reason: "部隊メンバー位置が未確定です。" };
      }
      if (x !== leaderX || y !== leaderY) {
        return { ok: false, reason: "部隊メンバーが同じ座標に揃っていません。" };
      }
    }

    const minMoveRemaining = participants.reduce((min, row) => Math.min(min, resolveUnitMoveRemaining(row)), Infinity);
    return {
      ok: true,
      leader: unit,
      participants,
      participantIds: participants.map(row => row.id),
      minMoveRemaining: Number.isFinite(minMoveRemaining) ? minMoveRemaining : 0,
      isSquadMove: participants.length > 1
    };
  }

  function canUseUnitAsMoveCandidate(unit) {
    if (!unit) return false;
    if (isUnitMoving(unit)) return false;
    if (nonEmptyText(unit?.squadLeaderId)) return false;
    const group = resolveMoveGroupForUnit(unit);
    if (group.ok && isMoveGroupInProgress(group)) return false;
    return group.ok && group.minMoveRemaining > 0;
  }

  function displayMoveRemainingForCandidate(unit) {
    const group = resolveMoveGroupForUnit(unit);
    if (!group.ok) return resolveUnitMoveRemaining(unit);
    return group.minMoveRemaining;
  }

  const movableUnitCandidates = computed(() => {
    return unitList.value.filter(unit => canUseUnitAsMoveCandidate(unit));
  });

  const canUseUnitMoveModeState = computed(() => {
    const data = currentData.value;
    if (!data || data.shapeOnly || villagePlacementMode.value) return false;
    return movableUnitCandidates.value.length > 0;
  });

  const moveUnitModalRows = computed(() => {
    return movableUnitCandidates.value.map(unit => {
      const iconSrc = resolveMoveUnitIconSrc(unit);
      return {
        unit,
        id: unit.id,
        name: unit.name,
        level: unit.level,
        x: unit.x,
        y: unit.y,
        scoutRange: unit.scoutRange,
        squadCount: unit.squadCount || 0,
        hasSquad: unitHasSquad(unit),
        moveRemaining: displayMoveRemainingForCandidate(unit),
        roleLabel: toUnitRoleLabel(unit),
        iconSrc,
        iconGlyph: iconSrc ? "" : resolveMoveUnitIconGlyph(unit)
      };
    });
  });

  const moveCommandUnit = computed(() => {
    const armedUnitId = nonEmptyText(moveCommandUnitId?.value);
    if (!armedUnitId) return null;
    return unitList.value.find(unit => nonEmptyText(unit?.id) === armedUnitId) || null;
  });

  const isMoveCommandPendingForSelectedUnit = computed(() => {
    const armedUnitId = nonEmptyText(moveCommandUnitId?.value);
    const activeSelectedUnitId = nonEmptyText(selectedUnitId?.value);
    return !!armedUnitId && armedUnitId === activeSelectedUnitId;
  });

  function clearMoveCommandState(options = {}) {
    if (moveCommandUnitId && typeof moveCommandUnitId === "object" && "value" in moveCommandUnitId) {
      moveCommandUnitId.value = "";
    }
    if (options.clearCandidate !== false) {
      moveUnitCandidateId.value = "";
    }
    if (options.clearPlannedPath !== false) {
      clearPlannedMovePath();
    }
  }

  function armMoveCommandForUnit(unitId, options = {}) {
    const normalizedId = nonEmptyText(unitId);
    if (!normalizedId) {
      clearMoveCommandState(options);
      return false;
    }
    moveCommandUnitId.value = normalizedId;
    if (options.syncCandidate !== false) {
      moveUnitCandidateId.value = normalizedId;
    }
    if (options.clearPlannedPath !== false) {
      clearPlannedMovePath();
    }
    return true;
  }

  function canUseUnitMoveMode() {
    return canUseUnitMoveModeState.value;
  }

  function openMoveUnitSelectModal() {
    const candidates = movableUnitCandidates.value;
    if (!candidates.length) return;
    const preferred = selectedUnitId.value && candidates.some(unit => unit.id === selectedUnitId.value)
      ? selectedUnitId.value
      : candidates[0].id;
    moveUnitCandidateId.value = preferred;
    showMoveUnitModal.value = true;
  }

  function closeMoveUnitSelectModal() {
    showMoveUnitModal.value = false;
  }

  function clearPlannedMovePath() {
    plannedMovePathNodes.value = [];
    plannedMoveTarget.value = null;
    plannedMoveSummaryText.value = "";
    plannedMovePreview.value = { pathDistance: 0, estimatedCost: 0, remainingAfter: 0 };
    showMovePathConfirmModal.value = false;
  }

  function confirmMoveUnitSelection() {
    const candidates = movableUnitCandidates.value;
    if (!candidates.length) {
      showMoveUnitModal.value = false;
      return;
    }
    const target = candidates.find(unit => unit.id === moveUnitCandidateId.value) || candidates[0];
    selectedUnitId.value = target.id;
    armMoveCommandForUnit(target.id);
    showMoveUnitModal.value = false;
    updateUnitInfoText(`${target.name} の移動先を選択`);
    emitCharacterStateChange();
    requestMapRender();
  }

  function toggleUnitMoveMode() {
    if (isMoveCommandPendingForSelectedUnit.value) {
      showMoveUnitModal.value = false;
      clearMoveCommandState({ clearCandidate: false });
      clearHousingUpgradeSelectionState();
      if (mapClickInfo?.value != null) {
        mapClickInfo.value = "クリック座標: - / 移動指示を解除しました。";
      }
      emitCharacterStateChange();
      requestMapRender();
      return;
    }
    if (!canUseUnitMoveModeState.value) return;
    clearHousingUpgradeSelectionState();
    openMoveUnitSelectModal();
  }

  function closeMovePathConfirmModal() {
    clearPlannedMovePath();
    requestMapRender();
  }

  async function resolvePathWithWorkerFallback(data, sx, sy, tx, ty, maxDistance, moveUnit = null) {
    if (findPathWithinDistanceAsync) {
      try {
        const workerPath = await findPathWithinDistanceAsync(data, sx, sy, tx, ty, maxDistance);
        if (Array.isArray(workerPath)) return workerPath;
      } catch (error) {
        console.warn("[PathfindingWorkerFallback]", error);
      }
    }
    return findPathWithinDistanceSync(data, sx, sy, tx, ty, maxDistance, moveUnit);
  }

  function evaluatePathMovementCost(data, path, moveUnit = null) {
    if (!Array.isArray(path) || path.length <= 1) {
      return { ok: false, blocked: false, cost: 0, reason: "同じマスです。" };
    }
    let total = 0;
    for (let i = 1; i < path.length; i += 1) {
      const prev = path[i - 1];
      const next = path[i];
      if (!prev || !next) continue;
      const stepCost = movementStepCost(data, prev.x, prev.y, next.x, next.y, moveUnit);
      if (!Number.isFinite(stepCost) || stepCost < 0) {
        return {
          ok: false,
          blocked: true,
          cost: Number.POSITIVE_INFINITY,
          reason: "高度差が大きく、飛行なしでは通行できません。"
        };
      }
      total += stepCost;
    }
    return { ok: true, blocked: false, cost: total, reason: "" };
  }

  async function resolveMovePathPlanToTile(picked) {
    const data = currentData.value;
    const selected = selectedUnit.value;
    if (!data || !selected || !picked) return { ok: false, reason: "移動対象を選択してください。" };
    const moveGroup = resolveMoveGroupForUnit(selected);
    if (!moveGroup.ok || !moveGroup.leader) {
      return { ok: false, reason: moveGroup.reason || "移動対象を確定できません。" };
    }
    const unit = moveGroup.leader;
    if (!isPassableTerrain(data.grid[picked.y]?.[picked.x])) {
      return { ok: false, reason: "海/湖には移動できません。" };
    }
    const moveRemaining = Math.max(0, Math.floor(toSafeNumber(moveGroup.minMoveRemaining, 0)));
    if (moveRemaining <= 0) {
      return { ok: false, reason: "移動残量がありません。ターン経過で回復します。" };
    }
    if (isMoveGroupInProgress(moveGroup)) {
      return { ok: false, reason: "このユニットは移動中です。完了後に再実行してください。" };
    }
    let path = await resolvePathWithWorkerFallback(data, unit.x, unit.y, picked.x, picked.y, moveRemaining, unit);
    if (!path) {
      return { ok: false, reason: `移動残量(${moveRemaining})で到達できません。` };
    }
    const pathDistance = Math.max(0, path.length - 1);
    if (pathDistance <= 0) {
      return { ok: false, reason: "同じマスです。" };
    }
    let costEval = evaluatePathMovementCost(data, path, unit);
    if ((!costEval.ok || costEval.cost > moveRemaining) && findPathWithinDistanceSync) {
      const syncPath = findPathWithinDistanceSync(data, unit.x, unit.y, picked.x, picked.y, moveRemaining, unit);
      if (Array.isArray(syncPath) && syncPath.length > 1) {
        path = syncPath;
        costEval = evaluatePathMovementCost(data, path, unit);
      }
    }
    if (!costEval.ok && costEval.blocked) {
      return { ok: false, reason: costEval.reason || "通行できない地形差があります。" };
    }
    const estimatedCost = costEval.cost;
    if (!Number.isFinite(estimatedCost) || estimatedCost > moveRemaining) {
      return { ok: false, reason: `移動残量(${moveRemaining})で到達できません。` };
    }
    return {
      ok: true,
      picked,
      moveGroup,
      path,
      pathDistance,
      moveRemaining,
      estimatedCost
    };
  }

  /*
  function shouldStopMoveByEncounter(encounterResult = null) {
    const entries = Array.isArray(encounterResult?.entries) ? encounterResult.entries : [];
    const stopEntry = entries.find(entry => (
      !!entry?.enemyAttack
      || !!entry?.ambushByFumble
      || !!entry?.playerAmbush
      || (entry?.context === "move" && !!entry?.enemyFoundPlayer)
    )) || null;
    if (!stopEntry) return { stop: false, reason: "" };
    const enemyName = stopEntry?.enemyGroup?.kind === "faction"
      ? (stopEntry?.enemyGroup?.factionLabel || "他勢力")
      : (stopEntry?.enemyGroup?.names?.[0] || "敵");
    if (stopEntry?.context === "move" && stopEntry?.enemyFoundPlayer) {
      return { stop: true, reason: `${enemyName}に発見されたため停止` };
    }
    if (stopEntry?.playerAmbush) {
      return { stop: true, reason: `同マスで${enemyName}を捕捉したため停止` };
    }
    if (stopEntry?.ambushByFumble) {
      return { stop: true, reason: `${enemyName}の不意打ちで停止` };
    }
    return { stop: true, reason: `${enemyName}との交戦判定で停止` };
  }

  function shouldStopMoveByEncounterEx(encounterResult = null) {
    const entries = Array.isArray(encounterResult?.entries) ? encounterResult.entries : [];
    const stopEntry = entries.find(entry => {
      const distance = Number(entry?.distance);
      const isDirectContact = Number.isFinite(distance) && distance <= 0;
      if (!isDirectContact) return false;
      return (
        !!entry?.enemyAttack
        || !!entry?.ambushByFumble
        || !!entry?.stealthAmbush
        || !!entry?.playerAmbush
        || (entry?.context === "move" && !!entry?.enemyFoundPlayer && !!entry?.enemyAggressive)
      );
    }) || null;
    if (!stopEntry) {
      return { stop: false, reason: "", battleTriggered: false, battleEntry: null };
    }
    const enemyName = stopEntry?.enemyGroup?.kind === "faction"
      ? (stopEntry?.enemyGroup?.factionLabel || "他勢力")
      : (stopEntry?.enemyGroup?.names?.[0] || "敵");
    const stealthAmbush = !!stopEntry?.stealthAmbush
      || (
        stopEntry?.context === "move"
        && !!stopEntry?.enemyAggressive
        && !!stopEntry?.enemyFoundPlayer
        && !stopEntry?.playerFoundEnemy
      );
    if (stealthAmbush) {
      return {
        stop: true,
        reason: `${enemyName}の奇襲を受けた`,
        battleTriggered: true,
        battleEntry: stopEntry
      };
    }
    if (stopEntry?.context === "move" && stopEntry?.enemyFoundPlayer && stopEntry?.enemyAggressive) {
      return {
        stop: true,
        reason: `${enemyName}に発見され足止め`,
        battleTriggered: !!stopEntry?.enemyAttack || !!stopEntry?.ambushByFumble,
        battleEntry: stopEntry
      };
    }
    if (stopEntry?.playerAmbush) {
      return {
        stop: true,
        reason: `同マスで${enemyName}を奇襲したため戦闘`,
        battleTriggered: true,
        battleEntry: stopEntry
      };
    }
    if (stopEntry?.ambushByFumble) {
      return {
        stop: true,
        reason: `${enemyName}の不意打ちで戦闘`,
        battleTriggered: true,
        battleEntry: stopEntry
      };
    }
    if (stopEntry?.enemyAttack) {
      return {
        stop: true,
        reason: `${enemyName}の襲撃で戦闘`,
        battleTriggered: true,
        battleEntry: stopEntry
      };
    }
    return { stop: true, reason: `${enemyName}との遭遇で停止`, battleTriggered: false, battleEntry: stopEntry };
  }

  function normalizeMoveRouteNodes(path = []) {
    if (!Array.isArray(path)) return [];
    const nodes = [];
    for (const node of path) {
      const x = Number(node?.x);
      const y = Number(node?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      nodes.push({ x: Math.floor(x), y: Math.floor(y) });
    }
    return nodes;
  }

  function applyMoveRouteToParticipants(participantIdSet, pathNodes = []) {
    if (!(participantIdSet instanceof Set) || !participantIdSet.size) return;
    const normalizedPath = normalizeMoveRouteNodes(pathNodes);
    const remainingTiles = Math.max(0, normalizedPath.length - 1);
    unitList.value = unitList.value.map(row => {
      if (!participantIdSet.has(row?.id)) return row;
      return {
        ...row,
        moveRoutePathNodes: normalizedPath,
        moveRouteRemainingTiles: remainingTiles
      };
    });
  }

  function clearMoveRouteFromParticipants(participantIdSet) {
    if (!(participantIdSet instanceof Set) || !participantIdSet.size) return;
    unitList.value = unitList.value.map(row => {
      if (!participantIdSet.has(row?.id)) return row;
      return {
        ...row,
        moveRoutePathNodes: [],
        moveRouteRemainingTiles: 0
      };
    });
  }

  */

  function shouldStopMoveByEncounterEx(encounterResult = null) {
    const entries = Array.isArray(encounterResult?.entries) ? encounterResult.entries : [];
    const stopEntry = entries.find(entry => (
      !!entry?.enemyAttack
      || !!entry?.ambushByFumble
      || !!entry?.stealthAmbush
      || !!entry?.playerAmbush
    )) || null;
    if (!stopEntry) {
      return { stop: false, reason: "", battleTriggered: false, battleEntry: null };
    }
    const enemyName = stopEntry?.enemyGroup?.kind === "faction"
      ? (stopEntry?.enemyGroup?.factionLabel || "Faction")
      : (stopEntry?.enemyGroup?.names?.[0] || "Enemy");
    const stealthAmbush = !!stopEntry?.stealthAmbush;
    if (stealthAmbush) {
      return {
        stop: true,
        reason: `${enemyName}の奇襲を受けた`,
        battleTriggered: true,
        battleEntry: stopEntry
      };
    }
    if (stopEntry?.playerAmbush) {
      return {
        stop: true,
        reason: `同マスで${enemyName}を奇襲したため戦闘`,
        battleTriggered: true,
        battleEntry: stopEntry
      };
    }
    if (stopEntry?.ambushByFumble) {
      return {
        stop: true,
        reason: `${enemyName}の不意打ちで戦闘`,
        battleTriggered: true,
        battleEntry: stopEntry
      };
    }
    if (stopEntry?.enemyAttack) {
      return {
        stop: true,
        reason: `${enemyName}の襲撃で戦闘`,
        battleTriggered: true,
        battleEntry: stopEntry
      };
    }
    return { stop: true, reason: `${enemyName}との遭遇で停止`, battleTriggered: false, battleEntry: stopEntry };
  }

  function normalizeMoveRouteNodes(path = []) {
    if (!Array.isArray(path)) return [];
    const nodes = [];
    for (const node of path) {
      const x = Number(node?.x);
      const y = Number(node?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      nodes.push({ x: Math.floor(x), y: Math.floor(y) });
    }
    return nodes;
  }

  function applyMoveRouteToParticipants(participantIdSet, pathNodes = []) {
    if (!(participantIdSet instanceof Set) || !participantIdSet.size) return;
    const normalizedPath = normalizeMoveRouteNodes(pathNodes);
    const remainingTiles = Math.max(0, normalizedPath.length - 1);
    unitList.value = unitList.value.map(row => {
      if (!participantIdSet.has(row?.id)) return row;
      return {
        ...row,
        moveRoutePathNodes: normalizedPath,
        moveRouteRemainingTiles: remainingTiles
      };
    });
  }

  function clearMoveRouteFromParticipants(participantIdSet) {
    if (!(participantIdSet instanceof Set) || !participantIdSet.size) return;
    unitList.value = unitList.value.map(row => {
      if (!participantIdSet.has(row?.id)) return row;
      return {
        ...row,
        moveRoutePathNodes: [],
        moveRouteRemainingTiles: 0
      };
    });
  }

  async function queueMovePathPlanToTile(picked) {
    const plan = await resolveMovePathPlanToTile(picked);
    if (!plan.ok) return { queued: false, reason: plan.reason || "移動経路を作成できません。" };
    plannedMovePathNodes.value = plan.path.map(node => ({ x: node.x, y: node.y }));
    plannedMoveTarget.value = { x: picked.x, y: picked.y };
    plannedMoveSummaryText.value = (
      `経路: (${plan.moveGroup.leader.x}, ${plan.moveGroup.leader.y}) -> (${picked.x}, ${picked.y}) `
      + `/ ${plan.pathDistance}マス / 所要${resolveMoveTravelSeconds(plan.moveGroup.leader, plan.pathDistance)}s`
      + ` / 予測コスト${plan.estimatedCost} / 残${Math.max(0, plan.moveRemaining - plan.estimatedCost)}`
    );
    plannedMovePreview.value = {
      pathDistance: plan.pathDistance,
      estimatedCost: plan.estimatedCost,
      remainingAfter: Math.max(0, plan.moveRemaining - plan.estimatedCost)
    };
    showMovePathConfirmModal.value = true;
    return { queued: true, pathDistance: plan.pathDistance, estimatedCost: plan.estimatedCost };
  }

  function waitByGameClockMs(durationMs) {
    const needMs = Math.max(0, Math.floor(toSafeNumber(durationMs, 0)));
    if (needMs <= 0) return Promise.resolve();
    const startClockMs = Math.max(0, Math.floor(toSafeNumber(getClockElapsedMs(), 0)));
    return new Promise(resolve => {
      const poll = () => {
        const currentClockMs = Math.max(0, Math.floor(toSafeNumber(getClockElapsedMs(), 0)));
        if ((currentClockMs - startClockMs) >= needMs) {
          resolve();
          return;
        }
        window.setTimeout(poll, 80);
      };
      window.setTimeout(poll, 80);
    });
  }

  async function executePlannedMovePath(moveTarget = null) {
    clearLastMoveStopState();
    const target = moveTarget
      && Number.isFinite(moveTarget?.x)
      && Number.isFinite(moveTarget?.y)
      ? moveTarget
      : plannedMoveTarget.value;
    const picked = target && Number.isFinite(target?.x) && Number.isFinite(target?.y)
      ? { x: target.x, y: target.y }
      : null;
    if (!picked) {
      return { moved: false, reason: "移動先が未設定です。" };
    }
    const plan = await resolveMovePathPlanToTile(picked);
    if (!plan.ok) {
      return { moved: false, reason: plan.reason || "移動経路が無効です。" };
    }
    if (isMoveGroupInProgress(plan.moveGroup)) {
      return { moved: false, reason: "このユニットは移動中です。完了後に再実行してください。", moveGroup: plan.moveGroup };
    }
    setMoveGroupInProgress(plan.moveGroup, true);
    const unit = plan.moveGroup.leader;
    const fromX = unit.x;
    const fromY = unit.y;
    let spentCost = 0;
    let movedTiles = 0;
    let stopReason = "";
    let lastNode = { x: fromX, y: fromY };
    const participantIdSet = new Set(plan.moveGroup.participantIds);
    let remainingRouteNodes = normalizeMoveRouteNodes(plan.path);
    applyMoveRouteToParticipants(participantIdSet, remainingRouteNodes);
    renderMapNow();
    const hostileFactionTileMap = buildOpposingFactionUnitsByTile(currentData.value);
    const perTileDurationMs = resolveMoveDurationMsForStep(unit);
    try {
      for (let i = 1; i < plan.path.length; i += 1) {
        const prev = plan.path[i - 1];
        const next = plan.path[i];
        if (!prev || !next) continue;
        await waitByGameClockMs(perTileDurationMs);
        const stepCost = movementStepCost(currentData.value, prev.x, prev.y, next.x, next.y, unit);
        if (!Number.isFinite(stepCost) || stepCost < 0) {
          stopReason = "高度差が大きく、飛行なしでは通行できません。";
          setLastMoveStopState(stopReason, prev?.x, prev?.y);
          break;
        }
        if (spentCost + stepCost > plan.moveRemaining) {
          stopReason = "移動残量が不足しました。";
          setLastMoveStopState(stopReason, prev?.x, prev?.y);
          break;
        }
        const passCheck = runHostilePassStealthCheckAtTile({
          data: currentData.value,
          moveGroup: plan.moveGroup,
          x: next.x,
          y: next.y,
          factionTileMap: hostileFactionTileMap
        });
        if (passCheck.blocked) {
          stopReason = passCheck.reason || "敵に発見されて通行不可になりました。";
          setLastMoveStopState(stopReason, prev?.x, prev?.y);
          emitCharacterStateChange();
          renderMapNow();
          break;
        }
        unitList.value = unitList.value.map(row => {
          if (!participantIdSet.has(row.id)) return row;
          const ownRemaining = resolveUnitMoveRemaining(row);
          const nextRouteNodes = remainingRouteNodes.length > 1
            ? remainingRouteNodes.slice(1)
            : [{ x: next.x, y: next.y }];
          const routeRemainingTiles = Math.max(0, nextRouteNodes.length - 1);
          return {
            ...row,
            x: next.x,
            y: next.y,
            moveRemaining: Math.max(0, ownRemaining - stepCost),
            moveRoutePathNodes: nextRouteNodes,
            moveRouteRemainingTiles: routeRemainingTiles
          };
        });
        remainingRouteNodes = remainingRouteNodes.length > 1
          ? remainingRouteNodes.slice(1)
          : [{ x: next.x, y: next.y }];
        spentCost += stepCost;
        movedTiles += 1;
        lastNode = { x: next.x, y: next.y };
        markPathExplored([next]);
        const tileKey = coordKey(next.x, next.y);
        const activeUnitId = nonEmptyText(selectedUnitId.value);
        const focusMovingGroup = activeUnitId && participantIdSet.has(activeUnitId);
        if (focusMovingGroup) {
          setSelectedTileKey(tileKey);
          onMapTileSelected(next, tileKey);
        }
        renderMapNow();
        const encounterResult = runEnemyEncounterCheck({
          context: "move",
          focusPos: { x: next.x, y: next.y }
        });
        const stopCheck = shouldStopMoveByEncounterEx(encounterResult);
        if (stopCheck.stop) {
          stopReason = stopCheck.reason || "交戦判定により停止しました。";
          setLastMoveStopState(stopReason, next?.x, next?.y);
          if (stopCheck.battleTriggered && stopCheck.battleEntry) {
            onStartEncounterBattle({
              context: "move",
              reason: stopReason,
              entry: stopCheck.battleEntry,
              atX: next?.x,
              atY: next?.y,
              moveGroup: plan.moveGroup
            });
          }
          break;
        }
      }
    } finally {
      setMoveGroupInProgress(plan.moveGroup, false);
      clearMoveRouteFromParticipants(participantIdSet);
    }
    if (movedTiles <= 0) {
      if (!nonEmptyText(getLastMoveStopState()?.reason)) {
        setLastMoveStopState(stopReason || "移動できませんでした。", fromX, fromY);
      }
      return { moved: false, reason: stopReason || "移動できませんでした。", moveGroup: plan.moveGroup };
    }
    const nextRemaining = Math.max(0, plan.moveRemaining - spentCost);
    const movePrefix = plan.moveGroup.isSquadMove
      ? `部隊移動(${plan.moveGroup.participants.length}体)`
      : "移動";
    const stopSuffix = stopReason ? ` / 停止: ${stopReason}` : "";
    if (stopReason && !nonEmptyText(getLastMoveStopState()?.reason)) {
      setLastMoveStopState(stopReason, lastNode.x, lastNode.y);
    }
    const elapsedSec = resolveMoveTravelSeconds(unit, movedTiles);
    updateUnitInfoText(`${movePrefix}: (${fromX}, ${fromY}) -> (${lastNode.x}, ${lastNode.y}) / +${movedTiles}マス / ${elapsedSec}s / コスト${spentCost} / 残${nextRemaining}${stopSuffix}`);
    emitCharacterStateChange();
    return {
      moved: true,
      distance: movedTiles,
      remaining: nextRemaining,
      cost: spentCost,
      movedUnitCount: plan.moveGroup.participants.length,
      movedUnitIds: Array.from(participantIdSet),
      stopReason,
      x: lastNode.x,
      y: lastNode.y,
      moveGroup: plan.moveGroup
    };
  }

  async function confirmPlannedMovePath() {
    const picked = plannedMoveTarget.value
      && Number.isFinite(plannedMoveTarget.value?.x)
      && Number.isFinite(plannedMoveTarget.value?.y)
      ? { x: plannedMoveTarget.value.x, y: plannedMoveTarget.value.y }
      : null;
    if (!picked) {
      clearPlannedMovePath();
      return;
    }
    showMovePathConfirmModal.value = false;
    clearPlannedMovePath();
    updateUnitInfoText("移動開始: 1マスずつ進行します。");
    const result = await executePlannedMovePath(picked);
    if (result?.reason && !result?.moved) {
      const fallbackX = Number.isFinite(result?.moveGroup?.leader?.x) ? result.moveGroup.leader.x : selectedUnit.value?.x;
      const fallbackY = Number.isFinite(result?.moveGroup?.leader?.y) ? result.moveGroup.leader.y : selectedUnit.value?.y;
      setLastMoveStopState(result.reason, fallbackX, fallbackY);
      updateUnitInfoText(`移動失敗: ${result.reason}`);
    } else if (result?.moved) {
      const activeUnitId = nonEmptyText(selectedUnitId.value);
      const moveUnitIds = Array.isArray(result?.movedUnitIds) ? result.movedUnitIds : [];
      const shouldFocusResultTile = activeUnitId && moveUnitIds.includes(activeUnitId);
      if (shouldFocusResultTile && Number.isFinite(result?.x) && Number.isFinite(result?.y)) {
        const tileKey = coordKey(result.x, result.y);
        setSelectedTileKey(tileKey);
        onMapTileSelected(result, tileKey);
      }
    }
    renderMapNow();
  }

  function resetAllUnitMoveRemaining() {
    if (!unitList.value.length) return;
    unitList.value = unitList.value.map(unit => ({
      ...unit,
      moveRemaining: Math.max(0, Math.floor(toSafeNumber(unit.moveRange, 0)))
    }));
    emitCharacterStateChange();
  }

  function resetMoveUiState() {
    clearMoveCommandState({ clearCandidate: true });
    showMoveUnitModal.value = false;
  }

  return {
    resolveUnitMoveRemaining,
    resolveMoveGroupForUnit,
    canUseUnitAsMoveCandidate,
    displayMoveRemainingForCandidate,
    movableUnitCandidates,
    moveUnitModalRows,
    moveCommandUnit,
    isMoveCommandPendingForSelectedUnit,
    canUseUnitMoveModeState,
    canUseUnitMoveMode,
    openMoveUnitSelectModal,
    closeMoveUnitSelectModal,
    armMoveCommandForUnit,
    clearMoveCommandState,
    confirmMoveUnitSelection,
    toggleUnitMoveMode,
    clearPlannedMovePath,
    closeMovePathConfirmModal,
    resolveMovePathPlanToTile,
    queueMovePathPlanToTile,
    executePlannedMovePath,
    confirmPlannedMovePath,
    isUnitMoving,
    isMoveGroupInProgress,
    resetAllUnitMoveRemaining,
    resetMoveUiState
  };
}
