const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const uniqueTexts = value => [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))];

function normalizeRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

export function createEmptyV39EnemyExplorationInformation(source = {}) {
  return {
    terrainByTile:normalizeRecord(source?.terrainByTile),
    territoryByTile:normalizeRecord(source?.territoryByTile),
    settlementIds:uniqueTexts(source?.settlementIds),
    nestIds:uniqueTexts(source?.nestIds),
    unitIds:uniqueTexts(source?.unitIds),
    foodCandidatesByTile:normalizeRecord(source?.foodCandidatesByTile),
    visitedTileKeys:uniqueTexts(source?.visitedTileKeys)
  };
}

export function normalizeV39EnemyExplorerState(source = {}) {
  const active = source?.active === true;
  const sourceMode = text(source?.mode);
  return {
    active,
    mode:active && ["return", "raid"].includes(sourceMode) ? sourceMode : "search",
    nestId:text(source?.nestId),
    targetTileKey:text(source?.targetTileKey),
    searchRadius:Math.max(0, integer(source?.searchRadius)),
    maxDistance:Math.max(0, integer(source?.maxDistance)),
    information:createEmptyV39EnemyExplorationInformation(source?.information),
    startedTurn:Math.max(0, integer(source?.startedTurn)),
    lastObservedTurn:Math.max(0, integer(source?.lastObservedTurn))
  };
}

export function normalizeV39NestExplorationState(source = {}) {
  return {
    explorerUnitIds:uniqueTexts(source?.explorerUnitIds),
    searchRadius:Math.max(0, integer(source?.searchRadius)),
    knownInformation:createEmptyV39EnemyExplorationInformation(source?.knownInformation),
    raidTargetKey:text(source?.raidTargetKey),
    lastPreparedTurn:Math.max(0, integer(source?.lastPreparedTurn))
  };
}

export function isV39NestFoodShortage(nest) {
  return Object.values(nest?.populationGrowthByRace || {}).some(row => {
    const remainingTurns = row?.remainingTurns;
    return integer(row?.starvationStage) > 0
      || (remainingTurns !== null && remainingTurns !== undefined && number(remainingTurns, Number.POSITIVE_INFINITY) < 4);
  });
}

function mergeInformation(left, right) {
  const a = createEmptyV39EnemyExplorationInformation(left);
  const b = createEmptyV39EnemyExplorationInformation(right);
  return {
    terrainByTile:{ ...a.terrainByTile, ...b.terrainByTile },
    territoryByTile:{ ...a.territoryByTile, ...b.territoryByTile },
    settlementIds:uniqueTexts([...a.settlementIds, ...b.settlementIds]),
    nestIds:uniqueTexts([...a.nestIds, ...b.nestIds]),
    unitIds:uniqueTexts([...a.unitIds, ...b.unitIds]),
    foodCandidatesByTile:{ ...a.foodCandidatesByTile, ...b.foodCandidatesByTile },
    visitedTileKeys:uniqueTexts([...a.visitedTileKeys, ...b.visitedTileKeys])
  };
}

function baseExplorerCount(memberCount) {
  if (memberCount <= 1) return 0;
  if (memberCount <= 3) return 1;
  return 2;
}

function explorerCountForShortage(nest, memberCount) {
  const base = baseExplorerCount(memberCount);
  const stage = Math.max(0, ...Object.values(nest?.populationGrowthByRace || {}).map(row => integer(row?.starvationStage)));
  const increased = stage >= 4 ? Math.floor(memberCount / 2) : base + Math.max(0, stage - 1);
  return Math.min(Math.floor(memberCount / 2), increased);
}

function atNest(enemy, nest) {
  return integer(enemy?.x) === integer(nest?.x) && integer(enemy?.y) === integer(nest?.y);
}

