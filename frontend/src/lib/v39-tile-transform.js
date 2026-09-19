const text = (value) => String(value ?? "").trim();

function buildTerrainRowMap(terrainRows = []) {
  const map = new Map();
  for (const row of Array.isArray(terrainRows) ? terrainRows : []) {
    const name = text(row?.地形);
    if (name && !map.has(name)) map.set(name, row);
  }
  return map;
}

export function resolveV39TileTransformEffect(skillRow, terrainRows = []) {
  const effect = text(skillRow?.効果);
  const match = effect.match(/^(.+?)_変換$/u);
  if (!match) return null;
  const targetTerrain = text(match[1]);
  const terrainRow = buildTerrainRowMap(terrainRows).get(targetTerrain) || null;
  return {
    effect,
    targetTerrain,
    terrainRow,
    layer: text(terrainRow?.変換レイヤー)
  };
}

function resolveCoord(data, xRaw, yRaw) {
  const x = Math.floor(Number(xRaw));
  const y = Math.floor(Number(yRaw));
  const w = Math.max(0, Math.floor(Number(data?.w)));
  const h = Math.max(0, Math.floor(Number(data?.h)));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !w || !h) return null;
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  return { x, y };
}

export function validateV39TileTransformEffect(data, xRaw, yRaw, spec, terrainRows = []) {
  if (!spec) return { matched: false, ok: false, reason: "タイル変換効果ではありません。" };
  const coord = resolveCoord(data, xRaw, yRaw);
  if (!coord) return { matched: true, ok: false, reason: "変換対象マスが不正です。" };
  if (!spec.terrainRow) {
    return { matched: true, ok: false, reason: `変換先地形「${spec.targetTerrain}」が地形.jsonにありません。` };
  }
  if (spec.layer !== "基本" && spec.layer !== "特殊") {
    return { matched: true, ok: false, reason: `変換先地形「${spec.targetTerrain}」の変換レイヤーが未設定です。` };
  }
  if (!Array.isArray(data?.grid?.[coord.y])) {
    return { matched: true, ok: false, reason: "マップ地形データがありません。" };
  }

  const rowMap = buildTerrainRowMap(terrainRows);
  const currentBase = text(data.grid[coord.y][coord.x]);
  const currentSpecial = text(data?.specialMap?.[coord.y]?.[coord.x]);
  const baseRow = rowMap.get(currentBase) || null;
  const specialRow = currentSpecial ? (rowMap.get(currentSpecial) || null) : null;

  if (data?.lavaMap?.[coord.y]?.[coord.x]) {
    return { matched: true, ok: false, reason: "溶岩が存在するマスは変換できません。" };
  }
  if (baseRow?.変換元許可 === false || specialRow?.変換元許可 === false) {
    return {
      matched: true,
      ok: false,
      reason: `現在の地形「${currentSpecial || currentBase || "不明"}」は変換対象外です。`
    };
  }
  if (spec.layer === "基本" && currentBase === spec.targetTerrain && !currentSpecial) {
    return { matched: true, ok: false, reason: `既に${spec.targetTerrain}です。` };
  }
  if (spec.layer === "特殊" && currentSpecial === spec.targetTerrain) {
    return { matched: true, ok: false, reason: `既に${spec.targetTerrain}です。` };
  }

  return {
    matched: true,
    ok: true,
    x: coord.x,
    y: coord.y,
    currentBase,
    currentSpecial,
    targetTerrain: spec.targetTerrain,
    layer: spec.layer
  };
}

function ensureSpecialMap(data) {
  const w = Math.max(0, Math.floor(Number(data?.w)));
  const h = Math.max(0, Math.floor(Number(data?.h)));
  if (!Array.isArray(data.specialMap)) {
    data.specialMap = Array.from({ length: h }, () => Array.from({ length: w }, () => null));
  }
  for (let y = 0; y < h; y += 1) {
    if (!Array.isArray(data.specialMap[y])) {
      data.specialMap[y] = Array.from({ length: w }, () => null);
    }
  }
}

export function applyV39TileTransformEffect(data, xRaw, yRaw, spec, terrainRows = []) {
  const check = validateV39TileTransformEffect(data, xRaw, yRaw, spec, terrainRows);
  if (!check.ok) return check;

  const { x, y, currentBase, currentSpecial, targetTerrain, layer } = check;
  if (layer === "基本") {
    data.grid[y][x] = targetTerrain;
    if (Array.isArray(data?.specialMap?.[y])) data.specialMap[y][x] = null;
  } else {
    ensureSpecialMap(data);
    data.specialMap[y][x] = targetTerrain;
  }

  const before = currentSpecial ? `${currentBase}/${currentSpecial}` : currentBase;
  const after = layer === "特殊" ? `${currentBase}/${targetTerrain}` : targetTerrain;
  return {
    ...check,
    changed: true,
    before,
    after,
    summary: `地形変換: (${x}, ${y}) ${before || "不明"} → ${after}`
  };
}
