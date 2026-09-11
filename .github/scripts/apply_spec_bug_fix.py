from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding="utf-8-sig")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8", newline="\n")


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one literal match, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def sub_once(path, pattern, replacement, flags=0):
    text = read(path)
    repl = replacement if callable(replacement) else (lambda _match: replacement)
    next_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, found {count}: {pattern[:120]!r}")
    write(path, next_text)


char_path = "frontend/src/components/CharacterStatusModal.vue"
unit_core_path = "frontend/src/composables/unitCoreUtils.js"
phaser_path = "frontend/src/components/PhaserMapGeneratorPanel.vue"
build_path = "frontend/src/composables/useVillageBuildPanel.js"

# 1) Squad size: leader + up to 4 members = 5 total.
replace_once(char_path, 'const MAX_SQUAD_MEMBER_COUNT = 5;', 'const MAX_SQUAD_MEMBER_COUNT = 4;')
replace_once(
    unit_core_path,
    'const maxSquadMemberCount = Math.max(1, Math.floor(Number(options?.maxSquadMemberCount || 5)));',
    'const maxSquadMemberCount = Math.max(1, Math.floor(Number(options?.maxSquadMemberCount || 4)));'
)
replace_once(phaser_path, 'const MAX_SQUAD_MEMBER_COUNT = 5;', 'const MAX_SQUAD_MEMBER_COUNT = 4;')

# 2) Metropolis: 420+ population => named limit 10.
sub_once(
    char_path,
    r'''const villageScaleLabel = computed\(\(\) => \{\n  const pop = Number\(props\?\.village\?\.population \|\| 0\);\n  if \(pop >= 260\) return "都市";\n  if \(pop >= 160\) return "町";\n  return "村";\n\}\);\n\nconst namedLimit = computed\(\(\) => \{\n  if \(villageScaleLabel\.value === "都市"\) return 7;\n  if \(villageScaleLabel\.value === "町"\) return 4;\n  return 2;\n\}\);''',
    '''const villageScaleLabel = computed(() => {
  const pop = Number(props?.village?.population || 0);
  if (pop >= 420) return "大都市";
  if (pop >= 260) return "都市";
  if (pop >= 160) return "町";
  return "村";
});

const namedLimit = computed(() => {
  if (villageScaleLabel.value === "大都市") return 10;
  if (villageScaleLabel.value === "都市") return 7;
  if (villageScaleLabel.value === "町") return 4;
  return 2;
});'''
)

