import { computed } from "vue";

export function useUnitCreatePanel(options = {}) {
  const props = options.props || {};
  const unitCreateModeKeys = options.unitCreateModeKeys || { NORMAL: "normal" };

  const showUnitCreateCountModal = options.showUnitCreateCountModal;
  const showUnitCreateRaceModal = options.showUnitCreateRaceModal;
  const showUnitCreateClassModal = options.showUnitCreateClassModal;
  const showUnitCreateRarityModal = options.showUnitCreateRarityModal || { value: false };
  const unitCreateRace = options.unitCreateRace;
  const unitCreateClass = options.unitCreateClass;
  const unitCreateRarity = options.unitCreateRarity || { value: "common" };
  const unitCreateBatchCount = options.unitCreateBatchCount;
  const unitCreateMode = options.unitCreateMode;
  const villageState = options.villageState;
  const unitList = options.unitList;
  const selectedUnitId = options.selectedUnitId;

  const cityAbilityActiveCap = Math.max(1, Math.floor(Number(options.cityAbilityActiveCap ?? 1)));

  const nonEmptyText = typeof options.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const toSafeNumber = typeof options.toSafeNumber === "function"
    ? options.toSafeNumber
    : ((value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    });

  const resolveActiveFactionRace = typeof options.resolveActiveFactionRace === "function"
    ? options.resolveActiveFactionRace
    : (() => nonEmptyText(props.selectedRace) || "只人");
  const ensureVillageStateShape = typeof options.ensureVillageStateShape === "function"
    ? options.ensureVillageStateShape
    : (value => value);
  const resolveVillageAbilityLevel = typeof options.resolveVillageAbilityLevel === "function"
    ? options.resolveVillageAbilityLevel
    : (() => 1);
  const resolveFactionHeroUnitCap = typeof options.resolveFactionHeroUnitCap === "function"
    ? options.resolveFactionHeroUnitCap
    : (() => 0);
  const resolveFactionArmyUnitCap = typeof options.resolveFactionArmyUnitCap === "function"
    ? options.resolveFactionArmyUnitCap
    : (() => 0);
  const resolveHeroCreateUnlockedCount = typeof options.resolveHeroCreateUnlockedCount === "function"
    ? options.resolveHeroCreateUnlockedCount
    : (() => 0);
  const isMobUnit = typeof options.isMobUnit === "function"
    ? options.isMobUnit
    : (() => false);
  const isMilitaryUnit = typeof options.isMilitaryUnit === "function"
    ? options.isMilitaryUnit
    : (() => false);
  const resolveUnitCreateModeCatalog = typeof options.resolveUnitCreateModeCatalog === "function"
    ? options.resolveUnitCreateModeCatalog
    : (() => []);
  const resolveUnitCreateMode = typeof options.resolveUnitCreateMode === "function"
    ? options.resolveUnitCreateMode
    : ((mode) => ({ mode: nonEmptyText(mode) || unitCreateModeKeys.NORMAL, label: "-", hpMultiplier: 1, attackCount: 1, populationCost: 0 }));
  const updateUnitInfoText = typeof options.updateUnitInfoText === "function"
    ? options.updateUnitInfoText
    : (() => {});
  const kickOffBgm = typeof options.kickOffBgm === "function"
    ? options.kickOffBgm
    : (() => {});
  const audio = options.audio && typeof options.audio.playSe === "function"
    ? options.audio
    : { playSe: () => {} };
  const findClassRowByName = typeof options.findClassRowByName === "function"
    ? options.findClassRowByName
    : (() => null);
  const randomPick = typeof options.randomPick === "function"
    ? options.randomPick
    : (() => null);
  const initialJobClassRows = options.initialJobClassRows;
  const isInitialClassRow = typeof options.isInitialClassRow === "function"
    ? options.isInitialClassRow
    : (() => false);
  const resolveRaceBaseClassName = typeof options.resolveRaceBaseClassName === "function"
    ? options.resolveRaceBaseClassName
    : (raceName => raceName);
  const classRows = options.classRows;
  const resolveMaxCreatableByPopulation = typeof options.resolveMaxCreatableByPopulation === "function"
    ? options.resolveMaxCreatableByPopulation
    : (() => 0);
  const buildUnitCreationCost = typeof options.buildUnitCreationCost === "function"
    ? options.buildUnitCreationCost
    : (() => ({ food: {}, material: {} }));
  const canAffordUnitCreation = typeof options.canAffordUnitCreation === "function"
    ? options.canAffordUnitCreation
    : (() => false);
  const applyUnitCreationCost = typeof options.applyUnitCreationCost === "function"
    ? options.applyUnitCreationCost
    : (() => null);
  const consumeVillagePopulationByRace = typeof options.consumeVillagePopulationByRace === "function"
    ? options.consumeVillagePopulationByRace
    : (() => ({ ok: false, reason: "人口消費関数が未設定です。", village: null }));
  const createUnitRecord = typeof options.createUnitRecord === "function"
    ? options.createUnitRecord
    : (() => null);
  const buildAutoUnitName = typeof options.buildAutoUnitName === "function"
    ? options.buildAutoUnitName
    : (() => "ユニット");
  const applyAutoEquipForCreatedUnit = typeof options.applyAutoEquipForCreatedUnit === "function"
    ? options.applyAutoEquipForCreatedUnit
    : (unit => ({ unit, village: villageState.value, fromInventory: 0, generated: 0, warningMessages: [] }));
  const heroInitialLevel = Math.max(1, Math.floor(toSafeNumber(options.heroInitialLevel, 1)));
  const formatFoodResourceBag = typeof options.formatFoodResourceBag === "function"
    ? options.formatFoodResourceBag
    : (() => "-");
  const formatMaterialResourceBag = typeof options.formatMaterialResourceBag === "function"
    ? options.formatMaterialResourceBag
    : (() => "-");
  const updateVillageInfoText = typeof options.updateVillageInfoText === "function"
    ? options.updateVillageInfoText
    : (() => {});
  const pushNationLog = typeof options.pushNationLog === "function"
    ? options.pushNationLog
    : (() => {});
  const emitCharacterStateChange = typeof options.emitCharacterStateChange === "function"
    ? options.emitCharacterStateChange
    : (() => {});
  const renderMapWithPhaser = typeof options.renderMapWithPhaser === "function"
    ? options.renderMapWithPhaser
    : (() => {});
  const normalizeEquipmentRarity = typeof options.normalizeEquipmentRarity === "function"
    ? options.normalizeEquipmentRarity
    : (value => {
      const text = nonEmptyText(value).toLowerCase();
      if (["common", "uncommon", "rare", "epic", "legendary"].includes(text)) return text;
      return "common";
    });
  const formatEquipmentRarityLabel = typeof options.formatEquipmentRarityLabel === "function"
    ? options.formatEquipmentRarityLabel
    : (value => {
      const key = normalizeEquipmentRarity(value);
      if (key === "legendary") return "レジェンダリー";
      if (key === "epic") return "エピック";
      if (key === "rare") return "レア";
      if (key === "uncommon") return "アンコモン";
      return "コモン";
    });
  const equipmentRarityKeys = Array.isArray(options.equipmentRarityKeys) && options.equipmentRarityKeys.length
    ? options.equipmentRarityKeys.map(key => normalizeEquipmentRarity(key))
    : ["common", "uncommon", "rare", "epic", "legendary"];

  function ensureSelectedCreateRarity() {
    const current = normalizeEquipmentRarity(unitCreateRarity?.value, "common");
    const fallback = normalizeEquipmentRarity(equipmentRarityKeys[0] || "common", "common");
    unitCreateRarity.value = equipmentRarityKeys.includes(current) ? current : fallback;
  }

  const canOpenUnitCreate = computed(() => {
    const village = villageState.value;
    return !!(village?.placed && Number.isFinite(village?.x) && Number.isFinite(village?.y));
  });

  const heroUnitCount = computed(() => {
    const source = Array.isArray(unitList.value) ? unitList.value : [];
    return source.filter(unit => isMobUnit(unit) && !isMilitaryUnit(unit)).length;
  });

  const armyUnitCount = computed(() => {
    const source = Array.isArray(unitList.value) ? unitList.value : [];
    return source.filter(unit => isMobUnit(unit) && isMilitaryUnit(unit)).length;
  });

  const heroUnitCap = computed(() => {
    const village = ensureVillageStateShape(villageState.value, resolveActiveFactionRace());
    return resolveFactionHeroUnitCap(village, resolveActiveFactionRace());
  });

  const armyUnitCap = computed(() => {
    const village = ensureVillageStateShape(villageState.value, resolveActiveFactionRace());
    return resolveFactionArmyUnitCap(village, resolveActiveFactionRace());
  });

  const heroCreateRemaining = computed(() => {
    return Math.max(0, heroUnitCap.value - heroUnitCount.value);
  });

  const heroCreateUnlocked = computed(() => {
    return resolveHeroCreateUnlockedCount(villageState.value);
  });

  const heroCreateAvailable = computed(() => {
    return Math.max(0, Math.min(heroCreateRemaining.value, heroCreateUnlocked.value));
  });

  const armyCreateRemaining = computed(() => {
    return Math.max(0, armyUnitCap.value - armyUnitCount.value);
  });

  const canCreateAnyUnit = computed(() => {
    return canOpenUnitCreate.value && (heroCreateAvailable.value > 0 || armyCreateRemaining.value > 0);
  });

  const unitCreateMilitaryLevel = computed(() => {
    const village = ensureVillageStateShape(villageState.value, props.selectedRace);
    return resolveVillageAbilityLevel(village, "軍事", cityAbilityActiveCap);
  });

  const unitCreateModeOptions = computed(() => {
    const level = Math.max(1, Math.floor(toSafeNumber(unitCreateMilitaryLevel.value, 1)));
    return resolveUnitCreateModeCatalog().map(mode => {
      const requiredLv = Math.max(1, Math.floor(toSafeNumber(mode?.requiredMilitaryLevel, 1)));
      const usesArmyCap = mode.mode !== unitCreateModeKeys.NORMAL;
      const currentCount = usesArmyCap ? armyUnitCount.value : heroUnitCount.value;
      const cap = usesArmyCap ? armyUnitCap.value : heroUnitCap.value;
      const remainingRaw = Math.max(0, cap - currentCount);
      const remaining = usesArmyCap ? remainingRaw : Math.max(0, Math.min(remainingRaw, heroCreateUnlocked.value));
      const levelEnabled = level >= requiredLv;
      const enabled = levelEnabled && remaining > 0;
      const requirementText = !levelEnabled
        ? `軍事Lv${requiredLv}で解放`
        : (remaining > 0
          ? `残り${remaining}`
          : (usesArmyCap
            ? `上限 ${currentCount}/${cap}`
            : (remainingRaw > 0 ? "誕生待ち" : `上限 ${currentCount}/${cap}`)));
      return {
        ...mode,
        enabled,
        currentCount,
        cap,
        remaining,
        unlocked: usesArmyCap ? null : heroCreateUnlocked.value,
        requirementText
      };
    });
  });

  const selectedUnitCreateModeSpec = computed(() => {
    return resolveUnitCreateMode(unitCreateMode.value, unitCreateMilitaryLevel.value);
  });

  const selectedUnitCreateCurrentCount = computed(() => {
    const mode = selectedUnitCreateModeSpec.value?.mode;
    return mode === unitCreateModeKeys.NORMAL ? heroUnitCount.value : armyUnitCount.value;
  });

  const selectedUnitCreateCap = computed(() => {
    const mode = selectedUnitCreateModeSpec.value?.mode;
    return mode === unitCreateModeKeys.NORMAL ? heroUnitCap.value : armyUnitCap.value;
  });

  const selectedUnitCreateRemaining = computed(() => {
    const mode = selectedUnitCreateModeSpec.value?.mode;
    if (mode === unitCreateModeKeys.NORMAL) return heroCreateAvailable.value;
    return Math.max(0, selectedUnitCreateCap.value - selectedUnitCreateCurrentCount.value);
  });

  const canCreateSelectedUnitType = computed(() => {
    return canOpenUnitCreate.value && selectedUnitCreateRemaining.value > 0;
  });

  const unitCreateSetupProgressText = computed(() => {
    const spec = selectedUnitCreateModeSpec.value;
    const popText = spec.populationCost > 0
      ? `人口${spec.populationCost}人消費`
      : "人口消費なし";
    const unlockText = spec.mode === unitCreateModeKeys.NORMAL
      ? ` / 解放${heroCreateUnlocked.value}`
      : "";
    const rarityLabel = formatEquipmentRarityLabel(unitCreateRarity.value);
    return `作成種別: ${spec.label} / 軍事Lv${unitCreateMilitaryLevel.value} / HPx${spec.hpMultiplier} / 攻撃${spec.attackCount}回 / ${popText}${unlockText} / 装備レア度:${rarityLabel}`;
  });

  const unitCreateRarityOptions = computed(() => {
    return equipmentRarityKeys.map(key => ({
      key,
      label: formatEquipmentRarityLabel(key)
    }));
  });

  const selectedUnitCreateRarityLabel = computed(() => {
    return formatEquipmentRarityLabel(unitCreateRarity.value);
  });

  const unitCreateAllowedRaces = computed(() => {
    const set = new Set();
    const villageRaceMap = villageState.value?.populationByRace;
    if (villageRaceMap && typeof villageRaceMap === "object") {
      for (const [race, countRaw] of Object.entries(villageRaceMap)) {
        const raceName = nonEmptyText(race);
        const count = Math.max(0, Math.floor(toSafeNumber(countRaw, 0)));
        if (!raceName || count <= 0) continue;
        set.add(raceName);
      }
    }
    for (const unit of (Array.isArray(unitList.value) ? unitList.value : [])) {
      const raceName = nonEmptyText(unit?.race);
      if (!raceName) continue;
      set.add(raceName);
    }
    return Array.from(set);
  });

  function resolveUnitCreateCapacityByMode(mode) {
    const key = nonEmptyText(mode) || unitCreateModeKeys.NORMAL;
    const useArmyCap = key !== unitCreateModeKeys.NORMAL;
    const current = useArmyCap ? armyUnitCount.value : heroUnitCount.value;
    const cap = useArmyCap ? armyUnitCap.value : heroUnitCap.value;
    const remainingRaw = Math.max(0, cap - current);
    const unlocked = useArmyCap ? null : heroCreateUnlocked.value;
    const remaining = useArmyCap
      ? remainingRaw
      : Math.max(0, Math.min(remainingRaw, Math.max(0, Math.floor(toSafeNumber(unlocked, 0)))));
    return {
      mode: key,
      current,
      cap,
      remainingRaw,
      unlocked,
      remaining,
      unitTypeLabel: useArmyCap ? "軍隊" : "ヒーロー"
    };
  }

  function resolveUnitCreateModeForCurrentCapacity(preferredMode = unitCreateMode.value) {
    const byLevel = resolveUnitCreateMode(preferredMode, unitCreateMilitaryLevel.value);
    const capState = resolveUnitCreateCapacityByMode(byLevel.mode);
    if (capState.remaining > 0) return byLevel;
    const fallback = unitCreateModeOptions.value.find(mode => mode.enabled && mode.remaining > 0);
    if (fallback?.mode) {
      return resolveUnitCreateMode(fallback.mode, unitCreateMilitaryLevel.value);
    }
    return byLevel;
  }

  function normalizeUnitCreateBatchCount() {
    const raw = Math.floor(toSafeNumber(unitCreateBatchCount.value, 1));
    const maxAllowed = Math.max(1, selectedUnitCreateRemaining.value);
    unitCreateBatchCount.value = Math.max(1, Math.min(maxAllowed, raw));
  }

  function openUnitCreateModal() {
    if (!props.gameSetupReady) {
      updateUnitInfoText("ユニット作成はゲーム開始後に可能です。");
      return;
    }
    if (!canCreateAnyUnit.value) {
      updateUnitInfoText(
        `ユニット作成不可: ヒーロー上限 ${heroUnitCount.value}/${heroUnitCap.value} (解放${heroCreateUnlocked.value}) / 軍隊上限 ${armyUnitCount.value}/${armyUnitCap.value} または村未配置`
      );
      return;
    }
    if (!canOpenUnitCreate.value) {
      updateUnitInfoText("ユニット作成には初期村の配置が必要です。");
      return;
    }
    kickOffBgm();
    audio.playSe("open");
    const allowedRaces = unitCreateAllowedRaces.value;
    if (!allowedRaces.length) {
      updateUnitInfoText("ユニット作成不可: 自陣営に所属する種族がありません。");
      return;
    }
    const resolvedMode = resolveUnitCreateModeForCurrentCapacity(unitCreateMode.value);
    unitCreateMode.value = resolvedMode.mode;
    const modeCap = resolveUnitCreateCapacityByMode(resolvedMode.mode);
    unitCreateBatchCount.value = Math.max(1, Math.min(unitCreateBatchCount.value, modeCap.remaining));
    const preferredRace = nonEmptyText(unitCreateRace.value);
    unitCreateRace.value = allowedRaces.includes(preferredRace)
      ? preferredRace
      : allowedRaces[0];
    unitCreateClass.value = nonEmptyText(props.selectedClass);
    ensureSelectedCreateRarity();
    showUnitCreateRaceModal.value = true;
  }

  function closeUnitCreateCountModal() {
    audio.playSe("cancel");
    showUnitCreateCountModal.value = false;
  }

  function confirmUnitCreateCount() {
    normalizeUnitCreateBatchCount();
    const allowedRaces = unitCreateAllowedRaces.value;
    if (!allowedRaces.length) {
      updateUnitInfoText("ユニット作成不可: 自陣営に所属する種族がありません。");
      showUnitCreateCountModal.value = false;
      return;
    }
    const resolvedMode = resolveUnitCreateModeForCurrentCapacity(unitCreateMode.value);
    unitCreateMode.value = resolvedMode.mode;
    showUnitCreateCountModal.value = false;
    showUnitCreateClassModal.value = true;
    audio.playSe("confirm");
  }

  function nudgeUnitCreateBatchCount(delta) {
    const step = Math.floor(toSafeNumber(delta, 0));
    if (!Number.isFinite(step) || step === 0) return;
    const current = Math.floor(toSafeNumber(unitCreateBatchCount.value, 1));
    unitCreateBatchCount.value = current + step;
    normalizeUnitCreateBatchCount();
  }

  function applyUnitCreateMode(mode) {
    const resolved = resolveUnitCreateModeForCurrentCapacity(mode);
    unitCreateMode.value = resolved.mode;
    normalizeUnitCreateBatchCount();
  }

  function closeUnitCreateRaceModal() {
    audio.playSe("cancel");
    showUnitCreateRaceModal.value = false;
  }

  function closeUnitCreateClassModal() {
    audio.playSe("cancel");
    showUnitCreateClassModal.value = false;
  }

  function backUnitCreateClassToRaceModal() {
    audio.playSe("cancel");
    showUnitCreateClassModal.value = false;
    showUnitCreateCountModal.value = true;
  }

  function closeUnitCreateRarityModal() {
    audio.playSe("cancel");
    showUnitCreateRarityModal.value = false;
  }

  function backUnitCreateRarityToClassModal() {
    audio.playSe("cancel");
    showUnitCreateRarityModal.value = false;
    showUnitCreateClassModal.value = true;
  }

  function applyUnitCreateRace(raceKey) {
    const key = nonEmptyText(raceKey);
    if (!key) return;
    if (!unitCreateAllowedRaces.value.includes(key)) {
      updateUnitInfoText("種族選択失敗: 自陣営に所属していない種族は選べません。");
      return;
    }
    unitCreateRace.value = key;
    unitCreateClass.value = "";
    showUnitCreateRaceModal.value = false;
    showUnitCreateCountModal.value = true;
    audio.playSe("change");
  }

  function applyUnitCreateClass(payload) {
    const className = nonEmptyText(payload?.className);
    if (!className) return;
    unitCreateClass.value = className;
    showUnitCreateClassModal.value = false;
    showUnitCreateRarityModal.value = true;
    audio.playSe("confirm");
  }

  function selectUnitCreateRarity(rarityKey) {
    const next = normalizeEquipmentRarity(rarityKey, "common");
    if (!next) return;
    if (unitCreateRarity.value === next) return;
    unitCreateRarity.value = next;
    audio.playSe("change");
  }

  function applyUnitCreateRarity(rarityKey = "") {
    const explicitKey = nonEmptyText(rarityKey);
    if (explicitKey) {
      unitCreateRarity.value = normalizeEquipmentRarity(explicitKey, "common");
    } else {
      ensureSelectedCreateRarity();
    }
    const result = createUnitFromSelection();
    if (result?.ok) {
      showUnitCreateRarityModal.value = false;
    }
  }

  function createUnitFromSelection() {
    if (!canCreateAnyUnit.value) {
      updateUnitInfoText(
        `ユニット作成不可: ヒーロー上限 ${heroUnitCount.value}/${heroUnitCap.value} (解放${heroCreateUnlocked.value}) / 軍隊上限 ${armyUnitCount.value}/${armyUnitCap.value} または村未配置`
      );
      return;
    }
    if (!canOpenUnitCreate.value) {
      updateUnitInfoText("ユニット作成には初期村の配置が必要です。");
      return;
    }
    normalizeUnitCreateBatchCount();
    const raceName = nonEmptyText(unitCreateRace.value) || nonEmptyText(props.selectedRace) || "只人";
    if (!unitCreateAllowedRaces.value.includes(raceName)) {
      updateUnitInfoText(`ユニット作成失敗: 種族 ${raceName} は自陣営に所属していません。`);
      return;
    }
    const className = nonEmptyText(unitCreateClass.value) || nonEmptyText(props.selectedClass);
    const classRow = findClassRowByName(className) || randomPick(initialJobClassRows.value, null);
    if (!classRow) {
      updateUnitInfoText("ユニット作成失敗: クラスデータが見つかりません。");
      return;
    }
    if (!isInitialClassRow(classRow)) {
      updateUnitInfoText("ユニット作成失敗: 上位クラスは作成時に選択できません。");
      return;
    }
    const raceRow = findClassRowByName(resolveRaceBaseClassName(raceName)) || classRows.value[0] || null;
    if (!raceRow) {
      updateUnitInfoText("ユニット作成失敗: 種族データが見つかりません。");
      return;
    }
    const village = ensureVillageStateShape(villageState.value, raceName);
    if (!village || !village.placed) {
      updateUnitInfoText("ユニット作成失敗: 村が未配置です。");
      return;
    }
    const modeSpec = resolveUnitCreateModeForCurrentCapacity(unitCreateMode.value);
    unitCreateMode.value = modeSpec.mode;
    const selectedRarity = normalizeEquipmentRarity(unitCreateRarity.value, "common");
    const requestedCount = Math.max(1, Math.floor(toSafeNumber(unitCreateBatchCount.value, 1)));
    const modeCap = resolveUnitCreateCapacityByMode(modeSpec.mode);
    const availableSlots = Math.max(0, modeCap.remaining);
    if (availableSlots <= 0) {
      if (modeSpec.mode === unitCreateModeKeys.NORMAL && Math.max(0, Math.floor(toSafeNumber(modeCap.unlocked, 0))) <= 0) {
        updateUnitInfoText("ユニット作成失敗: ヒーローは未解放です（英雄の誕生を待機中）。");
        return;
      }
      updateUnitInfoText(`ユニット作成失敗: ${modeCap.unitTypeLabel}上限 ${modeCap.current}/${modeCap.cap}`);
      return;
    }
    const maxByPopulation = resolveMaxCreatableByPopulation(village, raceName, modeSpec.populationCost);
    if (maxByPopulation <= 0) {
      updateUnitInfoText(
        `ユニット作成失敗: 人口不足 (${raceName} ${Math.floor(toSafeNumber(village.populationByRace?.[raceName], 0))}人 / ${modeSpec.label}は1体${modeSpec.populationCost}人消費)`
      );
      return;
    }
    const createCount = Math.min(requestedCount, availableSlots, maxByPopulation);
    const cappedByPopulation = requestedCount > createCount;
    const totalPopulationConsume = createCount * Math.max(0, Math.floor(toSafeNumber(modeSpec.populationCost, 0)));
    const cost = buildUnitCreationCost(createCount);
    if (!canAffordUnitCreation(village, cost)) {
      updateUnitInfoText(`ユニット作成失敗: 資源不足 (必要: 食料 ${formatFoodResourceBag(cost.food)} / 資材 ${formatMaterialResourceBag(cost.material)})`);
      return;
    }
    const resourceUpdatedVillage = applyUnitCreationCost(village, cost);
    if (!resourceUpdatedVillage) {
      updateUnitInfoText("ユニット作成失敗: 村データ更新に失敗しました。");
      return;
    }
    const populationConsumeResult = consumeVillagePopulationByRace(
      resourceUpdatedVillage,
      raceName,
      totalPopulationConsume
    );
    if (!populationConsumeResult.ok) {
      updateUnitInfoText(`ユニット作成失敗: ${populationConsumeResult.reason || "人口消費に失敗しました。"}`);
      return;
    }
    const nextVillage = ensureVillageStateShape(populationConsumeResult.village, raceName);
    if (!nextVillage) {
      updateUnitInfoText("ユニット作成失敗: 人口反映後の村データ更新に失敗しました。");
      return;
    }

    const createdUnits = [];
    const namingUnits = [...unitList.value];
    let gearVillage = nextVillage;
    const gearWarnings = [];
    if (modeSpec.mode === unitCreateModeKeys.NORMAL) {
      const unlockBefore = resolveHeroCreateUnlockedCount(gearVillage);
      if (unlockBefore < createCount) {
        updateUnitInfoText(`ユニット作成失敗: ヒーロー解放枠不足 (${unlockBefore}/${createCount})`);
        return;
      }
      gearVillage = {
        ...gearVillage,
        heroBirthUnlock: Math.max(0, unlockBefore - createCount)
      };
    }
    let gearFromInventoryTotal = 0;
    let gearGeneratedTotal = 0;
    for (let i = 0; i < createCount; i += 1) {
      const unit = createUnitRecord({
        raceRow,
        classRow,
        name: buildAutoUnitName(raceName, className, namingUnits),
        raceLabel: raceName,
        isSovereign: false,
        isNamed: false,
        unitType: modeSpec.unitTypeLabel || (modeSpec.mode === unitCreateModeKeys.NORMAL ? "ヒーロー" : "軍隊"),
        fixedLevel: heroInitialLevel,
        militaryProfile: modeSpec,
        equipmentRarity: selectedRarity
      });
      const equipped = applyAutoEquipForCreatedUnit(unit, raceRow, classRow, gearVillage, {
        strict: modeSpec.mode !== unitCreateModeKeys.NORMAL,
        preferCraft: modeSpec.mode !== unitCreateModeKeys.NORMAL
      });
      if (!equipped?.ok) {
        updateUnitInfoText(`ユニット作成失敗: ${equipped?.reason || "初期装備の生成に失敗しました。"}`);
        audio.playSe("cancel");
        return { ok: false, reason: equipped?.reason || "初期装備の生成に失敗しました。" };
      }
      const nextUnit = equipped?.unit || unit;
      gearVillage = equipped?.village || gearVillage;
      gearFromInventoryTotal += Math.max(0, Math.floor(toSafeNumber(equipped?.fromInventory, 0)));
      gearGeneratedTotal += Math.max(0, Math.floor(toSafeNumber(equipped?.generated, 0)));
      if (Array.isArray(equipped?.warningMessages) && equipped.warningMessages.length) {
        gearWarnings.push(...equipped.warningMessages);
      }
      nextUnit.x = village.x;
      nextUnit.y = village.y;
      nextUnit.moveRemaining = Math.max(0, Math.floor(toSafeNumber(nextUnit.moveRange, 0)));
      createdUnits.push(nextUnit);
      namingUnits.push(nextUnit);
    }

    unitList.value = [...unitList.value, ...createdUnits];
    villageState.value = gearVillage;
    selectedUnitId.value = createdUnits[0]?.id || selectedUnitId.value;
    updateVillageInfoText();
    const firstName = createdUnits[0]?.name || "-";
    const lastName = createdUnits[createdUnits.length - 1]?.name || "-";
    updateUnitInfoText(
      `ユニット作成: ${createdUnits.length}体 (${raceName}/${className}/${modeSpec.label})`
      + `${cappedByPopulation ? ` / 上限により ${requestedCount} -> ${createCount}` : ""}`
      + `${totalPopulationConsume > 0 ? ` / 人口-${totalPopulationConsume}` : ""}`
      + `${modeSpec.mode === unitCreateModeKeys.NORMAL ? ` / 解放残 ${resolveHeroCreateUnlockedCount(gearVillage)}` : ""}`
      + ` / 装備 在庫${gearFromInventoryTotal} 生成${gearGeneratedTotal}`
      + `${gearWarnings.length ? ` / 装備警告${gearWarnings.length}件` : ""}`
      + ` / ${firstName}${createdUnits.length > 1 ? ` ... ${lastName}` : ""} / 村座標 (${village.x}, ${village.y})`
    );
    pushNationLog(
      `ユニット作成: ${createdUnits.length}体 (${raceName}/${className}/${modeSpec.label})`
      + `${cappedByPopulation ? ` [上限補正 ${requestedCount}->${createCount}]` : ""}`
      + `${totalPopulationConsume > 0 ? ` / 人口消費 ${raceName}-${totalPopulationConsume}` : ""}`
      + `${modeSpec.mode === unitCreateModeKeys.NORMAL ? ` / 解放消費 ${createCount} (残${resolveHeroCreateUnlockedCount(gearVillage)})` : ""}`
      + ` / 装備 在庫${gearFromInventoryTotal} 生成${gearGeneratedTotal}`
      + `${gearWarnings.length ? ` / 装備警告${gearWarnings.length}件` : ""}`
      + ` / ${firstName}${createdUnits.length > 1 ? `〜${lastName}` : ""}`
      + ` / コスト 食料 ${formatFoodResourceBag(cost.food)} / 資材 ${formatMaterialResourceBag(cost.material)}`
      + ` / ヒーロー ${heroUnitCount.value}/${heroUnitCap.value}`
      + ` / 軍隊 ${armyUnitCount.value}/${armyUnitCap.value}`
    );
    if (gearWarnings.length) {
      pushNationLog(`初期装備警告: ${gearWarnings.slice(0, 3).join(" / ")}${gearWarnings.length > 3 ? " / ..." : ""}`);
    }
    emitCharacterStateChange();
    audio.playSe("confirm");
    renderMapWithPhaser();
    return { ok: true, count: createdUnits.length };
  }

  function resetUnitCreateState() {
    unitCreateBatchCount.value = 1;
    unitCreateMode.value = unitCreateModeKeys.NORMAL;
    unitCreateRace.value = "";
    unitCreateClass.value = "";
    unitCreateRarity.value = normalizeEquipmentRarity("common", "common");
    showUnitCreateCountModal.value = false;
    showUnitCreateRaceModal.value = false;
    showUnitCreateClassModal.value = false;
    showUnitCreateRarityModal.value = false;
  }

  return {
    canOpenUnitCreate,
    heroUnitCount,
    armyUnitCount,
    heroUnitCap,
    armyUnitCap,
    heroCreateRemaining,
    heroCreateUnlocked,
    heroCreateAvailable,
    armyCreateRemaining,
    canCreateAnyUnit,
    unitCreateMilitaryLevel,
    unitCreateModeOptions,
    selectedUnitCreateModeSpec,
    selectedUnitCreateCurrentCount,
    selectedUnitCreateCap,
    selectedUnitCreateRemaining,
    canCreateSelectedUnitType,
    unitCreateSetupProgressText,
    unitCreateRarityOptions,
    selectedUnitCreateRarityLabel,
    unitCreateAllowedRaces,
    resolveUnitCreateCapacityByMode,
    resolveUnitCreateModeForCurrentCapacity,
    openUnitCreateModal,
    closeUnitCreateCountModal,
    confirmUnitCreateCount,
    nudgeUnitCreateBatchCount,
    applyUnitCreateMode,
    closeUnitCreateRaceModal,
    closeUnitCreateClassModal,
    backUnitCreateClassToRaceModal,
    closeUnitCreateRarityModal,
    backUnitCreateRarityToClassModal,
    applyUnitCreateRace,
    applyUnitCreateClass,
    selectUnitCreateRarity,
    applyUnitCreateRarity,
    normalizeUnitCreateBatchCount,
    createUnitFromSelection,
    resetUnitCreateState
  };
}