export function prepareV39EnemyExploration(state, turnNumber) {
  const aliveEnemies = (state?.enemies || []).filter(enemy => number(enemy?.hp, enemy?.currentHp) > 0 && text(enemy?.state) !== "死亡");
  const enemyById = new Map(aliveEnemies.map(enemy => [text(enemy?.id), enemy]));
  const enemyPatchById = new Map();
  const nests = (state?.enemyNests || []).map(nest => {
    const nestId = text(nest?.id);
    const members = aliveEnemies
      .filter(enemy => text(enemy?.nestId) === nestId)
      .sort((left, right) => text(left?.id).localeCompare(text(right?.id), "ja", { numeric:true }));
    const shortage = isV39NestFoodShortage(nest);
    const previous = normalizeV39NestExplorationState(nest?.explorationState);
    let knownInformation = previous.knownInformation;
    let assignedIds = previous.explorerUnitIds.filter(id => enemyById.has(id));

    for (const id of assignedIds) {
      const enemy = enemyById.get(id);
      const explorer = normalizeV39EnemyExplorerState(enemy?.explorationState);
      if (!explorer.active || !atNest(enemy, nest)) continue;
      knownInformation = mergeInformation(knownInformation, explorer.information);
      enemyPatchById.set(id, { explorationState:null });
    }

    if (shortage) {
      const desiredCount = explorerCountForShortage(nest, members.length);
      assignedIds = assignedIds.filter(id => !enemyPatchById.has(id)).slice(0, desiredCount);
      for (const enemy of members) {
        if (assignedIds.length >= desiredCount) break;
        const id = text(enemy?.id);
        if (!assignedIds.includes(id)) assignedIds.push(id);
      }
      const reachedEdgeWithoutCandidate = assignedIds.some(id => {
        const explorer = normalizeV39EnemyExplorerState(enemyById.get(id)?.explorationState);
        return explorer.maxDistance >= previous.searchRadius
          && !Object.keys(explorer.information.foodCandidatesByTile).length;
      });
      const initialRadius = Math.max(1, integer(nest?.territoryRadius, 1)) + 2;
      const searchRadius = Math.max(initialRadius, previous.searchRadius + (reachedEdgeWithoutCandidate ? 2 : 0));
      const raidTargetKey = Object.entries(knownInformation.foodCandidatesByTile)
        .filter(([key, candidate]) => candidate?.type === "food-territory"
          && text(state?.territoryOwnerByTile?.[key])
          && state?.territoryStateByTile?.[key]?.raided !== true
          && number(state?.territoryStateByTile?.[key]?.hp, state?.territoryStateByTile?.[key]?.maxHp || 100) > 0)
        .map(([key]) => key)
        .sort()[0] || "";
      for (const [index, id] of assignedIds.entries()) {
        const enemy = enemyById.get(id);
        const current = normalizeV39EnemyExplorerState(enemyPatchById.get(id)?.explorationState ?? enemy?.explorationState);
        const personalCandidateFound = Object.keys(current.information.foodCandidatesByTile).length > 0;
        enemyPatchById.set(id, {
          explorationState:{
            ...current,
            active:true,
            mode:raidTargetKey && index === 0 ? "raid" : personalCandidateFound ? "return" : "search",
            nestId,
            targetTileKey:raidTargetKey && index === 0 ? raidTargetKey : "",
            searchRadius,
            startedTurn:current.startedTurn || Math.max(1, integer(turnNumber))
          }
        });
      }
      return {
        ...nest,
        foodShortage:true,
        explorationState:{ explorerUnitIds:assignedIds, searchRadius, knownInformation, raidTargetKey, lastPreparedTurn:integer(turnNumber) }
      };
    }

    const returningIds = assignedIds.filter(id => {
      const enemy = enemyById.get(id);
      if (!enemy || atNest(enemy, nest)) return false;
      const current = normalizeV39EnemyExplorerState(enemy?.explorationState);
      enemyPatchById.set(id, { explorationState:{ ...current, active:true, mode:"return", nestId } });
      return true;
    });
    return {
      ...nest,
      foodShortage:false,
      explorationState:{ ...previous, explorerUnitIds:returningIds, knownInformation, lastPreparedTurn:integer(turnNumber) }
    };
  });

  const assignedSet = new Set(nests.flatMap(nest => nest?.explorationState?.explorerUnitIds || []));
  const enemies = (state?.enemies || []).map(enemy => {
    const id = text(enemy?.id);
    if (enemyPatchById.has(id)) return { ...enemy, ...enemyPatchById.get(id) };
    if (enemy?.explorationState?.active === true && !assignedSet.has(id)) return { ...enemy, explorationState:null };
    return enemy;
  });
  return { ...state, enemies, enemyNests:nests };
}

export function mergeV39EnemyExplorationInformation(left, right) {
  return mergeInformation(left, right);
}
