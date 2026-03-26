import { computed } from "vue";

const FACILITY_REQUIREMENT_FIELD_TO_ABILITY_KEY = {
  鍛冶Lv: "鍛冶場",
  魔法Lv: "魔法",
  信仰Lv: "信仰",
  軍事Lv: "軍事",
  経済Lv: "経済"
};
const FACILITY_REQUIREMENT_FIELDS = Object.keys(FACILITY_REQUIREMENT_FIELD_TO_ABILITY_KEY);
const SETTLEMENT_STAGE_FACILITY_NAMES = ["村", "町", "都市", "大都市"];
const RESEARCH_CATEGORY_DISPLAY_NAME_MAP = {
  鍛冶Lv: "鍛冶",
  魔法Lv: "魔法",
  信仰Lv: "信仰",
  軍事Lv: "軍事",
  経済Lv: "経済"
};
const RESEARCH_CATEGORY_ICON_NAME_MAP = {
  鍛冶Lv: "鍛冶",
  魔法Lv: "魔法",
  信仰Lv: "信仰",
  軍事Lv: "兵士",
  経済Lv: "金"
};

function resolveResearchCategoryDisplayName(categoryKey, nonEmptyText) {
  const key = nonEmptyText(categoryKey);
  return RESEARCH_CATEGORY_DISPLAY_NAME_MAP[key] || key.replace(/Lv$/u, "") || key;
}