# 3) Facility terrain rules are evaluated against the selected map tile.
new_context = r'''function normalizeFacilityTerrainName(value) {
  const text = nonEmptyText(value);
  const aliases = {
    丘: "丘陵",
    山: "山岳",
    雪: "雪原",
    河: "河川",
    沼: "沼地",
    洞: "洞窟",
    渓谷: "峡谷"
  };
  return aliases[text] || text;
}

function resolveFacilityTerrainAt(data, xRaw, yRaw) {
  if (!data?.grid || !Number.isFinite(data?.w) || !Number.isFinite(data?.h)) return "";
  const w = Math.max(1, Math.floor(toSafeNumber(data.w, 1)));
  const h = Math.max(1, Math.floor(toSafeNumber(data.h, 1)));
  let x = Math.floor(toSafeNumber(xRaw, Number.NaN));
  let y = Math.floor(toSafeNumber(yRaw, Number.NaN));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
  if (resolveWorldWrapEnabled(data)) {
    x = normalizeWrappedCoord(x, w);
    y = normalizeWrappedCoord(y, h);
  } else if (x < 0 || y < 0 || x >= w || y >= h) {
    return "";
  }
  return normalizeFacilityTerrainName(data?.grid?.[y]?.[x]);
}

function resolveFacilityTerrainDistance(a, b, data) {
  if (!resolveWorldWrapEnabled(data)) return hexDistance(a, b);
  const w = Math.max(1, Math.floor(toSafeNumber(data?.w, 1)));
  const h = Math.max(1, Math.floor(toSafeNumber(data?.h, 1)));
  let best = Number.POSITIVE_INFINITY;
  for (const shiftX of [-w, 0, w]) {
    for (const shiftY of [-h, 0, h]) {
      best = Math.min(best, hexDistance(a, { x: b.x + shiftX, y: b.y + shiftY }));
    }
  }
  return best;
}

function hasFacilityTerrainWithinRange(terrainRaw, rangeRaw, xRaw, yRaw, options = {}) {
  const data = currentData.value;
  if (!data?.grid || !Number.isFinite(data?.w) || !Number.isFinite(data?.h)) return false;
  const terrain = normalizeFacilityTerrainName(terrainRaw);
  const range = Math.max(0, Math.floor(toSafeNumber(rangeRaw, 0)));
  const origin = {
    x: Math.floor(toSafeNumber(xRaw, Number.NaN)),
    y: Math.floor(toSafeNumber(yRaw, Number.NaN))
  };
  if (!terrain || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return false;
  const excludeCenter = !!options?.excludeCenter;
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      if (excludeCenter && x === origin.x && y === origin.y) continue;
      if (resolveFacilityTerrainAt(data, x, y) !== terrain) continue;
      if (resolveFacilityTerrainDistance(origin, { x, y }, data) <= range) return true;
    }
  }
  return false;
}

function resolveSelectedBuildTileContext() {
  const detail = selectedTileDetail.value;
  const x = Math.floor(toSafeNumber(detail?.x, Number.NaN));
  const y = Math.floor(toSafeNumber(detail?.y, Number.NaN));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: null, y: null, tileKey: "", tileMode: "", terrain: "", buildable: false };
  }
  const tileKey = coordKey(x, y);
  const ownTerritory = isOwnTerritoryTile(x, y);
  const tileMode = ownTerritory ? resolveTerritoryTileModeAt(villageState.value, tileKey) : "";
  const isVillageCenterTile = !!(
    villageState.value?.placed
    && Math.floor(toSafeNumber(villageState.value?.x, Number.NaN)) === x
    && Math.floor(toSafeNumber(villageState.value?.y, Number.NaN)) === y
  );
  const buildable = ownTerritory
    && (
      tileMode === TERRITORY_TILE_MODE_SETTLEMENT
      || tileMode === TERRITORY_TILE_MODE_RESOURCE
      || isVillageCenterTile
    );
  const terrain = resolveFacilityTerrainAt(currentData.value, x, y) || normalizeFacilityTerrainName(detail?.terrain);
  return { x, y, tileKey, tileMode, terrain, buildable };
}

function resolveFacilityTerrainConditionForSelectedTile(conditionRaw) {
  const condition = nonEmptyText(conditionRaw);
  if (!condition || condition === "なし") return { ok: true, reason: "" };
  const target = resolveSelectedBuildTileContext();
  if (!target.buildable || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    return { ok: false, reason: `地形条件 ${condition}: 建設対象マスを確認できません` };
  }
  if (condition === "海辺") {
    const ok = hasFacilityTerrainWithinRange("海", 1, target.x, target.y, { excludeCenter: true });
    return { ok, reason: ok ? "" : "地形条件: 海に隣接したマスが必要です" };
  }
  const withinMatch = condition.match(/^(.+?)[：:]\s*(\d+)マス以内$/u);
  if (withinMatch) {
    const requiredTerrain = normalizeFacilityTerrainName(withinMatch[1]);
    const range = Math.max(0, Math.floor(toSafeNumber(withinMatch[2], 0)));
    const ok = hasFacilityTerrainWithinRange(requiredTerrain, range, target.x, target.y);
    return { ok, reason: ok ? "" : `地形条件: ${requiredTerrain}が${range}マス以内に必要です` };
  }
  const requiredTerrain = normalizeFacilityTerrainName(condition);
  const ok = normalizeFacilityTerrainName(target.terrain) === requiredTerrain;
  return {
    ok,
    reason: ok ? "" : `地形条件: ${requiredTerrain}が必要です (現在: ${target.terrain || "不明"})`
  };
}'''
sub_once(
    phaser_path,
    r'''function resolveSelectedBuildTileContext\(\) \{.*?\n\}\n\nconst \{''',
    new_context + '\n\nconst {',
    flags=re.DOTALL
)
sub_once(
    phaser_path,
    r'''(  resolveSelectedBuildTileMode: \(\) => resolveSelectedBuildTileContext\(\)\.tileMode,\n  canOpenVillageBuildAtTile: \(\) => resolveSelectedBuildTileContext\(\)\.buildable)(\n\}\);)''',
    lambda match: match.group(1) + ',\n  resolveFacilityTerrainCondition: resolveFacilityTerrainConditionForSelectedTile' + match.group(2)
)

# Enforce terrain status in construction availability.
sub_once(
    build_path,
    r'''(  const canOpenVillageBuildAtTile = typeof options\.canOpenVillageBuildAtTile === "function"\n\s+\? options\.canOpenVillageBuildAtTile\n\s+: \(\(\) => false\);)''',
    lambda match: match.group(1) + '''
  const resolveFacilityTerrainCondition = typeof options.resolveFacilityTerrainCondition === "function"
    ? options.resolveFacilityTerrainCondition
    : (conditionRaw => {
      const condition = nonEmptyText(conditionRaw);
      const ok = !condition || condition === "なし";
      return { ok, reason: ok ? "" : `地形条件を確認できません: ${condition}` };
    });'''
)
replace_once(
    build_path,
    '    if (source.hasResearch === false) states.push("研究不足");',
    '    if (source.hasTerrain === false) states.push("地形不一致");\n    if (source.hasResearch === false) states.push("研究不足");'
)
replace_once(
    build_path,
    '    const reasons = [];\n    const requirements = Array.isArray(def.requirements) ? def.requirements : [];',
    '''    const reasons = [];
    const terrainStatusRaw = resolveFacilityTerrainCondition(def.conditionTerrain, target);
    const hasTerrain = terrainStatusRaw === true || terrainStatusRaw?.ok === true;
    if (!hasTerrain) {
      reasons.push(nonEmptyText(terrainStatusRaw?.reason) || `地形条件: ${def.conditionTerrain || "不明"}`);
    }
    const requirements = Array.isArray(def.requirements) ? def.requirements : [];'''
)
replace_once(
    build_path,
    '    const statusText = resolveVillageBuildingStatusText({ hasResearch, canAfford, hasLand });',
    '    const statusText = resolveVillageBuildingStatusText({ hasTerrain, hasResearch, canAfford, hasLand });'
)
replace_once(
    build_path,
    '      selectable: hasResearch && canAfford && hasLand,',
    '      selectable: hasTerrain && hasResearch && canAfford && hasLand,'
)
replace_once(
    build_path,
    '      canAfford,\n      hasResearch,\n      hasLand,',
    '      canAfford,\n      hasTerrain,\n      hasResearch,\n      hasLand,'
)