export function useVillageBuildPanel(options = {}) {
  const facilityRows = options.facilityRows;
  const villageState = options.villageState;
  const showVillageBuildModal = options.showVillageBuildModal;
  const selectedVillageBuildingKey = options.selectedVillageBuildingKey;

  const selectedRace = typeof options.resolveSelectedRace === "function"
    ? options.resolveSelectedRace
    : (() => "");
  const nonEmptyText = typeof options.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const toSafeNumber = typeof options.toSafeNumber === "function"
    ? options.toSafeNumber
    : ((value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    });
  const roundTo1 = typeof options.roundTo1 === "function"
    ? options.roundTo1
    : value => Math.round(toSafeNumber(value, 0) * 10) / 10;
  const resolveVillageScaleLabel = typeof options.resolveVillageScaleLabel === "function"
    ? options.resolveVillageScaleLabel
    : (() => "村");
  const resolveResearchCurrentLevel = typeof options.resolveResearchCurrentLevel === "function"
    ? options.resolveResearchCurrentLevel
    : (() => 0);
  const normalizeFacilityNameToken = typeof options.normalizeFacilityNameToken === "function"
    ? options.normalizeFacilityNameToken
    : value => nonEmptyText(value).toLowerCase();
  const resolveAvailableIconName = typeof options.resolveAvailableIconName === "function"
    ? options.resolveAvailableIconName
    : ((...candidates) => nonEmptyText(candidates[0]));
  const getIconSrcByName = typeof options.getIconSrcByName === "function"
    ? options.getIconSrcByName
    : (() => "");
  const ensureVillageStateShape = typeof options.ensureVillageStateShape === "function"
    ? options.ensureVillageStateShape
    : (value => value);
  const normalizeMaterialStockBag = typeof options.normalizeMaterialStockBag === "function"
    ? options.normalizeMaterialStockBag
    : (value => ({ ...(value || {}) }));
  const normalizeResourceBag = typeof options.normalizeResourceBag === "function"
    ? options.normalizeResourceBag
    : (value => ({ ...(value || {}) }));
  const buildEmptyResourceBag = typeof options.buildEmptyResourceBag === "function"
    ? options.buildEmptyResourceBag
    : ((keys = []) => Object.fromEntries(keys.map(key => [key, 0])));
  const formatMaterialCompactNumber = typeof options.formatMaterialCompactNumber === "function"
    ? options.formatMaterialCompactNumber
    : value => String(value ?? 0);
  const formatMaterialRawPositiveResourceBag = typeof options.formatMaterialRawPositiveResourceBag === "function"
    ? options.formatMaterialRawPositiveResourceBag
    : (() => "なし");
  const formatFoodPositiveResourceBag = typeof options.formatFoodPositiveResourceBag === "function"
    ? options.formatFoodPositiveResourceBag
    : (() => "なし");
  const formatMaterialPositiveResourceBag = typeof options.formatMaterialPositiveResourceBag === "function"
    ? options.formatMaterialPositiveResourceBag
    : (() => "なし");
  const updateUnitInfoText = typeof options.updateUnitInfoText === "function"
    ? options.updateUnitInfoText
    : (() => {});
  const updateVillageInfoText = typeof options.updateVillageInfoText === "function"
    ? options.updateVillageInfoText
    : (() => {});
  const pushNationLog = typeof options.pushNationLog === "function"
    ? options.pushNationLog
    : (() => {});
  const emitCharacterStateChange = typeof options.emitCharacterStateChange === "function"
    ? options.emitCharacterStateChange
    : (() => {});
  const kickOffBgm = typeof options.kickOffBgm === "function"
    ? options.kickOffBgm
    : (() => {});
  const audio = options.audio && typeof options.audio.playSe === "function"
    ? options.audio
    : { playSe: () => {} };
  const materialResourceKeys = Array.isArray(options.materialResourceKeys)
    ? options.materialResourceKeys
    : [];
  const researchCategoryOrder = Array.isArray(options.researchCategoryOrder)
    ? options.researchCategoryOrder
    : [];
  const cityAbilityDefinedCap = Math.max(1, Math.floor(toSafeNumber(options.cityAbilityDefinedCap, 1)));
  const tileFacilityMapKey = nonEmptyText(options.tileFacilityMapKey) || "tileFacilityMap";
  const settlementModeKey = nonEmptyText(options.settlementModeKey) || "settlement";
  const resourceModeKey = nonEmptyText(options.resourceModeKey) || "resource";
  const resolveSelectedBuildTileKey = typeof options.resolveSelectedBuildTileKey === "function"
    ? options.resolveSelectedBuildTileKey
    : (() => "");
  const resolveSelectedBuildTileMode = typeof options.resolveSelectedBuildTileMode === "function"
    ? options.resolveSelectedBuildTileMode
    : (() => "");
  const canOpenVillageBuildAtTile = typeof options.canOpenVillageBuildAtTile === "function"
    ? options.canOpenVillageBuildAtTile
    : (() => false);

  function normalizeVillageTileFacilityMap(rawMap) {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const out = {};
    for (const [rawTileKey, rawList] of Object.entries(source)) {
      const tileKey = nonEmptyText(rawTileKey);
      if (!tileKey.includes(",")) continue;
      const list = normalizeVillageBuildings(rawList);
      if (!list.length) continue;
      out[tileKey] = list;
    }
    return out;
  }

  function resolveCurrentBuildTarget() {
    const tileKey = nonEmptyText(resolveSelectedBuildTileKey());
    const tileMode = nonEmptyText(resolveSelectedBuildTileMode());
    const buildable = !!canOpenVillageBuildAtTile();
    return {
      tileKey,
      tileMode,
      buildable
    };
  }

  const canOpenVillageBuild = computed(() => {
    const village = villageState.value;
    if (!(village?.placed && Number.isFinite(village?.x) && Number.isFinite(village?.y))) return false;
    const target = resolveCurrentBuildTarget();
    return !!(target.buildable && target.tileKey.includes(","));
  });

  function resolveFacilityBuildingIconSrc(definition) {
    const def = definition && typeof definition === "object" ? definition : {};
    const name = nonEmptyText(def?.name || def?.施設名);
    const terrain = nonEmptyText(def?.conditionTerrain || def?.条件地形);
    const requirementKeys = (Array.isArray(def?.requirements) ? def.requirements : [])
      .map(row => nonEmptyText(row?.field))
      .filter(Boolean);
    const candidates = [
      name,
      name.replace(/場$/u, ""),
      name.replace(/塔$/u, ""),
      name.replace(/院$/u, ""),
      name.replace(/堂$/u, ""),
      name.replace(/市場$/u, "金"),
      name.replace(/鍛冶場$/u, "鍛冶"),
      name.replace(/教会|修道院|神殿|大聖堂/u, "信仰"),
      name.replace(/魔導塔|魔術工房|結界装置/u, "魔法"),
      name.replace(/兵舎|射撃場|防壁|城壁|見張り塔|司令部/u, "兵士"),
      name.replace(/農場/u, "穀物"),
      name.replace(/伐採場/u, "木材"),
      name.replace(/採石場/u, "石材"),
      name.replace(/鉱山/u, "鉄"),
      name.replace(/市場|倉庫|ギルド/u, "金"),
      name.replace(/港/u, "海人"),
      name.replace(/公衆浴場|温泉/u, "回復"),
      terrain,
      ...requirementKeys.map(key => RESEARCH_CATEGORY_ICON_NAME_MAP[key] || resolveResearchCategoryDisplayName(key, nonEmptyText)),
      "城"
    ]
      .map(value => nonEmptyText(value))
      .filter(Boolean);
    return getIconSrcByName(resolveAvailableIconName(...candidates), "城");
  }

  const facilityBuildingDefs = computed(() => {
    const rows = Array.isArray(facilityRows?.value) ? facilityRows.value : [];
    return rows.map((row, index) => {
      const name = nonEmptyText(row?.施設名) || `施設${index + 1}`;
      const conditionTerrain = nonEmptyText(row?.条件地形) || "なし";
      const isSettlementStage = SETTLEMENT_STAGE_FACILITY_NAMES.includes(name);
      const cost = buildEmptyResourceBag(materialResourceKeys);
      for (const key of materialResourceKeys) {
        cost[key] = Math.max(0, toSafeNumber(row?.[key], 0));
      }
      const slotValueRaw = Math.max(0, Math.floor(toSafeNumber(row?.建築時間, 0)));
      const requirements = FACILITY_REQUIREMENT_FIELDS
        .map(field => {
          const level = Math.max(0, Math.floor(toSafeNumber(row?.[field], 0)));
          if (level <= 0) return null;
          return {
            field,
            label: field,
            abilityKey: FACILITY_REQUIREMENT_FIELD_TO_ABILITY_KEY[field],
            requiredLevel: level
          };
        })
        .filter(Boolean);
      return {
        key: `${normalizeFacilityNameToken(name) || "facility"}__${index}`,
        name,
        description: nonEmptyText(row?.詳細) || "-",
        conditionTerrain,
        cost,
        requirements,
        isSettlementStage,
        buildSlotValue: Math.max(1, slotValueRaw || 1),
        iconSrc: resolveFacilityBuildingIconSrc({ name, conditionTerrain, requirements, row })
      };
    });
  });

  function normalizeVillageBuildings(input) {
    const defs = facilityBuildingDefs.value;
    const allowed = new Set(defs.map(def => def.key));
    const byNameToken = new Map();
    for (const def of defs) {
      const token = normalizeFacilityNameToken(def?.name);
      if (!token || byNameToken.has(token)) continue;
      byNameToken.set(token, def.key);
    }
    const out = [];
    const pushed = new Set();
    const source = Array.isArray(input) ? input : [];
    for (const raw of source) {
      const key = nonEmptyText(raw);
      if (!key) continue;
      const normalizedKey = allowed.has(key)
        ? key
        : (byNameToken.get(normalizeFacilityNameToken(key)) || "");
      if (!normalizedKey || pushed.has(normalizedKey)) continue;
      pushed.add(normalizedKey);
      out.push(normalizedKey);
    }
    return out;
  }

  function findVillageBuildingDefinition(key) {
    const normalized = nonEmptyText(key);
    if (!normalized) return null;
    return facilityBuildingDefs.value.find(def => def.key === normalized || def.name === normalized) || null;
  }

  function formatVillageBuildingList(buildings) {
    const keys = normalizeVillageBuildings(buildings);
    if (!keys.length) return "なし";
    const names = keys
      .map(key => findVillageBuildingDefinition(key)?.name || "")
      .filter(Boolean);
    return names.length ? names.join(", ") : "なし";
  }

  function collectVillageBuildingIncome(village) {
    const result = {
      food: buildEmptyResourceBag(options.foodResourceKeys || []),
      material: buildEmptyResourceBag(materialResourceKeys),
      count: 0
    };
    const keys = normalizeVillageBuildings(village?.buildings);
    for (const key of keys) {
      if (!key) continue;
      result.count += 1;
    }
    return result;
  }

  function formatVillageBuildingBonus(bonus) {
    const foodRaw = formatFoodPositiveResourceBag(bonus?.food);
    const materialRaw = formatMaterialPositiveResourceBag(bonus?.material);
    if (foodRaw === "なし" && materialRaw === "なし") return "なし";
    const foodText = foodRaw === "なし" ? "0" : foodRaw;
    const materialText = materialRaw === "なし" ? "0" : materialRaw;
    return `食料 +${foodText} / 資材 +${materialText}`;
  }

  function resolveVillageBuildCapacityDefinition(village) {
    const defs = facilityBuildingDefs.value.filter(def => def.isSettlementStage);
    if (!defs.length) return null;
    const scaleLabel = nonEmptyText(resolveVillageScaleLabel(village));
    return defs.find(def => def.name === scaleLabel)
      || defs.find(def => def.name === "大都市")
      || defs[defs.length - 1]
      || null;
  }

  function resolveVillageBuildCapacity(village, target = resolveCurrentBuildTarget()) {
    const mode = nonEmptyText(target?.tileMode);
    if (mode === resourceModeKey) return 1;
    const def = resolveVillageBuildCapacityDefinition(village);
    return Math.max(1, Math.floor(toSafeNumber(def?.buildSlotValue, 1)));
  }

  function resolveVillageBuildingSlotCost(definition) {
    return Math.max(1, Math.floor(toSafeNumber(definition?.buildSlotValue, 1)));
  }

  function resolveVillageBuildUsedSlots(village, target = resolveCurrentBuildTarget()) {
    const tileKey = nonEmptyText(target?.tileKey);
    if (!tileKey.includes(",")) return 0;
    const tileMap = normalizeVillageTileFacilityMap(village?.[tileFacilityMapKey]);
    const keys = Array.isArray(tileMap[tileKey]) ? tileMap[tileKey] : [];
    return keys.reduce((sum, key) => {
      const def = findVillageBuildingDefinition(key);
      if (!def || def.isSettlementStage) return sum;
      return sum + resolveVillageBuildingSlotCost(def);
    }, 0);
  }

  function resolveVillageBuildingStatusText(availability) {
    const source = availability && typeof availability === "object" ? availability : {};
    const states = [];
    if (source.hasResearch === false) states.push("研究不足");
    if (source.canAfford === false) states.push("素材不足");
    if (source.hasLand === false) states.push("土地不足");
    return states.length ? states.join("・") : "建設可能";
  }

  function resolveVillageBuildingMaterialStatus(village, definition) {
    if (!definition) {
      return {
        canAfford: false,
        materialBag: buildEmptyResourceBag(materialResourceKeys),
        costBag: buildEmptyResourceBag(materialResourceKeys),
        statusEntries: [],
        shortages: [],
        statusText: "なし",
        shortageText: ""
      };
    }
    const materialBag = normalizeMaterialStockBag(village?.materialStockByType);
    const costBag = normalizeResourceBag(definition.cost, materialResourceKeys);
    const statusEntries = [];
    const shortages = [];
    for (const key of materialResourceKeys) {
      const need = roundTo1(Math.max(0, toSafeNumber(costBag[key], 0)));
      if (!(need > 0)) continue;
      const have = roundTo1(Math.max(0, toSafeNumber(materialBag[key], 0)));
      const entryText = `${key}${formatMaterialCompactNumber(have)}/${formatMaterialCompactNumber(need)}`;
      statusEntries.push(entryText);
      if (have < need) shortages.push(entryText);
    }
    return {
      canAfford: shortages.length === 0,
      materialBag,
      costBag,
      statusEntries,
      shortages,
      statusText: statusEntries.join(" / ") || "不要",
      shortageText: shortages.join(" / ")
    };
  }

  function canAffordVillageBuilding(village, definition) {
    return resolveVillageBuildingMaterialStatus(village, definition).canAfford;
  }

  function resolveVillageBuildingAvailability(village, definition, target = resolveCurrentBuildTarget()) {
    const def = definition && typeof definition === "object" ? definition : null;
    if (!def) {
      return { selectable: false, canAfford: false, hasResearch: false, hasLand: false, reasons: ["施設定義不正"], statusText: "条件不正" };
    }
    const tileKey = nonEmptyText(target?.tileKey);
    if (!tileKey.includes(",")) {
      return {
        selectable: false,
        canAfford: false,
        hasResearch: false,
        hasLand: false,
        reasons: ["建設対象マスを選択してください"],
        statusText: "建設不可"
      };
    }
    if (!target?.buildable) {
      return {
        selectable: false,
        canAfford: false,
        hasResearch: false,
        hasLand: false,
        reasons: ["自陣営の居住地/資源化タイルのみ建設できます"],
        statusText: "建設不可"
      };
    }
    const reasons = [];
    const requirements = Array.isArray(def.requirements) ? def.requirements : [];
    let hasResearch = true;
    for (const requirement of requirements) {
      const label = nonEmptyText(requirement?.label) || nonEmptyText(requirement?.abilityKey);
      const requiredLevel = Math.max(0, Math.floor(toSafeNumber(requirement?.requiredLevel, 0)));
      const currentLevel = resolveResearchCurrentLevel(label, cityAbilityDefinedCap);
      if (requiredLevel > currentLevel) {
        hasResearch = false;
        reasons.push(`${resolveResearchCategoryDisplayName(label, nonEmptyText)}Lv ${currentLevel}/${requiredLevel}`);
      }
    }
    const slotCost = resolveVillageBuildingSlotCost(def);
    const remainingSlots = Math.max(0, resolveVillageBuildCapacity(village, target) - resolveVillageBuildUsedSlots(village, target));
    const hasLand = remainingSlots >= slotCost;
    if (!hasLand) {
      reasons.push(`土地 ${remainingSlots}/${slotCost}`);
    }
    const materialStatus = resolveVillageBuildingMaterialStatus(village, def);
    const canAfford = materialStatus.canAfford;
    if (!canAfford) {
      reasons.push(`資材不足: ${materialStatus.shortageText || formatMaterialRawPositiveResourceBag(def.cost)}`);
    }
    const statusText = resolveVillageBuildingStatusText({ hasResearch, canAfford, hasLand });
    return {
      selectable: hasResearch && canAfford && hasLand,
      canAfford,
      hasResearch,
      hasLand,
      slotCost,
      remainingSlots,
      tileKey,
      materialStatus,
      reasons,
      statusText
    };
  }

  function applyVillageBuildingCost(village, definition, target = resolveCurrentBuildTarget()) {
    const nextVillage = ensureVillageStateShape(village, selectedRace());
    if (!nextVillage || !definition) return null;
    const tileKey = nonEmptyText(target?.tileKey);
    if (!tileKey.includes(",")) return null;
    const nextMaterial = normalizeMaterialStockBag(nextVillage.materialStockByType);
    const costBag = normalizeResourceBag(definition.cost, materialResourceKeys);
    for (const key of materialResourceKeys) {
      nextMaterial[key] = roundTo1(Math.max(0, nextMaterial[key] - costBag[key]));
    }
    const tileMap = normalizeVillageTileFacilityMap(nextVillage?.[tileFacilityMapKey]);
    const tileFacilities = normalizeVillageBuildings([...(tileMap[tileKey] || []), definition.key]);
    tileMap[tileKey] = tileFacilities;
    const allFacilityKeys = Object.values(tileMap).flatMap((list) => (Array.isArray(list) ? list : []));
    const existingBuildings = normalizeVillageBuildings(nextVillage.buildings || []);
    const stageKeys = existingBuildings.filter((key) => {
      const def = findVillageBuildingDefinition(key);
      return !!def?.isSettlementStage;
    });
    const nextBuildings = normalizeVillageBuildings([...stageKeys, ...allFacilityKeys]);
    return ensureVillageStateShape({
      ...nextVillage,
      materialStockByType: nextMaterial,
      buildings: nextBuildings,
      [tileFacilityMapKey]: tileMap
    }, selectedRace());
  }

  const builtVillageBuildingSet = computed(() => {
    const target = resolveCurrentBuildTarget();
    const tileMap = normalizeVillageTileFacilityMap(villageState.value?.[tileFacilityMapKey]);
    return new Set(Array.isArray(tileMap[target.tileKey]) ? tileMap[target.tileKey] : []);
  });

  const villageBuildRows = computed(() => {
    const village = ensureVillageStateShape(villageState.value, selectedRace());
    const target = resolveCurrentBuildTarget();
    const built = builtVillageBuildingSet.value;
    return facilityBuildingDefs.value
      .filter(def => !built.has(def.key))
      .map(def => ({
        ...def,
        availability: resolveVillageBuildingAvailability(village, def, target)
      }));
  });

  const availableVillageBuildingDefs = computed(() => {
    return villageBuildRows.value.filter(def => !def.isSettlementStage);
  });

  const villageBuildResearchRows = computed(() => {
    return researchCategoryOrder.map(key => ({
      key,
      label: RESEARCH_CATEGORY_DISPLAY_NAME_MAP[key] || key.replace(/Lv$/u, ""),
      level: resolveResearchCurrentLevel(key, cityAbilityDefinedCap),
      iconSrc: getIconSrcByName(RESEARCH_CATEGORY_ICON_NAME_MAP[key] || key.replace(/Lv$/u, ""), "本")
    }));
  });

  const villageBuildCapacity = computed(() => {
    return resolveVillageBuildCapacity(villageState.value, resolveCurrentBuildTarget());
  });

  const villageBuildUsedSlots = computed(() => {
    return resolveVillageBuildUsedSlots(villageState.value, resolveCurrentBuildTarget());
  });

  const villageBuildRemainingSlots = computed(() => {
    return Math.max(0, villageBuildCapacity.value - villageBuildUsedSlots.value);
  });

  const selectedVillageBuildingDef = computed(() => {
    const selectedKey = nonEmptyText(selectedVillageBuildingKey.value);
    const available = availableVillageBuildingDefs.value;
    if (!available.length) return null;
    return available.find(def => def.key === selectedKey) || available[0];
  });

  const selectedVillageBuildingAvailability = computed(() => {
    const village = ensureVillageStateShape(villageState.value, selectedRace());
    const def = selectedVillageBuildingDef.value;
    if (!village || !def) return null;
    return resolveVillageBuildingAvailability(village, def, resolveCurrentBuildTarget());
  });

  const selectedVillageBuildingPreviewStyle = computed(() => {
    const src = nonEmptyText(selectedVillageBuildingDef.value?.iconSrc);
    return {
      backgroundImage: src
        ? `linear-gradient(180deg, rgba(14, 11, 8, 0.18), rgba(14, 11, 8, 0.88)), url("${src}")`
        : "linear-gradient(180deg, rgba(70, 51, 31, 0.72), rgba(19, 14, 10, 0.94))",
      backgroundSize: src ? "160px auto" : "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat"
    };
  });

  function syncSelectedVillageBuildingKey() {
    const available = availableVillageBuildingDefs.value;
    if (!available.length) {
      selectedVillageBuildingKey.value = "";
      return;
    }
    const current = nonEmptyText(selectedVillageBuildingKey.value);
    if (available.some(def => def.key === current)) return;
    selectedVillageBuildingKey.value = available[0].key;
  }

  function openVillageBuildModal() {
    if (!canOpenVillageBuild.value) {
      updateUnitInfoText("建設不可: 初期村を配置してください。");
      return;
    }
    syncSelectedVillageBuildingKey();
    kickOffBgm();
    audio.playSe("open");
    showVillageBuildModal.value = true;
  }

  function closeVillageBuildModal() {
    audio.playSe("cancel");
    showVillageBuildModal.value = false;
  }

  function applyVillageConstruction() {
    if (!canOpenVillageBuild.value) {
      updateUnitInfoText("建設失敗: 初期村を配置してください。");
      return;
    }
    const village = ensureVillageStateShape(villageState.value, selectedRace());
    if (!village) {
      updateUnitInfoText("建設失敗: 村データが不正です。");
      return;
    }
    syncSelectedVillageBuildingKey();
    const definition = selectedVillageBuildingDef.value;
    if (!definition) {
      updateUnitInfoText("建設失敗: 建設可能な施設がありません。");
      return;
    }
    const target = resolveCurrentBuildTarget();
    const availability = resolveVillageBuildingAvailability(village, definition, target);
    if (!availability.selectable) {
      updateUnitInfoText(`建設失敗: ${availability.reasons.join(" / ") || "条件未達"}`);
      return;
    }
    if (!canAffordVillageBuilding(village, definition)) {
      const materialStatus = resolveVillageBuildingMaterialStatus(village, definition);
      const costText = formatMaterialRawPositiveResourceBag(definition.cost);
      const shortageText = materialStatus.shortageText || costText;
      updateUnitInfoText(`建設失敗: 資材不足 (${shortageText} / 必要: ${costText})`);
      return;
    }
    const nextVillage = applyVillageBuildingCost(village, definition, target);
    if (!nextVillage) {
      updateUnitInfoText("建設失敗: 村データ更新に失敗しました。");
      return;
    }
    villageState.value = nextVillage;
    updateVillageInfoText();
    updateUnitInfoText(`建設完了: ${definition.name}`);
    pushNationLog(`建設完了: ${definition.name} / コスト ${formatMaterialRawPositiveResourceBag(definition.cost)}`);
    emitCharacterStateChange();
    audio.playSe("confirm");
    showVillageBuildModal.value = false;
  }

  function resetVillageBuildState() {
    selectedVillageBuildingKey.value = "";
    showVillageBuildModal.value = false;
  }

  return {
    canOpenVillageBuild,
    facilityBuildingDefs,
    villageBuildRows,
    availableVillageBuildingDefs,
    villageBuildResearchRows,
    villageBuildCapacity,
    villageBuildUsedSlots,
    villageBuildRemainingSlots,
    selectedVillageBuildingDef,
    selectedVillageBuildingAvailability,
    selectedVillageBuildingPreviewStyle,
    normalizeVillageBuildings,
    formatVillageBuildingList,
    collectVillageBuildingIncome,
    formatVillageBuildingBonus,
    syncSelectedVillageBuildingKey,
    openVillageBuildModal,
    closeVillageBuildModal,
    applyVillageConstruction,
    resetVillageBuildState
  };
}
