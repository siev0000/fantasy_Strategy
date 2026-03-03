import { generateIsland as generateRealisticIsland } from "./realistic-island.js";

const 地形定義 = [
  { key: "平地", color: "#d9c98b", weight: 28, short: "平" },
  { key: "森", color: "#7fa56a", weight: 18, short: "森" },
  { key: "丘陵", color: "#a49367", weight: 12, short: "丘" },
  { key: "山岳", color: "#8b847d", weight: 10, short: "山" },
  { key: "雪原", color: "#cfdbe8", weight: 6, short: "雪" },
  { key: "火山", color: "#7e4f45", weight: 4, short: "火" },
  { key: "河川", color: "#78aed8", weight: 10, short: "川" },
  { key: "湖", color: "#6ea5d1", weight: 8, short: "湖" },
  { key: "海", color: "#4f88ba", weight: 7, short: "海" },
  { key: "砂漠", color: "#d8be76", weight: 7, short: "砂" }
];

const 島パターン定義 = {
  balanced: { name: "標準諸島", landMin: 0.38, landMax: 0.50, growth: 0.58, smoothingPasses: 1, erosionChance: 0.02 },
  continent: { name: "大陸型", landMin: 0.50, landMax: 0.62, growth: 0.66, smoothingPasses: 2, erosionChance: 0.01 },
  archipelago: { name: "多島海", landMin: 0.28, landMax: 0.40, growth: 0.50, smoothingPasses: 0, erosionChance: 0.06 },
  twins: { name: "双子島", landMin: 0.36, landMax: 0.48, growth: 0.57, smoothingPasses: 1, erosionChance: 0.03 },
  chain: { name: "列島型", landMin: 0.30, landMax: 0.44, growth: 0.54, smoothingPasses: 1, erosionChance: 0.04 },
  realistic: { name: "リアル島", landMin: 0.40, landMax: 0.53, growth: 0.60, smoothingPasses: 2, erosionChance: 0.02 }
};

const 地形生成設定 = {
  比率: {
    山岳: 0.14,
    森: 0.45,
    丘陵: 0.16,
    砂漠: 0.15,
    湖上限: 0.01
  },
  最小クラスタ数: {
    山岳: 3,
    丘陵: 2,
    砂漠: 6
  },
  最低枚数: {
    山岳: 6,
    丘陵: 4,
    砂漠: 6
  },
  確率: {
    湖候補: 0.35,
    沼地化: 0.28,
    滝化: 0.35,
    峡谷化: 0.18,
    洞窟化: 0.1
  },
  高度: {
    基礎高度: 18,
    島中央隆起幅: 68,
    画面中央隆起幅: 0,
    海岸減衰幅: 44,
    ノイズ幅: 10,
    平滑化回数: 2
  },
  山岳塊: {
    モード候補: ["single", "multi", "mixed"],
    通常塊サイズ: {
      最小: 3,
      最大: 8
    },
    巨大塊サイズ: {
      最小: 12,
      最大: 15
    },
    群峰塊数: {
      最小: 2,
      最大: 6
    },
    混合追加塊数: {
      最小: 1,
      最大: 4
    },
    塊間最小距離: {
      最小: 1,
      最大: 3
    },
    山麓丘陵化確率: 0.45,
    起伏保証: {
      有効: true,
      最低島サイズ: 10,
      最低起伏枚数: 1
    }
  },
  地形比率プリセット候補: ["balanced", "verdant", "rugged"],
  島構成: {
    大島数: 0,
    大島数範囲: {
      最小: 1,
      最大: 8
    },
    大島間最小距離: 6,
    孤島サイズ: {
      最小: 4,
      最大: 8
    },
    孤島数ランダム: {
      最小: 1,
      最大: 5
    },
    孤島試行回数: 36,
    島間海マス: 2
  },
  気候帯: {
    北端雪原帯行数: 2
  },
  火山化: {
    休火山化率: 0.2,
    噴火率毎ターン: 0.01,
    初期噴火判定ターン数: 1,
    溶岩流: {
      最大進行マス: 3,
      停止確率: 0.35
    },
    噴火影響: {
      周囲産出倍率: 0.5,
      継続ターン: 2,
      人口減少最小: 1,
      人口減少最大: 3,
      治安減少: 10
    }
  }
};

const 地形比率プリセット定義 = {
  balanced: {
    name: "均衡",
    比率: {
      山岳: 0.14,
      森: 0.20,
      丘陵: 0.16,
      砂漠: 0.15,
      湖上限: 0.01
    }
  },
  verdant: {
    name: "森林豊富",
    比率: {
      山岳: 0.1,
      森: 0.28,
      丘陵: 0.18,
      砂漠: 0.08,
      湖上限: 0.018
    }
  },
  rugged: {
    name: "険峻",
    比率: {
      山岳: 0.3,
      森: 0.20,
      丘陵: 0.30,
      砂漠: 0.1,
      湖上限: 0.008
    }
  }
};

const 特殊地形設定 = {
  峡谷: {
    対象地形キー: ["丘陵", "山岳", "火山"],
    最低高度Lv: 2,
    最低落差Lv: 2,
    最低川隣接数: 1,
    川判定に自マスを含む: true
  },
  洞窟: {
    対象地形キー: ["丘陵", "山岳", "火山"],
    最低高度Lv: 2,
    最低山岳隣接数: 4,
    山岳判定に自マスを含む: true,
    規模閾値: {
      中: 3,
      大: 6
    }
  },
  沼地: {
    最大高度Lv: 2,
    湿潤条件: {
      水地形キー: ["海", "湖"],
      最低水隣接数: 1,
      水判定に自マスを含む: false,
      最低川隣接数: 1,
      川判定に自マスを含む: true
    }
  }
};

const 強敵配置設定 = {
  有効: true,
  基本Lv: 1,
  基本出現確率: 0.5,
  重複ルール許可: false,
  ルール: {
    森中央: {
      有効: true,
      最低森規模: 7,
      複合地勢セルを含む: false
    },
    砂漠オアシス: {
      有効: true,
      最低砂漠隣接数: 5
    },
    大森林外周: {
      有効: true,
      最低森規模: 21,
      規模分母: 7,
      配置距離: 4,
      各候補出現確率: 0.5,
      単独時Lv加算: 1
    },
    森環丘山: {
      有効: true,
      中央対象地勢: ["丘陵", "山岳"],
      最低森隣接数: 6,
      出現確率: 0.5,
      中央が被覆森を除外: true
    }
  }
};

const 山岳モード定義 = {
  single: {
    key: "single",
    name: "単峰",
    塊数: { 最小: 1, 最大: 1 },
    巨大塊サイズ: { 最小: 12, 最大: 15 },
    塊間最小距離: { 最小: 1, 最大: 2 },
    距離倍率: { 基準サイズ: 36, 基準倍率: 1, 拡張サイズ: 108, 拡張倍率: 2.0 },
    山麓丘陵化確率: 0.9
  },
  multi: {
    key: "multi",
    name: "群峰",
    塊数: { 最小: 2, 最大: 6 },
    通常塊サイズ: { 最小: 3, 最大: 8 },
    塊間最小距離: { 最小: 1, 最大: 2 },
    距離倍率: { 基準サイズ: 36, 基準倍率: 1, 拡張サイズ: 108, 拡張倍率: 2.0 },
    山麓丘陵化確率: 0.9
  },
  mixed: {
    key: "mixed",
    name: "混合",
    巨大塊数: { 最小: 1, 最大: 1 },
    追加塊数: { 最小: 3, 最大: 8 },
    通常塊サイズ: { 最小: 3, 最大: 6 },
    巨大塊サイズ: { 最小: 12, 最大: 15 },
    塊間最小距離: { 最小: 1, 最大: 2 },
    距離倍率: { 基準サイズ: 36, 基準倍率: 1, 拡張サイズ: 108, 拡張倍率: 2.0 },
    山麓丘陵化確率: 0.9
  }
};

export const terrainDefinitions = 地形定義;

function getHexNeighbors(grid, x, y) {
  const h = grid.length;
  const w = grid[0].length;
  const isOddRow = y % 2 === 1;
  const deltas = isOddRow
    ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const result = [];
  for (const [dx, dy] of deltas) {
    const nx = x + dx;
    const ny = y + dy;
    if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
      result.push(grid[ny][nx]);
    }
  }
  return result;
}

function getHexNeighborCoords(w, h, x, y) {
  const isOddRow = y % 2 === 1;
  const deltas = isOddRow
    ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const result = [];
  for (const [dx, dy] of deltas) {
    const nx = x + dx;
    const ny = y + dy;
    if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
      result.push({ x: nx, y: ny });
    }
  }
  return result;
}

function isEdge(x, y, w, h) {
  return x === 0 || y === 0 || x === w - 1 || y === h - 1;
}

function randomFrom(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function coordKey(x, y) {
  return `${x},${y}`;
}

function readRangeValue(primaryRange, fallbackRange, defaultMin, defaultMax) {
  const min = Math.max(
    1,
    Number.isFinite(primaryRange?.最小) ? primaryRange.最小 : (
      Number.isFinite(fallbackRange?.最小) ? fallbackRange.最小 : defaultMin
    )
  );
  const maxRaw = Number.isFinite(primaryRange?.最大) ? primaryRange.最大 : (
    Number.isFinite(fallbackRange?.最大) ? fallbackRange.最大 : defaultMax
  );
  const max = Math.max(min, maxRaw);
  return { min, max };
}

function normalizeProbability(value, fallback = 0) {
  if (!Number.isFinite(value)) return clamp(fallback, 0, 1);
  if (value > 1) return clamp(value / 100, 0, 1);
  return clamp(value, 0, 1);
}

function getTerrainRatioCandidateKeys() {
  const candidateKeys = Array.isArray(地形生成設定.地形比率プリセット候補) && 地形生成設定.地形比率プリセット候補.length
    ? 地形生成設定.地形比率プリセット候補
    : Object.keys(地形比率プリセット定義);
  const valid = [...new Set(candidateKeys.filter(key => Object.prototype.hasOwnProperty.call(地形比率プリセット定義, key)))];
  return valid.length ? valid : ["balanced"];
}

function resolveTerrainRatioProfileByKey(key) {
  const profile = 地形比率プリセット定義[key] || {};
  const profileRatio = profile.比率 || {};
  const fallback = 地形生成設定.比率 || {};
  const ratio = {
    山岳: normalizeProbability(profileRatio.山岳, fallback.山岳),
    森: normalizeProbability(profileRatio.森, fallback.森),
    丘陵: normalizeProbability(profileRatio.丘陵, fallback.丘陵),
    砂漠: normalizeProbability(profileRatio.砂漠, fallback.砂漠),
    湖上限: normalizeProbability(profileRatio.湖上限, fallback.湖上限)
  };
  return {
    key,
    name: profile.name || key,
    比率: ratio
  };
}

function resolveTerrainRatioProfile() {
  const key = randomFrom(getTerrainRatioCandidateKeys()) || "balanced";
  return resolveTerrainRatioProfileByKey(key);
}

function buildIslandTerrainRatioProfiles(components) {
  const islands = Array.isArray(components) ? components.filter(c => c?.size > 0) : [];
  if (!islands.length) {
    return {
      profileMap: new Map(),
      profileList: [],
      summary: "-",
      name: "島別地形比率: -"
    };
  }

  const candidates = getTerrainRatioCandidateKeys();
  const islandCount = islands.length;
  const baseCount = Math.floor(islandCount / Math.max(1, candidates.length));
  const remainder = islandCount % Math.max(1, candidates.length);
  const bag = [];
  for (const key of candidates) {
    for (let i = 0; i < baseCount; i += 1) bag.push(key);
  }
  const remainderKeys = [...candidates].sort(() => Math.random() - 0.5).slice(0, remainder);
  bag.push(...remainderKeys);
  while (bag.length < islandCount) bag.push(randomFrom(candidates) || "balanced");

  const shuffledBag = [...bag].sort(() => Math.random() - 0.5);
  const shuffledIslands = [...islands].sort(() => Math.random() - 0.5);
  const profileMap = new Map();
  const profileList = [];

  for (let i = 0; i < shuffledIslands.length; i += 1) {
    const island = shuffledIslands[i];
    const profileKey = shuffledBag[i] || randomFrom(candidates) || "balanced";
    const profile = resolveTerrainRatioProfileByKey(profileKey);
    const detail = {
      islandId: island.id,
      size: island.size,
      profileKey: profile.key,
      profileName: profile.name,
      比率: profile.比率
    };
    profileMap.set(island.id, detail);
    profileList.push(detail);
  }

  const orderedNames = candidates
    .map(key => resolveTerrainRatioProfileByKey(key))
    .map(profile => {
      const count = profileList.reduce((sum, item) => sum + (item.profileKey === profile.key ? 1 : 0), 0);
      return { name: profile.name, count };
    })
    .filter(item => item.count > 0);
  const summary = orderedNames.length
    ? orderedNames.map(item => `${item.name}${item.count}`).join(" / ")
    : "-";

  return {
    profileMap,
    profileList,
    summary,
    name: orderedNames.length ? `島別ランダム (${summary})` : "島別ランダム"
  };
}

function distributeIslandTargets(components, profileMap, terrainKey, minTotal = 0) {
  const islands = Array.isArray(components) ? components.filter(c => c?.size > 0) : [];
  const byIsland = new Map();
  if (!islands.length) return { byIsland, totalTarget: 0 };

  const fallbackRatio = normalizeProbability(地形生成設定.比率?.[terrainKey], 0);
  const rows = islands.map(comp => {
    const profile = profileMap.get(comp.id);
    const ratio = normalizeProbability(profile?.比率?.[terrainKey], fallbackRatio);
    const raw = Math.max(0, comp.size * ratio);
    const base = Math.floor(raw);
    return {
      id: comp.id,
      size: comp.size,
      raw,
      frac: raw - base,
      target: base
    };
  });

  const totalRaw = rows.reduce((sum, row) => sum + row.raw, 0);
  const landTotal = rows.reduce((sum, row) => sum + row.size, 0);
  let targetTotal = Math.round(totalRaw);
  targetTotal = Math.max(Math.max(0, Math.floor(minTotal || 0)), targetTotal);
  targetTotal = Math.min(landTotal, targetTotal);
  let current = rows.reduce((sum, row) => sum + row.target, 0);

  if (current < targetTotal) {
    const upOrder = [...rows].sort((a, b) => b.frac - a.frac || Math.random() - 0.5);
    let i = 0;
    while (current < targetTotal && upOrder.length) {
      const row = upOrder[i % upOrder.length];
      if (row.target < row.size) {
        row.target += 1;
        current += 1;
      }
      i += 1;
      if (i > upOrder.length * Math.max(1, targetTotal + 1)) break;
    }
  } else if (current > targetTotal) {
    const downOrder = [...rows].sort((a, b) => a.frac - b.frac || Math.random() - 0.5);
    let i = 0;
    while (current > targetTotal && downOrder.length) {
      const row = downOrder[i % downOrder.length];
      if (row.target > 0) {
        row.target -= 1;
        current -= 1;
      }
      i += 1;
      if (i > downOrder.length * Math.max(1, current + 1)) break;
    }
  }

  for (const row of rows) byIsland.set(row.id, row.target);
  return { byIsland, totalTarget: current };
}

function randomInteriorCell(w, h) {
  const minX = 1;
  const minY = 1;
  const maxX = Math.max(1, w - 2);
  const maxY = Math.max(1, h - 2);
  return {
    x: Math.floor(Math.random() * (maxX - minX + 1)) + minX,
    y: Math.floor(Math.random() * (maxY - minY + 1)) + minY
  };
}

function countAround(grid, x, y, key) {
  return getHexNeighbors(grid, x, y).filter(v => v === key).length;
}

function isMountainLikeTerrain(terrain) {
  return terrain === "山岳" || terrain === "火山";
}

function isLandTerrain(terrain) {
  return terrain !== "海" && terrain !== "湖" && terrain !== "河川";
}

function shouldBecomeLake(grid, x, y) {
  const terrain = grid[y][x];
  if (terrain === "海" || terrain === "河川" || isMountainLikeTerrain(terrain)) return false;
  const mountainNear = countAround(grid, x, y, "山岳");
  const forestNear = countAround(grid, x, y, "森");
  const seaNear = countAround(grid, x, y, "海");
  const mountainFoothill = mountainNear >= 2;
  const forestCore = forestNear >= 4 && seaNear === 0;
  if (!(mountainFoothill || forestCore)) return false;
  return Math.random() < 地形生成設定.確率.湖候補;
}

function buildInitialGrid(w, h, fill = "海") {
  const grid = [];
  for (let y = 0; y < h; y += 1) {
    const row = [];
    for (let x = 0; x < w; x += 1) row.push(fill);
    grid.push(row);
  }
  return grid;
}

function uniqueCoords(coords, w, h) {
  const set = new Set();
  const result = [];
  for (const c of coords) {
    const x = clamp(c.x, 1, Math.max(1, w - 2));
    const y = clamp(c.y, 1, Math.max(1, h - 2));
    const key = `${x},${y}`;
    if (!set.has(key)) {
      set.add(key);
      result.push({ x, y });
    }
  }
  return result;
}

function buildPatternSeeds(patternId, w, h, seedCount) {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const seeds = [];

  if (patternId === "continent") {
    seeds.push({ x: cx, y: cy });
    seeds.push({ x: cx + (Math.random() < 0.5 ? -1 : 1), y: cy });
  } else if (patternId === "twins") {
    seeds.push({ x: Math.floor(w * 0.32), y: cy + (Math.random() < 0.5 ? -1 : 1) });
    seeds.push({ x: Math.floor(w * 0.68), y: cy + (Math.random() < 0.5 ? -1 : 1) });
  } else if (patternId === "chain") {
    for (let i = 0; i < seedCount; i += 1) {
      const t = seedCount <= 1 ? 0.5 : i / (seedCount - 1);
      const x = Math.floor(1 + t * (w - 3));
      const y = clamp(Math.floor(cy + (Math.random() * 4 - 2)), 1, Math.max(1, h - 2));
      seeds.push({ x, y });
    }
  }

  while (seeds.length < seedCount) seeds.push(randomInteriorCell(w, h));
  return uniqueCoords(seeds, w, h);
}

function smoothLand(grid, w, h, passCount) {
  for (let pass = 0; pass < passCount; pass += 1) {
    const next = grid.map(r => [...r]);
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        if (grid[y][x] !== "海") continue;
        const landNear = getHexNeighbors(grid, x, y).filter(v => v !== "海").length;
        if (landNear >= 4) next[y][x] = "平地";
      }
    }
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) grid[y][x] = next[y][x];
    }
  }
}

function applyNorthSnowBand(grid, w, h, rowCount = 2) {
  const rows = clamp(Math.floor(Number(rowCount) || 0), 0, h);
  let changed = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const terrain = grid[y][x];
      if (terrain === "海" || terrain === "湖" || terrain === "河川") continue;
      if (terrain === "雪原") continue;
      grid[y][x] = "雪原";
      changed += 1;
    }
  }
  return { rows, changed };
}

function buildDormantVolcanoMap(grid, w, h, dormantRate = 0.2) {
  const map = buildInitialGrid(w, h, false);
  const dormantSet = new Set();
  const rate = normalizeProbability(dormantRate, 0.2);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] !== "山岳") continue;
      if (Math.random() >= rate) continue;
      map[y][x] = true;
      dormantSet.add(coordKey(x, y));
    }
  }
  return { map, dormantSet };
}

function runVolcanoEruptionTurns(grid, w, h, dormantMap, volcanoRule) {
  if (!dormantMap || !dormantMap.length) {
    return { eruptedSet: new Set(), events: [] };
  }
  const perTurnRate = normalizeProbability(volcanoRule?.噴火率毎ターン, 0.01);
  const turnCount = Math.max(0, Math.floor(Number(volcanoRule?.初期噴火判定ターン数) || 0));
  const effects = volcanoRule?.噴火影響 || {};
  const popLossMin = Number.isFinite(effects.人口減少最小) ? effects.人口減少最小 : 1;
  const popLossMax = Number.isFinite(effects.人口減少最大) ? effects.人口減少最大 : 3;
  const yieldMultiplier = Number.isFinite(effects.周囲産出倍率) ? effects.周囲産出倍率 : 0.5;
  const durationTurns = Number.isFinite(effects.継続ターン) ? effects.継続ターン : 2;
  const securityLoss = Number.isFinite(effects.治安減少) ? effects.治安減少 : 10;
  const eruptedSet = new Set();
  const events = [];

  for (let turn = 0; turn < turnCount; turn += 1) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!dormantMap[y][x]) continue;
        if (Math.random() >= perTurnRate) continue;
        dormantMap[y][x] = false;
        grid[y][x] = "火山";
        const key = coordKey(x, y);
        eruptedSet.add(key);
        const affectedCoords = getHexNeighborCoords(w, h, x, y);
        events.push({
          x,
          y,
          key,
          turn: turn + 1,
          affectedCoords,
          effects: {
            yieldMultiplier,
            durationTurns,
            populationLoss: randomInt(popLossMin, popLossMax),
            securityLoss
          }
        });
      }
    }
  }

  return { eruptedSet, events };
}

function cloneGrid2D(map, fallback) {
  if (!Array.isArray(map) || !map.length) return fallback;
  return map.map(row => (Array.isArray(row) ? [...row] : []));
}

function buildDormantMapFromGrid(grid, w, h) {
  const map = buildInitialGrid(w, h, false);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] === "山岳") map[y][x] = true;
    }
  }
  return map;
}

function processVolcanoEruptionTurn(grid, w, h, dormantMap, heightLevelMap, volcanoRule, options = {}) {
  const perTurnRate = normalizeProbability(volcanoRule?.噴火率毎ターン, 0.01);
  const eruptedCells = [];
  const turnNumber = Number.isFinite(options?.turnNumber) ? Math.max(1, Math.floor(options.turnNumber)) : 1;
  const markEruption = (x, y, forced = false) => {
    if (!dormantMap?.[y]?.[x]) return false;
    dormantMap[y][x] = false;
    grid[y][x] = "火山";
    if (Array.isArray(heightLevelMap) && Number.isFinite(heightLevelMap?.[y]?.[x])) {
      heightLevelMap[y][x] = Math.max(heightLevelMap[y][x], 3);
    }
    eruptedCells.push({
      type: "eruption",
      turn: turnNumber,
      x,
      y,
      key: coordKey(x, y),
      forced
    });
    return true;
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!dormantMap?.[y]?.[x]) continue;
      if (grid[y][x] !== "山岳") {
        dormantMap[y][x] = false;
        continue;
      }
      if (Math.random() < perTurnRate) {
        markEruption(x, y, false);
      }
    }
  }

  if ((options?.forceTestEvent === true) && eruptedCells.length === 0) {
    const dormantCandidates = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (dormantMap?.[y]?.[x] && grid[y][x] === "山岳") {
          dormantCandidates.push({ x, y });
        }
      }
    }
    const chosen = randomFrom(dormantCandidates);
    if (chosen) markEruption(chosen.x, chosen.y, true);
  }

  return eruptedCells;
}

function lavaEdgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function angleBetweenHex(a, b) {
  const ca = hexCenter(a.x, a.y);
  const cb = hexCenter(b.x, b.y);
  return Math.atan2(cb.cy - ca.cy, cb.cx - ca.cx);
}

function angleDiffRad(a, b) {
  const raw = Math.abs(a - b);
  return Math.min(raw, (Math.PI * 2) - raw);
}

function cloneLavaState(state) {
  if (!state || !Array.isArray(state.flows)) return { flows: [] };
  return {
    flows: state.flows.map(flow => ({
      sourceKey: String(flow.sourceKey || ""),
      sourceX: Number(flow.sourceX),
      sourceY: Number(flow.sourceY),
      headKey: String(flow.headKey || flow.sourceKey || ""),
      headX: Number(flow.headX),
      headY: Number(flow.headY),
      directionAngle: Number.isFinite(flow.directionAngle) ? flow.directionAngle : null,
      active: flow.active !== false,
      stopReason: String(flow.stopReason || ""),
      createdTurn: Number.isFinite(flow.createdTurn) ? Math.floor(flow.createdTurn) : 0,
      path: Array.isArray(flow.path) ? flow.path.map(p => ({
        x: Number(p.x),
        y: Number(p.y),
        key: String(p.key || coordKey(Number(p.x), Number(p.y)))
      })) : []
    }))
  };
}

function ensureLavaSources(lavaState, grid, w, h, turnNumber) {
  const sourceSet = new Set();
  for (const flow of lavaState.flows) {
    if (flow.sourceKey) sourceSet.add(flow.sourceKey);
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] !== "火山") continue;
      const key = coordKey(x, y);
      if (sourceSet.has(key)) continue;
      lavaState.flows.push({
        sourceKey: key,
        sourceX: x,
        sourceY: y,
        headKey: key,
        headX: x,
        headY: y,
        directionAngle: null,
        active: true,
        stopReason: "",
        createdTurn: turnNumber,
        path: []
      });
      sourceSet.add(key);
    }
  }
}

function buildLavaFlowDataFromState(lavaState, w, h) {
  const lavaMap = buildInitialGrid(w, h, false);
  const nodeSet = new Set();
  const edgeSet = new Set();
  const sourceSet = new Set();
  const flows = Array.isArray(lavaState?.flows) ? lavaState.flows : [];
  for (const flow of flows) {
    const fromKey = flow?.sourceKey;
    if (!fromKey) continue;
    sourceSet.add(fromKey);
    let prevKey = fromKey;
    for (const p of flow.path || []) {
      if (!p?.key) continue;
      nodeSet.add(p.key);
      lavaMap[p.y][p.x] = true;
      edgeSet.add(lavaEdgeKey(prevKey, p.key));
      prevKey = p.key;
    }
  }
  return {
    lavaMap,
    lavaFlowData: {
      nodeKeys: [...nodeSet],
      edgeKeys: [...edgeSet],
      sourceKeys: [...sourceSet]
    }
  };
}

function pickNextLavaStep(flow, grid, heightLevelMap, w, h, visited, maxTurnAngle) {
  const current = { x: flow.headX, y: flow.headY };
  const neighbors = getHexNeighborCoords(w, h, current.x, current.y);
  const candidates = [];
  for (const n of neighbors) {
    const key = coordKey(n.x, n.y);
    if (visited.has(key)) continue;
    const terrain = grid[n.y][n.x];
    if (terrain === "海" || terrain === "湖") continue;
    const level = Number.isFinite(heightLevelMap?.[n.y]?.[n.x]) ? heightLevelMap[n.y][n.x] : 99;
    const angle = angleBetweenHex(current, n);
    const diff = Number.isFinite(flow.directionAngle) ? angleDiffRad(angle, flow.directionAngle) : 0;
    candidates.push({
      x: n.x,
      y: n.y,
      key,
      isRiver: terrain === "河川",
      level,
      angle,
      diff,
      rand: Math.random()
    });
  }
  if (!candidates.length) return { stopReason: "no_path" };
  if (Number.isFinite(flow.directionAngle)) {
    candidates.sort((a, b) => a.diff - b.diff || a.level - b.level || a.rand - b.rand);
    const best = candidates[0];
    if (best.diff > maxTurnAngle) return { stopReason: "direction_blocked" };
    if (best.isRiver) return { stopReason: "river_hit" };
    return { step: best };
  }
  candidates.sort((a, b) => a.level - b.level || a.rand - b.rand);
  const first = candidates[0];
  if (first.isRiver) return { stopReason: "river_hit" };
  return { step: first };
}

function buildLavaFlowTurn(grid, heightLevelMap, w, h, volcanoRule, prevLavaState, turnNumber = 1, options = {}) {
  const lavaSettings = volcanoRule?.溶岩流 || {};
  const maxSteps = Math.max(1, Math.floor(Number(lavaSettings.最大進行マス) || 3));
  const stopChance = normalizeProbability(lavaSettings.停止確率, 0.35);
  const maxTurnAngle = (Number.isFinite(lavaSettings.方向維持角度度) ? lavaSettings.方向維持角度度 : 38) * (Math.PI / 180);
  const lavaState = cloneLavaState(prevLavaState);
  const events = [];

  if (options?.forceTestEvent === true) {
    let hasVolcano = false;
    for (let y = 0; y < h && !hasVolcano; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (grid[y][x] === "火山") {
          hasVolcano = true;
          break;
        }
      }
    }
    if (!hasVolcano && options?.allowCreateVolcano !== false) {
      const mountains = [];
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (grid[y][x] === "山岳") mountains.push({ x, y });
        }
      }
      const src = randomFrom(mountains);
      if (src) {
        grid[src.y][src.x] = "火山";
        if (Array.isArray(heightLevelMap) && Number.isFinite(heightLevelMap?.[src.y]?.[src.x])) {
          heightLevelMap[src.y][src.x] = Math.max(heightLevelMap[src.y][src.x], 3);
        }
      }
    }
  }
  ensureLavaSources(lavaState, grid, w, h, turnNumber);

  for (const flow of lavaState.flows) {
    if (!flow.active) continue;
    if (grid[flow.sourceY]?.[flow.sourceX] !== "火山") {
      flow.active = false;
      flow.stopReason = "source_lost";
      continue;
    }
    const movedPath = [];
    const from = { x: flow.headX, y: flow.headY, key: flow.headKey };
    const visited = new Set([flow.sourceKey, ...flow.path.map(p => p.key)]);
    for (let step = 0; step < maxSteps; step += 1) {
      const picked = pickNextLavaStep(flow, grid, heightLevelMap, w, h, visited, maxTurnAngle);
      if (picked.stopReason) {
        flow.active = false;
        flow.stopReason = picked.stopReason;
        break;
      }
      const next = picked.step;
      const stepNode = { x: next.x, y: next.y, key: next.key };
      flow.path.push(stepNode);
      movedPath.push(stepNode);
      flow.headX = next.x;
      flow.headY = next.y;
      flow.headKey = next.key;
      if (!Number.isFinite(flow.directionAngle)) flow.directionAngle = next.angle;
      visited.add(next.key);
      if (Math.random() < stopChance) {
        flow.active = false;
        flow.stopReason = "random_stop";
        break;
      }
    }
    if (movedPath.length) {
      events.push({
        type: "lava",
        turn: turnNumber,
        sourceKey: flow.sourceKey,
        from,
        to: movedPath[movedPath.length - 1],
        length: movedPath.length,
        path: movedPath,
        stopped: flow.active === false,
        stopReason: flow.stopReason || ""
      });
    }
  }

  if ((options?.forceTestEvent === true) && events.length === 0) {
    const activeFlow = lavaState.flows.find(f => f.active);
    if (activeFlow) {
      const from = { x: activeFlow.headX, y: activeFlow.headY, key: activeFlow.headKey };
      const visited = new Set([activeFlow.sourceKey, ...activeFlow.path.map(p => p.key)]);
      const picked = pickNextLavaStep(activeFlow, grid, heightLevelMap, w, h, visited, maxTurnAngle);
      if (!picked.stopReason) {
        const next = picked.step;
        const stepNode = { x: next.x, y: next.y, key: next.key };
        activeFlow.path.push(stepNode);
        activeFlow.headX = next.x;
        activeFlow.headY = next.y;
        activeFlow.headKey = next.key;
        if (!Number.isFinite(activeFlow.directionAngle)) activeFlow.directionAngle = next.angle;
        events.push({
          type: "lava",
          turn: turnNumber,
          sourceKey: activeFlow.sourceKey,
          from,
          to: stepNode,
          length: 1,
          path: [stepNode],
          stopped: false,
          stopReason: "",
          forced: true
        });
      } else {
        activeFlow.active = false;
        activeFlow.stopReason = picked.stopReason;
      }
    }
  }

  const flowData = buildLavaFlowDataFromState(lavaState, w, h);
  return {
    lavaState,
    lavaMap: flowData.lavaMap,
    lavaFlowData: flowData.lavaFlowData,
    events
  };
}

function countTerrain(grid, terrainKey) {
  let count = 0;
  const h = grid.length;
  const w = h > 0 ? grid[0].length : 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] === terrainKey) count += 1;
    }
  }
  return count;
}

function countTrueCells(map) {
  if (!Array.isArray(map) || !map.length) return 0;
  let count = 0;
  for (let y = 0; y < map.length; y += 1) {
    for (let x = 0; x < map[y].length; x += 1) {
      if (map[y][x]) count += 1;
    }
  }
  return count;
}

function advanceTerrainTurn(data, options = {}) {
  if (!data || data.shapeOnly || !Number.isFinite(data.w) || !Number.isFinite(data.h)) {
    return { data, events: [] };
  }
  const w = data.w;
  const h = data.h;
  const turnNumber = Math.max(1, Math.floor(Number(data?.turnState?.turnNumber || 0)) + 1);
  const eventMode = String(options?.eventMode || "normal");
  const forceEruption = eventMode === "eruption" || eventMode === "both";
  const enableEruption = eventMode !== "lava";
  const forceLava = eventMode === "lava" || eventMode === "both";
  const enableLava = eventMode !== "eruption";
  const grid = cloneGrid2D(data.grid, data.grid);
  const heightLevelMap = cloneGrid2D(data.heightLevelMap, data.heightLevelMap);
  const prevLavaState = cloneLavaState(data?.lavaState);
  const volcanoRule = 地形生成設定.火山化 || {};
  const dormantMap = cloneGrid2D(
    data?.volcanoData?.dormantMap,
    buildDormantMapFromGrid(grid, w, h)
  );

  const eruptionEvents = enableEruption
    ? processVolcanoEruptionTurn(
      grid,
      w,
      h,
      dormantMap,
      heightLevelMap,
      volcanoRule,
      {
        turnNumber,
        forceTestEvent: forceEruption || options?.forceTestEvent === true
      }
    )
    : [];
  const lavaResult = enableLava
    ? buildLavaFlowTurn(grid, heightLevelMap, w, h, volcanoRule, prevLavaState, turnNumber, {
      forceTestEvent: forceLava || options?.forceTestEvent === true,
      allowCreateVolcano: true
    })
    : (() => {
      const flowData = buildLavaFlowDataFromState(prevLavaState, w, h);
      return {
        lavaState: prevLavaState,
        lavaMap: flowData.lavaMap,
        lavaFlowData: flowData.lavaFlowData,
        events: []
      };
    })();
  const lavaEvents = lavaResult.events;
  const events = [...eruptionEvents, ...lavaEvents];
  const prevVolcanoData = data.volcanoData || {};

  const nextData = {
    ...data,
    grid,
    heightLevelMap,
    lavaState: lavaResult.lavaState,
    lavaMap: lavaResult.lavaMap,
    lavaFlowData: lavaResult.lavaFlowData,
    turnState: {
      turnNumber,
      lastEventCount: events.length,
      lastEventMode: eventMode
    },
    volcanoData: {
      ...prevVolcanoData,
      dormantMap,
      dormantCount: countTrueCells(dormantMap),
      eruptedCount: (Number(prevVolcanoData.eruptedCount) || 0) + eruptionEvents.length,
      eruptedEvents: [...(Array.isArray(prevVolcanoData.eruptedEvents) ? prevVolcanoData.eruptedEvents : []), ...eruptionEvents],
      volcanoCount: countTerrain(grid, "火山")
    }
  };

  return {
    data: nextData,
    events
  };
}

function hasOtherIslandLandWithinDistance(grid, islandIdMap, w, h, x, y, islandId, maxDistance) {
  const safeDistance = Math.max(0, Math.floor(maxDistance || 0));
  if (safeDistance <= 0) return false;
  const startKey = coordKey(x, y);
  const queue = [{ x, y, d: 0 }];
  const visited = new Set([startKey]);
  while (queue.length) {
    const cur = queue.shift();
    if (!(cur.x === x && cur.y === y) && grid[cur.y][cur.x] !== "海") {
      const otherId = islandIdMap?.[cur.y]?.[cur.x];
      if (Number.isFinite(otherId) && otherId >= 0 && otherId !== islandId) return true;
    }
    if (cur.d >= safeDistance) continue;
    for (const n of getHexNeighborCoords(w, h, cur.x, cur.y)) {
      const key = coordKey(n.x, n.y);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x: n.x, y: n.y, d: cur.d + 1 });
    }
  }
  return false;
}

function smoothLandKeepingIslandSeparation(grid, w, h, islandIdMap, passCount, separationSeaTiles = 2) {
  if (!islandIdMap) return;
  for (let pass = 0; pass < passCount; pass += 1) {
    const nextGrid = grid.map(r => [...r]);
    const nextIdMap = islandIdMap.map(r => [...r]);
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        if (grid[y][x] !== "海") continue;
        const neighbors = getHexNeighborCoords(w, h, x, y);
        const landNeighbors = neighbors.filter(n => grid[n.y][n.x] !== "海");
        if (landNeighbors.length < 4) continue;
        const neighborIslandIds = new Set(
          landNeighbors
            .map(n => islandIdMap[n.y][n.x])
            .filter(id => Number.isFinite(id) && id >= 0)
        );
        // Different islands around the same sea cell -> keep as sea to avoid bridges.
        if (neighborIslandIds.size !== 1) continue;
        const islandId = [...neighborIslandIds][0];
        if (hasOtherIslandLandWithinDistance(grid, islandIdMap, w, h, x, y, islandId, separationSeaTiles)) continue;
        nextGrid[y][x] = "平地";
        nextIdMap[y][x] = islandId;
      }
    }
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        grid[y][x] = nextGrid[y][x];
        islandIdMap[y][x] = nextIdMap[y][x];
      }
    }
  }
}

function erodeLand(grid, w, h, erosionChance) {
  if (erosionChance <= 0) return;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      if (grid[y][x] === "海") continue;
      const landNear = getHexNeighbors(grid, x, y).filter(v => v !== "海").length;
      if (landNear <= 1 && Math.random() < erosionChance) grid[y][x] = "海";
    }
  }
}

function shuffledCopy(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function resolvePatternSeedCount(patternId, totalTiles) {
  const baseSeedCount = Math.max(2, Math.floor(totalTiles / 140));
  return patternId === "archipelago"
    ? baseSeedCount + 3
    : patternId === "continent"
      ? 2
      : patternId === "twins"
        ? 4
        : patternId === "chain"
          ? Math.max(4, baseSeedCount + 1)
          : baseSeedCount;
}

function resolveLargeIslandCount(totalTiles, patternId, requestedCount, rangeOverride = null) {
  const islandRule = 地形生成設定.島構成 || {};
  const range = rangeOverride || islandRule.大島数範囲 || {};
  const minCount = Math.max(1, Math.floor(Number.isFinite(range.最小) ? range.最小 : 1));
  const maxCount = Math.max(minCount, Math.floor(Number.isFinite(range.最大) ? range.最大 : 8));
  const fallbackCount = resolvePatternSeedCount(patternId, totalTiles);
  const configuredDefault = Math.floor(Number.isFinite(islandRule.大島数) ? islandRule.大島数 : 0);
  const raw = Number.isFinite(requestedCount) && requestedCount > 0
    ? requestedCount
    : (configuredDefault > 0 ? configuredDefault : fallbackCount);
  return clamp(Math.round(raw), minCount, maxCount);
}

function resolveCustomIsletSizeRange(targetLand, isletCount, minSize = 4, maxSize = 8) {
  const safeCount = Math.max(0, Math.floor(isletCount || 0));
  if (safeCount <= 0) {
    return {
      isletSizeMin: 0,
      isletSizeMax: 0,
      isletLandBudget: 0
    };
  }
  const ratio = 0.16;
  let budget = Math.round(targetLand * ratio);
  budget = clamp(budget, safeCount * minSize, safeCount * maxSize);
  const avg = budget / safeCount;
  let autoMin = clamp(Math.floor(avg) - 1, minSize, maxSize);
  let autoMax = clamp(Math.ceil(avg) + 1, autoMin, maxSize);
  if (autoMin === autoMax && autoMax < maxSize) autoMax += 1;
  return {
    isletSizeMin: autoMin,
    isletSizeMax: autoMax,
    isletLandBudget: budget
  };
}

function resolveCustomIslandPlan(totalTiles, patternId, settings) {
  if (!settings?.enabled) return null;
  const islandRule = 地形生成設定.島構成 || {};
  const largeRange = islandRule.大島数範囲 || {};
  const largeIslandCount = resolveLargeIslandCount(totalTiles, patternId, settings.largeIslandCount, largeRange);
  const rawRatio = normalizeProbability(settings.targetLandRatio, 0.5);
  const targetLandRatio = clamp(rawRatio || 0.5, 0.25, 0.6);

  const ruleCountRange = islandRule.孤島数ランダム || {};
  const countMinRaw = Number.isFinite(settings.isletCountMin) ? settings.isletCountMin : (
    Number.isFinite(ruleCountRange.最小) ? ruleCountRange.最小 : 1
  );
  const countMaxRaw = Number.isFinite(settings.isletCountMax) ? settings.isletCountMax : (
    Number.isFinite(ruleCountRange.最大) ? ruleCountRange.最大 : 5
  );
  const isletCountMin = Math.max(0, Math.floor(Math.min(countMinRaw, countMaxRaw)));
  const isletCountMax = Math.max(isletCountMin, Math.floor(Math.max(countMinRaw, countMaxRaw)));
  const isletCount = randomInt(isletCountMin, isletCountMax);
  const targetLand = Math.max(largeIslandCount, Math.floor(totalTiles * targetLandRatio));
  const isletSizing = resolveCustomIsletSizeRange(targetLand, isletCount, 4, 8);
  const minGap = Math.max(2, Math.floor(
    Number.isFinite(settings.largeIslandMinGap)
      ? settings.largeIslandMinGap
      : (Number.isFinite(islandRule.大島間最小距離) ? islandRule.大島間最小距離 : 6)
  ));

  return {
    largeIslandCount,
    targetLandRatio,
    targetLand,
    minGap,
    isletCount,
    ...isletSizing
  };
}

function buildSeedListForLargeIslands(patternId, w, h, largeIslandCount, minGap) {
  const sourceSeedCount = Math.max(largeIslandCount + 4, largeIslandCount * 2);
  const source = uniqueCoords([
    ...buildPatternSeeds(patternId, w, h, sourceSeedCount),
    ...Array.from({ length: sourceSeedCount }, () => randomInteriorCell(w, h))
  ], w, h);

  const selected = [];
  for (const seed of shuffledCopy(source)) {
    if (selected.every(p => manhattanDistance(p, seed) >= minGap)) {
      selected.push(seed);
    }
    if (selected.length >= largeIslandCount) break;
  }

  let guard = 0;
  while (selected.length < largeIslandCount && guard < largeIslandCount * 16) {
    const seed = randomInteriorCell(w, h);
    const key = coordKey(seed.x, seed.y);
    if (!selected.some(s => coordKey(s.x, s.y) === key)) {
      selected.push(seed);
    }
    guard += 1;
  }
  return selected.slice(0, largeIslandCount);
}

function buildTwinsSeeds(w, h) {
  const cy = Math.floor(h / 2);
  return uniqueCoords([
    { x: Math.floor(w * 0.30), y: clamp(cy + randomInt(-2, 2), 1, Math.max(1, h - 2)) },
    { x: Math.floor(w * 0.70), y: clamp(cy + randomInt(-2, 2), 1, Math.max(1, h - 2)) }
  ], w, h);
}

function buildJapanLikeChainSeeds(w, h, count) {
  const seedCount = Math.max(4, count);
  const seeds = [];
  for (let i = 0; i < seedCount; i += 1) {
    const t = seedCount <= 1 ? 0.5 : i / (seedCount - 1);
    const xBase = (w * 0.17) + ((w * 0.66) * t);
    const yLine = (h * 0.74) - ((h * 0.50) * t);
    const wave = Math.sin((t * Math.PI * 2.2) + 0.4) * (h * 0.06);
    const x = clamp(Math.round(xBase + randomInt(-1, 1)), 1, Math.max(1, w - 2));
    const y = clamp(Math.round(yLine + wave + randomInt(-1, 1)), 1, Math.max(1, h - 2));
    seeds.push({ x, y });
  }
  return uniqueCoords(seeds, w, h);
}

function buildLargeIslandTargetSizes(totalLand, largeIslandCount, _patternId, plannedIsletLand) {
  const targetLand = Math.max(largeIslandCount, Math.floor(totalLand - plannedIsletLand));
  if (largeIslandCount <= 1) return [targetLand];

  const base = targetLand / largeIslandCount;
  let minPerIsland = Math.max(1, Math.floor(base * 0.75));
  let maxPerIsland = Math.max(minPerIsland, Math.ceil(base * 1.25));
  if (minPerIsland * largeIslandCount > targetLand) {
    minPerIsland = Math.max(1, Math.floor(targetLand / largeIslandCount));
  }
  if (maxPerIsland * largeIslandCount < targetLand) {
    maxPerIsland = Math.max(minPerIsland, Math.ceil(targetLand / largeIslandCount));
  }

  const rows = Array.from({ length: largeIslandCount }, (_, index) => {
    const variance = 0.75 + (Math.random() * 0.5); // 75% - 125%
    const desired = base * variance;
    const initial = clamp(Math.floor(desired), minPerIsland, maxPerIsland);
    return { index, desired, target: initial, rand: Math.random() };
  });

  let currentTotal = rows.reduce((sum, row) => sum + row.target, 0);
  if (currentTotal < targetLand) {
    const addOrder = [...rows].sort((a, b) => (
      (b.desired - b.target) - (a.desired - a.target)
      || b.rand - a.rand
    ));
    let guard = 0;
    while (currentTotal < targetLand && guard < targetLand * 4) {
      let progressed = false;
      for (const row of addOrder) {
        if (currentTotal >= targetLand) break;
        if (row.target >= maxPerIsland) continue;
        row.target += 1;
        currentTotal += 1;
        progressed = true;
      }
      if (!progressed) break;
      guard += 1;
    }
  } else if (currentTotal > targetLand) {
    const reduceOrder = [...rows].sort((a, b) => (
      (a.desired - a.target) - (b.desired - b.target)
      || a.rand - b.rand
    ));
    let guard = 0;
    while (currentTotal > targetLand && guard < currentTotal * 4) {
      let progressed = false;
      for (const row of reduceOrder) {
        if (currentTotal <= targetLand) break;
        if (row.target <= minPerIsland) continue;
        row.target -= 1;
        currentTotal -= 1;
        progressed = true;
      }
      if (!progressed) break;
      guard += 1;
    }
  }

  // Safety: keep sum exactly equal to targetLand.
  if (currentTotal !== targetLand) {
    const order = shuffledCopy(rows.map(row => row.index));
    let i = 0;
    while (currentTotal < targetLand && order.length) {
      const row = rows[order[i % order.length]];
      row.target += 1;
      currentTotal += 1;
      i += 1;
    }
    i = 0;
    while (currentTotal > targetLand && order.length) {
      const row = rows[order[i % order.length]];
      if (row.target > 1) {
        row.target -= 1;
        currentTotal -= 1;
      }
      i += 1;
      if (i > targetLand * 4) break;
    }
  }

  return rows
    .sort((a, b) => a.index - b.index)
    .map(row => row.target);
}

function canFillForIsland(grid, islandIdMap, w, h, x, y, islandId, separationSeaTiles) {
  if (isEdge(x, y, w, h)) return false;
  if (grid[y][x] !== "海") return false;
  const neighbors = getHexNeighborCoords(w, h, x, y);
  let ownAdjacent = false;
  for (const n of neighbors) {
    if (grid[n.y][n.x] === "海") continue;
    const neighborIslandId = islandIdMap[n.y][n.x];
    if (neighborIslandId !== islandId) return false;
    ownAdjacent = true;
  }
  if (!ownAdjacent) return false;
  if (hasOtherIslandLandWithinDistance(grid, islandIdMap, w, h, x, y, islandId, separationSeaTiles)) return false;
  return ownAdjacent;
}

function placeLargeIslands(grid, w, h, cfg, patternId, targetLand, largeIslandCount, plan = null) {
  const islandRule = 地形生成設定.島構成 || {};
  const minGap = Math.max(2, Math.floor(
    Number.isFinite(plan?.minGap)
      ? plan.minGap
      : (Number.isFinite(islandRule.大島間最小距離) ? islandRule.大島間最小距離 : 6)
  ));
  const separationSeaTiles = Math.max(0, Math.floor(
    Number.isFinite(plan?.separationSeaTiles)
      ? plan.separationSeaTiles
      : (Number.isFinite(islandRule.島間海マス) ? islandRule.島間海マス : 2)
  ));
  const islandIdMap = buildInitialGrid(w, h, -1);
  const plannedIsletCountRange = islandRule.孤島数ランダム || {};
  const plannedIsletMin = Math.max(0, Math.floor(Number.isFinite(plannedIsletCountRange.最小) ? plannedIsletCountRange.最小 : 1));
  const plannedIsletMax = Math.max(plannedIsletMin, Math.floor(Number.isFinite(plannedIsletCountRange.最大) ? plannedIsletCountRange.最大 : 5));
  const isletSizeRule = islandRule.孤島サイズ || {};
  const plannedIsletCount = Number.isFinite(plan?.isletCount)
    ? Math.max(0, Math.floor(plan.isletCount))
    : randomInt(plannedIsletMin, plannedIsletMax);
  const isletSizeMin = Number.isFinite(plan?.isletSizeMin)
    ? Math.max(1, Math.floor(plan.isletSizeMin))
    : Math.max(1, Math.floor(Number.isFinite(isletSizeRule.最小) ? isletSizeRule.最小 : 4));
  const isletSizeMax = Number.isFinite(plan?.isletSizeMax)
    ? Math.max(isletSizeMin, Math.floor(plan.isletSizeMax))
    : Math.max(isletSizeMin, Math.floor(Number.isFinite(isletSizeRule.最大) ? isletSizeRule.最大 : 8));
  const plannedIsletLand = Number.isFinite(plan?.isletLandBudget)
    ? Math.max(0, Math.floor(plan.isletLandBudget))
    : plannedIsletCount * Math.round((isletSizeMin + isletSizeMax) / 2);
  const islandTargets = buildLargeIslandTargetSizes(targetLand, largeIslandCount, patternId, plannedIsletLand);
  const customSeeds = Array.isArray(plan?.seedList) && plan.seedList.length
    ? uniqueCoords(plan.seedList, w, h)
    : [];
  const seeds = customSeeds.length >= largeIslandCount
    ? customSeeds.slice(0, largeIslandCount)
    : buildSeedListForLargeIslands(patternId, w, h, largeIslandCount, minGap);
  const frontiers = [];
  const placedPerIsland = new Array(largeIslandCount).fill(0);
  let landCount = 0;

  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i];
    if (!seed || isEdge(seed.x, seed.y, w, h)) continue;
    grid[seed.y][seed.x] = "平地";
    islandIdMap[seed.y][seed.x] = i;
    frontiers[i] = [seed];
    placedPerIsland[i] = 1;
    landCount += 1;
  }

  const growthChance = clamp(cfg.growth + 0.12, 0.35, 0.98);
  let guard = Math.max(4000, targetLand * 40);
  const maxStagnantRounds = Math.max(20, largeIslandCount * 12);
  let stagnantRounds = 0;
  while (landCount < targetLand && guard > 0) {
    guard -= 1;
    let progressed = false;
    const order = shuffledCopy(Array.from({ length: largeIslandCount }, (_, i) => i));
    for (const islandId of order) {
      if (placedPerIsland[islandId] >= islandTargets[islandId]) continue;
      const frontier = frontiers[islandId] || [];
      if (!frontier.length) continue;
      const trialCount = Math.max(4, Math.min(14, Math.floor(frontier.length * 0.12) + 1));
      let expanded = false;
      for (let trial = 0; trial < trialCount && frontier.length; trial += 1) {
        const current = randomFrom(frontier);
        if (!current) break;
        const neighbors = shuffledCopy(getHexNeighborCoords(w, h, current.x, current.y));
        let expandedFromCurrent = false;
        for (const n of neighbors) {
          if (landCount >= targetLand) break;
          if (Math.random() > growthChance) continue;
          if (!canFillForIsland(grid, islandIdMap, w, h, n.x, n.y, islandId, separationSeaTiles)) continue;
          grid[n.y][n.x] = "平地";
          islandIdMap[n.y][n.x] = islandId;
          frontier.push({ x: n.x, y: n.y });
          placedPerIsland[islandId] += 1;
          landCount += 1;
          expandedFromCurrent = true;
          expanded = true;
          progressed = true;
          break;
        }
        if (expandedFromCurrent) break;
        if (Math.random() < 0.55) {
          const idx = frontier.indexOf(current);
          if (idx >= 0) frontier.splice(idx, 1);
        }
      }
    }
    if (!progressed) stagnantRounds += 1;
    else stagnantRounds = 0;
    if (stagnantRounds >= maxStagnantRounds) break;
  }

  return {
    islandIdMap,
    placedPerIsland,
    plannedIsletCount,
    isletSizeMin,
    isletSizeMax,
    plannedIsletLand,
    separationSeaTiles,
    nextIslandId: largeIslandCount,
    landCount
  };
}

function canFillForIslet(grid, islandIdMap, w, h, x, y, isletId, isletSet, separationSeaTiles) {
  if (isEdge(x, y, w, h)) return false;
  if (grid[y][x] !== "海") return false;
  const neighbors = getHexNeighborCoords(w, h, x, y);
  for (const n of neighbors) {
    if (grid[n.y][n.x] === "海") continue;
    const nId = islandIdMap[n.y][n.x];
    const key = coordKey(n.x, n.y);
    if (nId !== isletId || !isletSet.has(key)) return false;
  }
  if (hasOtherIslandLandWithinDistance(grid, islandIdMap, w, h, x, y, isletId, separationSeaTiles)) return false;
  return true;
}

function growIslet(grid, islandIdMap, w, h, seed, isletId, targetSize, minSize, separationSeaTiles) {
  if (!seed) return 0;
  if (grid[seed.y][seed.x] !== "海" || isEdge(seed.x, seed.y, w, h)) return 0;
  const placed = [];
  const placedSet = new Set();
  const frontier = [];

  grid[seed.y][seed.x] = "平地";
  islandIdMap[seed.y][seed.x] = isletId;
  placed.push(seed);
  placedSet.add(coordKey(seed.x, seed.y));
  frontier.push(seed);

  let guard = Math.max(40, targetSize * 18);
  while (placed.length < targetSize && frontier.length && guard > 0) {
    guard -= 1;
    const current = randomFrom(frontier);
    if (!current) break;
    const neighbors = shuffledCopy(getHexNeighborCoords(w, h, current.x, current.y));
    let expanded = false;
    for (const n of neighbors) {
      if (Math.random() > 0.82) continue;
      if (!canFillForIslet(grid, islandIdMap, w, h, n.x, n.y, isletId, placedSet, separationSeaTiles)) continue;
      grid[n.y][n.x] = "平地";
      islandIdMap[n.y][n.x] = isletId;
      placed.push({ x: n.x, y: n.y });
      placedSet.add(coordKey(n.x, n.y));
      frontier.push({ x: n.x, y: n.y });
      expanded = true;
      break;
    }
    if (!expanded && Math.random() < 0.5) {
      const idx = frontier.indexOf(current);
      if (idx >= 0) frontier.splice(idx, 1);
    }
  }

  if (placed.length >= minSize) return placed.length;
  for (const cell of placed) {
    grid[cell.y][cell.x] = "海";
    islandIdMap[cell.y][cell.x] = -1;
  }
  return 0;
}

function addRandomIslets(grid, w, h, islandIdMap, startId, plannedCount, minSize, maxSize, separationSeaTiles) {
  const isletRule = 地形生成設定.島構成 || {};
  const maxAttempts = Math.max(8, Math.floor(isletRule.孤島試行回数 || 36));
  let actualCount = 0;
  let nextId = startId;
  const sizes = [];

  for (let i = 0; i < plannedCount; i += 1) {
    let placed = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const seed = randomInteriorCell(w, h);
      if (grid[seed.y][seed.x] !== "海") continue;
      if (hasOtherIslandLandWithinDistance(grid, islandIdMap, w, h, seed.x, seed.y, nextId, separationSeaTiles)) continue;
      if (getHexNeighborCoords(w, h, seed.x, seed.y).some(n => grid[n.y][n.x] !== "海")) continue;
      const targetSize = randomInt(minSize, maxSize);
      placed = growIslet(grid, islandIdMap, w, h, seed, nextId, targetSize, minSize, separationSeaTiles);
      if (placed >= minSize) {
        actualCount += 1;
        nextId += 1;
        sizes.push(placed);
        break;
      }
    }
  }

  return { actualCount, sizes };
}

function generateIslands(grid, w, h, totalTiles, patternId = "balanced", options = {}) {
  const cfg = 島パターン定義[patternId] || 島パターン定義.balanced;
  const patternTargetLand = Math.floor(totalTiles * (cfg.landMin + Math.random() * (cfg.landMax - cfg.landMin)));
  const legacyLargeIslandCount = Number.isFinite(options?.largeIslandCount) ? options.largeIslandCount : NaN;
  const useLegacyConfiguredLargeIslands = Number.isFinite(legacyLargeIslandCount) && legacyLargeIslandCount > 0;
  const customPlan = resolveCustomIslandPlan(totalTiles, patternId, options?.islandCustomSettings);
  const useCustomPlan = !!customPlan;
  const interiorCap = Math.max(1, (w - 2) * (h - 2));

  if (!useCustomPlan && !useLegacyConfiguredLargeIslands && patternId === "realistic") {
    generateRealisticIsland(grid, w, h, patternTargetLand, cfg);
    return {
      patternName: cfg.name,
      islandGenerationInfo: {
        mode: "pattern",
        customApplied: false,
        targetLandRatio: null,
        largeIslandRequested: 1,
        largeIslandActual: 1,
        isletRequested: 0,
        isletActual: 0,
        isletMinSize: 0,
        isletMaxSize: 0
      }
    };
  }

  if (!useCustomPlan && !useLegacyConfiguredLargeIslands && (patternId === "twins" || patternId === "chain")) {
    const largeIslandCount = patternId === "twins"
      ? 2
      : clamp(resolvePatternSeedCount(patternId, totalTiles), 4, 8);
    const customSeeds = patternId === "twins"
      ? buildTwinsSeeds(w, h)
      : buildJapanLikeChainSeeds(w, h, largeIslandCount);
    const minGap = patternId === "twins"
      ? Math.max(5, Math.floor(Math.min(w, h) * 0.20))
      : Math.max(3, Math.floor(Math.min(w, h) * 0.10));
    const main = placeLargeIslands(
      grid,
      w,
      h,
      cfg,
      patternId,
      patternTargetLand,
      largeIslandCount,
      {
        minGap,
        isletCount: 0,
        isletSizeMin: 4,
        isletSizeMax: 8,
        isletLandBudget: 0,
        seedList: customSeeds
      }
    );
    smoothLandKeepingIslandSeparation(
      grid,
      w,
      h,
      main.islandIdMap,
      Math.max(1, cfg.smoothingPasses || 1),
      main.separationSeaTiles
    );
    erodeLand(grid, w, h, Math.max(cfg.erosionChance || 0, 0.01));
    return {
      patternName: cfg.name,
      islandGenerationInfo: {
        mode: "pattern-separated",
        customApplied: false,
        targetLandRatio: null,
        targetLandTiles: patternTargetLand,
        largeIslandRequested: largeIslandCount,
        largeIslandActual: main.placedPerIsland.filter(v => v >= 1).length,
        isletRequested: 0,
        isletActual: 0,
        isletMinSize: 0,
        isletMaxSize: 0,
        isletLandBudget: 0
      }
    };
  }

  if (useCustomPlan || useLegacyConfiguredLargeIslands) {
    const largeIslandCount = useCustomPlan
      ? customPlan.largeIslandCount
      : resolveLargeIslandCount(totalTiles, patternId, legacyLargeIslandCount);
    const effectiveTargetLand = useCustomPlan
      ? clamp(customPlan.targetLand, largeIslandCount, interiorCap)
      : patternTargetLand;
    const customPlacementPlan = useCustomPlan
      ? {
          minGap: customPlan.minGap,
          isletCount: customPlan.isletCount,
          isletSizeMin: customPlan.isletSizeMin,
          isletSizeMax: customPlan.isletSizeMax,
          isletLandBudget: customPlan.isletLandBudget
        }
      : null;
    const main = placeLargeIslands(
      grid,
      w,
      h,
      cfg,
      patternId,
      effectiveTargetLand,
      largeIslandCount,
      customPlacementPlan
    );
    const islets = addRandomIslets(
      grid,
      w,
      h,
      main.islandIdMap,
      main.nextIslandId,
      main.plannedIsletCount,
      main.isletSizeMin,
      main.isletSizeMax,
      main.separationSeaTiles
    );
    smoothLandKeepingIslandSeparation(
      grid,
      w,
      h,
      main.islandIdMap,
      Math.max(1, cfg.smoothingPasses || 1),
      main.separationSeaTiles
    );
    erodeLand(grid, w, h, Math.max(cfg.erosionChance || 0, 0.01));
    return {
      patternName: cfg.name,
      islandGenerationInfo: {
        mode: useCustomPlan ? "custom" : "legacy-config",
        customApplied: useCustomPlan,
        targetLandRatio: useCustomPlan ? customPlan.targetLandRatio : null,
        targetLandTiles: useCustomPlan ? effectiveTargetLand : patternTargetLand,
        largeIslandRequested: largeIslandCount,
        largeIslandActual: main.placedPerIsland.filter(v => v >= 1).length,
        isletRequested: main.plannedIsletCount,
        isletActual: islets.actualCount,
        isletMinSize: main.isletSizeMin,
        isletMaxSize: main.isletSizeMax,
        isletLandBudget: main.plannedIsletLand
      }
    };
  }
  const seedCount = resolvePatternSeedCount(patternId, totalTiles);

  const frontier = [];
  let landCount = 0;
  const seeds = buildPatternSeeds(patternId, w, h, seedCount);
  for (const seed of seeds) {
    grid[seed.y][seed.x] = "平地";
    landCount += 1;
    frontier.push(seed);
  }

  while (landCount < patternTargetLand && frontier.length) {
    const current = randomFrom(frontier);
    if (!current) break;
    const neighbors = getHexNeighborCoords(w, h, current.x, current.y);
    let expanded = false;
    for (const n of neighbors) {
      if (landCount >= patternTargetLand) break;
      if (isEdge(n.x, n.y, w, h)) continue;
      if (grid[n.y][n.x] !== "海") continue;
      if (Math.random() < cfg.growth) {
        grid[n.y][n.x] = "平地";
        landCount += 1;
        frontier.push(n);
        expanded = true;
      }
    }
    if (!expanded && Math.random() < 0.35) frontier.splice(frontier.indexOf(current), 1);
  }

  smoothLand(grid, w, h, cfg.smoothingPasses);
  erodeLand(grid, w, h, cfg.erosionChance);
  return {
    patternName: cfg.name,
    islandGenerationInfo: {
      mode: "pattern",
      customApplied: false,
      targetLandRatio: null,
      largeIslandRequested: 0,
      largeIslandActual: 0,
      isletRequested: 0,
      isletActual: 0,
      isletMinSize: 0,
      isletMaxSize: 0
    }
  };
}

function listCoordsByTerrain(grid, key) {
  const result = [];
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[0].length; x += 1) {
      if (grid[y][x] === key) result.push({ x, y });
    }
  }
  return result;
}

function minDistanceToTargets(x, y, targets) {
  let best = Number.POSITIVE_INFINITY;
  for (const t of targets) {
    const d = Math.abs(t.x - x) + Math.abs(t.y - y);
    if (d < best) best = d;
  }
  return best;
}

function listLandCoords(grid) {
  const result = [];
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[0].length; x += 1) {
      if (grid[y][x] !== "海") result.push({ x, y });
    }
  }
  return result;
}

function buildLandComponents(grid, w, h) {
  const idMap = buildInitialGrid(w, h, -1);
  const components = [];
  let id = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] === "海" || idMap[y][x] !== -1) continue;
      const queue = [{ x, y }];
      const cells = [];
      idMap[y][x] = id;

      while (queue.length) {
        const cur = queue.shift();
        cells.push(cur);
        const neighbors = getHexNeighborCoords(w, h, cur.x, cur.y);
        for (const n of neighbors) {
          if (grid[n.y][n.x] === "海" || idMap[n.y][n.x] !== -1) continue;
          idMap[n.y][n.x] = id;
          queue.push({ x: n.x, y: n.y });
        }
      }

      const cx = cells.reduce((sum, c) => sum + c.x, 0) / Math.max(1, cells.length);
      const cy = cells.reduce((sum, c) => sum + c.y, 0) / Math.max(1, cells.length);
      const maxDist = Math.max(
        1,
        cells.reduce((best, c) => Math.max(best, Math.hypot(c.x - cx, c.y - cy)), 0)
      );
      components.push({
        id,
        cells,
        size: cells.length,
        cx,
        cy,
        maxDist
      });
      id += 1;
    }
  }

  return { idMap, components };
}

function buildTerrainComponents(grid, w, h, terrainKey) {
  const idMap = buildInitialGrid(w, h, -1);
  const components = [];
  let id = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] !== terrainKey || idMap[y][x] !== -1) continue;
      const queue = [{ x, y }];
      const cells = [];
      idMap[y][x] = id;

      while (queue.length) {
        const cur = queue.shift();
        cells.push(cur);
        const neighbors = getHexNeighborCoords(w, h, cur.x, cur.y);
        for (const n of neighbors) {
          if (grid[n.y][n.x] !== terrainKey || idMap[n.y][n.x] !== -1) continue;
          idMap[n.y][n.x] = id;
          queue.push({ x: n.x, y: n.y });
        }
      }

      const cx = cells.reduce((sum, c) => sum + c.x, 0) / Math.max(1, cells.length);
      const cy = cells.reduce((sum, c) => sum + c.y, 0) / Math.max(1, cells.length);
      components.push({ id, cells, size: cells.length, cx, cy });
      id += 1;
    }
  }
  return { idMap, components };
}

function pickNearestCellToCenter(cells, cx, cy) {
  if (!cells?.length) return null;
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of cells) {
    const d = Math.hypot(c.x - cx, c.y - cy);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function listCellsAtHexDistance(w, h, sx, sy, targetDistance) {
  const distTarget = Math.max(0, Math.floor(targetDistance || 0));
  const result = [];
  const queue = [{ x: sx, y: sy, d: 0 }];
  const visited = new Set([`${sx},${sy}`]);

  while (queue.length) {
    const cur = queue.shift();
    if (cur.d === distTarget) {
      result.push({ x: cur.x, y: cur.y });
      continue;
    }
    if (cur.d > distTarget) continue;
    for (const n of getHexNeighborCoords(w, h, cur.x, cur.y)) {
      const key = `${n.x},${n.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x: n.x, y: n.y, d: cur.d + 1 });
    }
  }
  return result.filter(c => !(c.x === sx && c.y === sy));
}

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function buildClusterSizes(total, minClusters) {
  const safeTotal = Math.max(total, minClusters);
  const clusters = Math.max(minClusters, Math.min(minClusters + 3, Math.floor(safeTotal / 3)));
  const sizes = new Array(clusters).fill(1);
  let remain = safeTotal - clusters;
  while (remain > 0) {
    const i = Math.floor(Math.random() * sizes.length);
    sizes[i] += 1;
    remain -= 1;
  }
  return sizes;
}

function pickClusterSeed(grid, existingSeeds, candidateFilter, minGap) {
  const candidates = listLandCoords(grid).filter(c => candidateFilter(c.x, c.y));
  if (!candidates.length) return null;
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  for (const c of shuffled) {
    const ok = existingSeeds.every(s => manhattanDistance(s, c) >= minGap);
    if (ok) return c;
  }
  return randomFrom(candidates);
}

function growClusterFromSeed(grid, w, h, terrainKey, seed, targetSize, canFill) {
  if (!seed || targetSize <= 0) return 0;
  const frontier = [];
  let placed = 0;

  if (canFill(seed.x, seed.y)) {
    grid[seed.y][seed.x] = terrainKey;
    frontier.push(seed);
    placed += 1;
  }

  while (placed < targetSize && frontier.length) {
    const current = randomFrom(frontier);
    if (!current) break;
    const neighbors = getHexNeighborCoords(w, h, current.x, current.y).sort(() => Math.random() - 0.5);
    let expanded = false;
    for (const n of neighbors) {
      if (placed >= targetSize) break;
      if (!canFill(n.x, n.y)) continue;
      if (Math.random() < 0.72) {
        grid[n.y][n.x] = terrainKey;
        frontier.push(n);
        placed += 1;
        expanded = true;
      }
    }
    if (!expanded && Math.random() < 0.35) {
      frontier.splice(frontier.indexOf(current), 1);
    }
  }
  return placed;
}

function growClusters(grid, w, h, terrainKey, targetCount, seedFilter, canFill) {
  if (targetCount <= 0) return 0;
  const frontier = [];
  let placed = 0;

  const land = listLandCoords(grid).filter(c => seedFilter(c.x, c.y));
  const seedCount = Math.max(1, Math.min(8, Math.floor(targetCount / 8)));
  for (let i = 0; i < seedCount; i += 1) {
    const seed = randomFrom(land);
    if (!seed) continue;
    if (canFill(seed.x, seed.y)) {
      grid[seed.y][seed.x] = terrainKey;
      frontier.push(seed);
      placed += 1;
    }
  }

  while (placed < targetCount && frontier.length) {
    const current = randomFrom(frontier);
    if (!current) break;
    const neighbors = getHexNeighborCoords(w, h, current.x, current.y);
    let expanded = false;
    for (const n of neighbors) {
      if (placed >= targetCount) break;
      if (!canFill(n.x, n.y)) continue;
      if (Math.random() < 0.62) {
        grid[n.y][n.x] = terrainKey;
        frontier.push(n);
        placed += 1;
        expanded = true;
      }
    }
    if (!expanded && Math.random() < 0.4) {
      frontier.splice(frontier.indexOf(current), 1);
    }
  }
  return placed;
}

function countTerrainInCoordSet(grid, terrainKey, coordSet) {
  if (!coordSet) return listCoordsByTerrain(grid, terrainKey).length;
  let count = 0;
  for (const key of coordSet) {
    const [x, y] = key.split(",").map(Number);
    if (grid?.[y]?.[x] === terrainKey) count += 1;
  }
  return count;
}

function topUpForestToTarget(grid, reliefMap, w, h, targetForestCount, allowedCoordSet = null) {
  let currentForest = countTerrainInCoordSet(grid, "森", allowedCoordSet);
  const target = Math.max(0, Math.floor(targetForestCount || 0));
  if (currentForest >= target) return currentForest;

  const canBecomeForest = (x, y) => {
    if (allowedCoordSet && !allowedCoordSet.has(coordKey(x, y))) return false;
    if (grid[y][x] === "森" || grid[y][x] === "海" || grid[y][x] === "湖" || grid[y][x] === "河川" || grid[y][x] === "砂漠") {
      return false;
    }
    const relief = reliefMap?.[y]?.[x];
    if (relief !== "平地" && relief !== "丘陵" && relief !== "山岳") return false;
    const mountainNear = countAround(reliefMap, x, y, "山岳");
    return relief === "山岳" ? mountainNear <= 3 : mountainNear <= 2;
  };

  while (currentForest < target) {
    let best = null;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!canBecomeForest(x, y)) continue;
        const forestNear = countAround(grid, x, y, "森");
        const seaNear = countAround(grid, x, y, "海");
        const relief = reliefMap?.[y]?.[x];
        const reliefBonus = relief === "丘陵" ? 0.28 : relief === "山岳" ? 0.16 : 0;
        const score = (forestNear * 2.2) + reliefBonus - (seaNear * 0.7) + (Math.random() * 0.08);
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    if (!best) break;
    grid[best.y][best.x] = "森";
    currentForest += 1;
  }
  return currentForest;
}

function buildMountainMassSizes(modeDef) {
  const rule = 地形生成設定.山岳塊;
  const normalRange = readRangeValue(modeDef?.通常塊サイズ, rule.通常塊サイズ, 3, 8);
  const giantRange = readRangeValue(modeDef?.巨大塊サイズ, rule.巨大塊サイズ, 12, 15);
  const groupCountRange = readRangeValue(modeDef?.塊数, rule.群峰塊数, 2, 6);
  const mixedExtraRange = readRangeValue(modeDef?.追加塊数, rule.混合追加塊数, 1, 4);
  const mixedGiantCountRange = readRangeValue(modeDef?.巨大塊数, { 最小: 1, 最大: 1 }, 1, 1);
  const sizes = [];

  if (modeDef?.key === "single") {
    const singleCountRange = readRangeValue(modeDef?.塊数, { 最小: 1, 最大: 1 }, 1, 1);
    const singleCount = randomInt(singleCountRange.min, singleCountRange.max);
    for (let i = 0; i < singleCount; i += 1) {
      sizes.push(randomInt(giantRange.min, giantRange.max));
    }
    return sizes;
  }

  if (modeDef?.key === "multi") {
    const massCount = randomInt(groupCountRange.min, groupCountRange.max);
    for (let i = 0; i < massCount; i += 1) sizes.push(randomInt(normalRange.min, normalRange.max));
    return sizes;
  }

  const giantCount = randomInt(mixedGiantCountRange.min, mixedGiantCountRange.max);
  for (let i = 0; i < giantCount; i += 1) {
    sizes.push(randomInt(giantRange.min, giantRange.max));
  }
  const extraCount = randomInt(mixedExtraRange.min, mixedExtraRange.max);
  for (let i = 0; i < extraCount; i += 1) sizes.push(randomInt(normalRange.min, normalRange.max));
  return sizes;
}

function resolveMountainGapRange(modeDef, mapW, mapH) {
  const base = readRangeValue(modeDef?.塊間最小距離, 地形生成設定.山岳塊?.塊間最小距離, 1, 2);
  const scaleRule = modeDef?.距離倍率;
  if (!scaleRule) return base;

  const side = Math.max(mapW || 0, mapH || 0);
  const baseSize = Number.isFinite(scaleRule.基準サイズ) ? scaleRule.基準サイズ : NaN;
  const maxSize = Number.isFinite(scaleRule.拡張サイズ) ? scaleRule.拡張サイズ : NaN;
  const baseRate = Number.isFinite(scaleRule.基準倍率) ? scaleRule.基準倍率 : NaN;
  const maxRate = Number.isFinite(scaleRule.拡張倍率) ? scaleRule.拡張倍率 : NaN;
  if (!Number.isFinite(baseSize) || !Number.isFinite(maxSize) || !Number.isFinite(baseRate) || !Number.isFinite(maxRate)) {
    return base;
  }

  let rate = baseRate;
  if (maxSize > baseSize) {
    if (side <= baseSize) rate = baseRate;
    else if (side >= maxSize) rate = maxRate;
    else {
      const t = (side - baseSize) / (maxSize - baseSize);
      rate = baseRate + ((maxRate - baseRate) * t);
    }
  }

  const min = Math.max(1, Math.round(base.min * rate));
  const max = Math.max(min, Math.round(base.max * rate));
  return { min, max };
}

function applyFoothillHillsFromMountains(grid, 高度マップ, targetHillCount, hillChance, allowedCoordSet = null) {
  const h = grid.length;
  const w = grid[0].length;
  const candidates = [];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (allowedCoordSet && !allowedCoordSet.has(coordKey(x, y))) continue;
      if (grid[y][x] === "海" || grid[y][x] === "山岳" || grid[y][x] === "丘陵") continue;
      const mountainNear = countAround(grid, x, y, "山岳");
      if (mountainNear <= 0) continue;
      const rawHeight = Number.isFinite(高度マップ?.[y]?.[x]) ? 高度マップ[y][x] : 0;
      candidates.push({
        x,
        y,
        mountainNear,
        rawHeight,
        rand: Math.random()
      });
    }
  }

  candidates.sort((a, b) => (
    b.mountainNear - a.mountainNear
    || b.rawHeight - a.rawHeight
    || b.rand - a.rand
  ));

  let placed = 0;
  for (const c of candidates) {
    if (placed >= targetHillCount) break;
    if (Math.random() > hillChance) continue;
    grid[c.y][c.x] = "丘陵";
    placed += 1;
  }
  return placed;
}

function ensureIslandRelief(grid, 高度マップ, minIslandSize, minReliefTiles) {
  const h = grid.length;
  const w = grid[0].length;
  const safeMinIslandSize = Math.max(1, Math.floor(minIslandSize || 1));
  const safeMinReliefTiles = Math.max(0, Math.floor(minReliefTiles || 0));
  if (safeMinReliefTiles <= 0) return 0;

  const { components } = buildLandComponents(grid, w, h);
  let placed = 0;
  for (const comp of components) {
    if (comp.size < safeMinIslandSize) continue;
    let reliefCount = 0;
    for (const c of comp.cells) {
      const t = grid[c.y][c.x];
      if (t === "山岳" || t === "丘陵") reliefCount += 1;
    }
    if (reliefCount >= safeMinReliefTiles) continue;

    const need = safeMinReliefTiles - reliefCount;
    const candidates = comp.cells
      .filter(c => grid[c.y][c.x] !== "山岳" && grid[c.y][c.x] !== "丘陵" && grid[c.y][c.x] !== "海")
      .map(c => ({
        ...c,
        h: Number.isFinite(高度マップ?.[c.y]?.[c.x]) ? 高度マップ[c.y][c.x] : 0,
        r: Math.random()
      }))
      .sort((a, b) => b.h - a.h || b.r - a.r);

    for (let i = 0; i < need; i += 1) {
      const target = candidates[i];
      if (!target) break;
      grid[target.y][target.x] = "丘陵";
      placed += 1;
    }
  }
  return placed;
}

function buildMountainProfile(山岳上限枚数, preferredMode = "random", mapW = 36, mapH = 36) {
  const rule = 地形生成設定.山岳塊;
  const candidates = Array.isArray(rule.モード候補) && rule.モード候補.length
    ? rule.モード候補
    : ["single", "multi", "mixed"];
  const fixedModeKey = candidates.includes(preferredMode) ? preferredMode : "";
  const selectedModeKey = fixedModeKey || randomFrom(candidates) || "mixed";
  const mode = 山岳モード定義[selectedModeKey] || 山岳モード定義.mixed;
  const gapRange = resolveMountainGapRange(mode, mapW, mapH);
  const minGap = randomInt(gapRange.min, gapRange.max);
  const modeSelection = fixedModeKey ? "fixed" : "random";
  const foothillHillChance = normalizeProbability(mode?.山麓丘陵化確率, rule?.山麓丘陵化確率);

  if (山岳上限枚数 <= 0) {
    return {
      modeKey: mode.key,
      modeName: mode.name,
      modeSelection,
      minGap,
      foothillHillChance,
      massSizes: [],
      targetMountainCount: 0
    };
  }

  const rawMassSizes = buildMountainMassSizes(mode);

  const massSizes = [];
  let remain = Math.max(1, 山岳上限枚数);
  for (const raw of rawMassSizes) {
    if (remain <= 0) break;
    const size = clamp(raw, 1, remain);
    massSizes.push(size);
    remain -= size;
  }
  if (!massSizes.length) massSizes.push(Math.max(1, remain));

  const targetMountainCount = massSizes.reduce((sum, s) => sum + s, 0);

  return {
    modeKey: mode.key,
    modeName: mode.name,
    modeSelection,
    minGap,
    foothillHillChance,
    massSizes,
    targetMountainCount
  };
}

function pickMountainSeed(candidates, usedSeeds, grid, minGap) {
  if (!candidates.length) return null;
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  for (const c of shuffled) {
    if (grid[c.y][c.x] === "海" || grid[c.y][c.x] === "山岳") continue;
    const ok = usedSeeds.every(s => manhattanDistance(s, c) >= minGap);
    if (ok) return { x: c.x, y: c.y };
  }
  for (const c of shuffled) {
    if (grid[c.y][c.x] === "海" || grid[c.y][c.x] === "山岳") continue;
    return { x: c.x, y: c.y };
  }
  return null;
}

function placeMountainsByProfile(grid, 陸地一覧, 山岳上限枚数, profile) {
  if (山岳上限枚数 <= 0 || !profile?.massSizes?.length) {
    return { placedMountainCount: 0, usedSeedCount: 0 };
  }
  const h = grid.length;
  const w = grid[0].length;
  const allowedCoordSet = new Set(陸地一覧.map(p => coordKey(p.x, p.y)));
  const placedSet = new Set();
  const seeds = [];
  const sortedByHeight = [...陸地一覧].sort((a, b) => b.高度 - a.高度 || b.乱数 - a.乱数);
  const topSliceSize = Math.max(6, Math.floor(sortedByHeight.length * 0.42));
  const topCandidates = sortedByHeight.slice(0, topSliceSize);

  for (const p of 陸地一覧) {
    if (grid[p.y][p.x] === "山岳") placedSet.add(coordKey(p.x, p.y));
  }

  const canFillMountain = (x, y) => (
    allowedCoordSet.has(coordKey(x, y))
    && grid[y][x] !== "海"
    && grid[y][x] !== "山岳"
  );
  for (const massSize of profile.massSizes) {
    const seed = pickMountainSeed(topCandidates, seeds, grid, profile.minGap)
      || pickMountainSeed(sortedByHeight, seeds, grid, profile.minGap)
      || pickMountainSeed(sortedByHeight, seeds, grid, 1);
    if (!seed) continue;
    seeds.push(seed);
    const grown = growClusterFromSeed(grid, w, h, "山岳", seed, massSize, canFillMountain);
    if (grown <= 0) continue;
  }

  for (const p of 陸地一覧) {
    if (grid[p.y][p.x] === "山岳") placedSet.add(coordKey(p.x, p.y));
  }

  // 目標枚数まで不足した分は、高度上位から補完して山塊サイズ仕様を満たしつつ不足を防ぐ
  if (placedSet.size < profile.targetMountainCount) {
    for (const p of sortedByHeight) {
      if (placedSet.size >= profile.targetMountainCount) break;
      const key = coordKey(p.x, p.y);
      if (placedSet.has(key) || grid[p.y][p.x] === "海" || !allowedCoordSet.has(key)) continue;
      grid[p.y][p.x] = "山岳";
      placedSet.add(key);
    }
  }

  return {
    placedMountainCount: clamp(placedSet.size, 0, 山岳上限枚数),
    usedSeedCount: seeds.length
  };
}

function dominantNeighborTerrain(grid, x, y, keys) {
  const counts = new Map();
  for (const n of getHexNeighbors(grid, x, y)) {
    if (!keys.includes(n)) continue;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  let bestKey = null;
  let bestCount = 0;
  for (const [k, c] of counts.entries()) {
    if (c > bestCount) {
      bestKey = k;
      bestCount = c;
    }
  }
  return bestKey;
}

function cohereTerrainBlobs(grid, w, h) {
  const next = grid.map(r => [...r]);
  const blobKeys = ["山岳", "丘陵", "森", "砂漠"];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const t = grid[y][x];
      if (!blobKeys.includes(t)) continue;
      const same = countAround(grid, x, y, t);
      if (same >= 1) continue;
      const around = dominantNeighborTerrain(grid, x, y, ["山岳", "丘陵", "森", "平地"]);
      next[y][x] = around || "平地";
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      grid[y][x] = next[y][x];
    }
  }
}

function generateHeightMap(grid, w, h) {
  const 高度マップ = buildInitialGrid(w, h, 0);
  const 画面中央X = (w - 1) / 2;
  const 画面中央Y = (h - 1) / 2;
  const 画面最大距離 = Math.max(
    1,
    Math.hypot(Math.max(画面中央X, w - 1 - 画面中央X), Math.max(画面中央Y, h - 1 - 画面中央Y))
  );
  const { idMap: 島IDマップ, components: 島一覧 } = buildLandComponents(grid, w, h);
  const 島情報Map = new Map(島一覧.map(c => [c.id, c]));
  const 基礎高度 = Number.isFinite(地形生成設定.高度.基礎高度) ? 地形生成設定.高度.基礎高度 : 18;
  const 島中央隆起幅 = Number.isFinite(地形生成設定.高度.島中央隆起幅)
    ? 地形生成設定.高度.島中央隆起幅
    : (Number.isFinite(地形生成設定.高度.中央隆起幅) ? 地形生成設定.高度.中央隆起幅 : 68);
  const 画面中央隆起幅 = Number.isFinite(地形生成設定.高度.画面中央隆起幅) ? 地形生成設定.高度.画面中央隆起幅 : 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] === "海") {
        高度マップ[y][x] = 0;
        continue;
      }
      const 島ID = 島IDマップ?.[y]?.[x];
      const 島情報 = 島情報Map.get(島ID);
      const 島距離比 = 島情報
        ? clamp(Math.hypot(x - 島情報.cx, y - 島情報.cy) / Math.max(1, 島情報.maxDist), 0, 1)
        : 1;
      const 島中央補正 = 1 - 島距離比;
      const 画面距離比 = clamp(Math.hypot(x - 画面中央X, y - 画面中央Y) / 画面最大距離, 0, 1);
      const 画面中央補正 = 1 - 画面距離比;
      const 海隣接度 = countAround(grid, x, y, "海") / 6;
      const ノイズ = (Math.random() * 2 - 1) * 地形生成設定.高度.ノイズ幅;
      const 高度値 = 基礎高度
        + (島中央補正 * 島中央隆起幅)
        + (画面中央補正 * 画面中央隆起幅)
        - (海隣接度 * 地形生成設定.高度.海岸減衰幅)
        + ノイズ;
      高度マップ[y][x] = Math.round(clamp(高度値, 1, 100));
    }
  }

  for (let pass = 0; pass < 地形生成設定.高度.平滑化回数; pass += 1) {
    const next = 高度マップ.map(row => [...row]);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (grid[y][x] === "海") continue;
        const 近傍座標 = getHexNeighborCoords(w, h, x, y).filter(n => grid[n.y][n.x] !== "海");
        if (!近傍座標.length) continue;
        const 周辺平均 = 近傍座標.reduce((sum, n) => sum + 高度マップ[n.y][n.x], 高度マップ[y][x]) / (近傍座標.length + 1);
        next[y][x] = Math.round(clamp((高度マップ[y][x] * 0.48) + (周辺平均 * 0.52), 1, 100));
      }
    }
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        高度マップ[y][x] = next[y][x];
      }
    }
  }

  return 高度マップ;
}

function applyTerrainByHeight(grid, 高度マップ, 山岳目標枚数, 丘陵目標枚数, options = {}) {
  const w = grid[0]?.length || 0;
  const h = grid.length || 0;
  const 陸地一覧 = [];
  const targetCells = Array.isArray(options.landCells) && options.landCells.length
    ? options.landCells
    : null;
  const targetCoordSet = targetCells ? new Set(targetCells.map(c => coordKey(c.x, c.y))) : null;
  const resetTerrain = options.resetTerrain !== false;

  if (targetCells) {
    for (const cell of targetCells) {
      const x = cell?.x;
      const y = cell?.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (grid[y][x] === "海") continue;
      if (resetTerrain) grid[y][x] = "平地";
      陸地一覧.push({ x, y, 高度: 高度マップ[y][x], 乱数: Math.random() });
    }
  } else {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (grid[y][x] === "海") continue;
        if (resetTerrain) grid[y][x] = "平地";
        陸地一覧.push({ x, y, 高度: 高度マップ[y][x], 乱数: Math.random() });
      }
    }
  }

  const 山岳上限枚数 = clamp(山岳目標枚数, 0, 陸地一覧.length);
  const mountainProfile = buildMountainProfile(山岳上限枚数, options.mountainMode || "random", w, h);
  const mountainResult = placeMountainsByProfile(grid, 陸地一覧, 山岳上限枚数, mountainProfile);
  const 山岳数 = clamp(mountainResult.placedMountainCount, 0, 陸地一覧.length);
  const 丘陵数 = clamp(丘陵目標枚数, 0, Math.max(0, 陸地一覧.length - 山岳数));
  const foothillPlaced = applyFoothillHillsFromMountains(
    grid,
    高度マップ,
    丘陵数,
    normalizeProbability(mountainProfile.foothillHillChance, 地形生成設定.山岳塊?.山麓丘陵化確率),
    targetCoordSet
  );
  const remainingHillCount = Math.max(0, 丘陵数 - foothillPlaced);

  const 残り陸地一覧 = 陸地一覧
    .filter(p => grid[p.y][p.x] !== "山岳" && grid[p.y][p.x] !== "丘陵")
    .sort((a, b) => b.高度 - a.高度 || b.乱数 - a.乱数);
  for (let i = 0; i < remainingHillCount; i += 1) {
    const p = 残り陸地一覧[i];
    if (!p) break;
    grid[p.y][p.x] = "丘陵";
  }

  return {
    ...mountainProfile,
    plannedMountainCount: mountainProfile.targetMountainCount,
    actualMountainCount: 山岳数,
    seedCount: mountainResult.usedSeedCount,
    foothillHillPlaced: foothillPlaced
  };
}

function mergeMountainProfiles(profiles) {
  const list = Array.isArray(profiles) ? profiles.filter(Boolean) : [];
  if (!list.length) return null;
  const modeNameSet = new Set(list.map(p => p.modeName).filter(Boolean));
  const modeSelectionSet = new Set(list.map(p => p.modeSelection).filter(Boolean));
  const minGapValues = list.map(p => p.minGap).filter(Number.isFinite);
  const minGap = minGapValues.length
    ? (Math.min(...minGapValues) === Math.max(...minGapValues)
      ? minGapValues[0]
      : `${Math.min(...minGapValues)}-${Math.max(...minGapValues)}`)
    : null;
  const massSizes = list.flatMap(p => Array.isArray(p.massSizes) ? p.massSizes : []);
  const foothillChances = list.map(p => p.foothillHillChance).filter(Number.isFinite);
  const foothillHillChance = foothillChances.length
    ? foothillChances.reduce((sum, v) => sum + v, 0) / foothillChances.length
    : null;

  return {
    modeKey: modeNameSet.size === 1 ? list[0].modeKey : "mixed-islands",
    modeName: modeNameSet.size === 1 ? list[0].modeName : "島別混在",
    modeSelection: modeSelectionSet.size === 1 ? list[0].modeSelection : "random",
    minGap,
    foothillHillChance,
    massSizes,
    targetMountainCount: list.reduce((sum, p) => sum + (p.targetMountainCount || 0), 0),
    plannedMountainCount: list.reduce((sum, p) => sum + (p.plannedMountainCount || 0), 0),
    actualMountainCount: list.reduce((sum, p) => sum + (p.actualMountainCount || 0), 0),
    seedCount: list.reduce((sum, p) => sum + (p.seedCount || 0), 0),
    foothillHillPlaced: list.reduce((sum, p) => sum + (p.foothillHillPlaced || 0), 0),
    islandProfileCount: list.length
  };
}

function desertLatitudeWeight(y, h) {
  if (h <= 1) return 1;
  const center = (h - 1) / 2;
  const distNorm = Math.abs(y - center) / Math.max(1, center);
  const core = 1 - Math.min(1, distNorm);
  // 画面縦中央で高確率、上下端で低確率
  return 0.15 + (core * core) * 0.85;
}

function placeCentralOasis(grid, w, h) {
  const deserts = [];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      if (grid[y][x] === "砂漠") deserts.push({ x, y });
    }
  }
  if (!deserts.length) return false;

  const cx = deserts.reduce((s, p) => s + p.x, 0) / deserts.length;
  const cy = deserts.reduce((s, p) => s + p.y, 0) / deserts.length;
  const candidates = deserts
    .map(p => {
      const desertNear = countAround(grid, p.x, p.y, "砂漠");
      const seaNear = countAround(grid, p.x, p.y, "海");
      const dist = Math.abs(p.x - cx) + Math.abs(p.y - cy);
      return { ...p, desertNear, seaNear, dist };
    })
    // 周囲が砂漠でないとオアシスにしない（6近傍中5以上を要求）
    .filter(p => p.desertNear >= 5 && p.seaNear === 0)
    .sort((a, b) => a.dist - b.dist || b.desertNear - a.desertNear);

  if (!candidates.length) return false;
  const chosen = candidates[0];
  grid[chosen.y][chosen.x] = "湖";
  return true;
}

function buildHeightLevelMap(grid, 高度マップ, w, h) {
  const levelMap = buildInitialGrid(w, h, 0);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const terrain = grid[y][x];
      if (terrain === "海") {
        levelMap[y][x] = -2;
        continue;
      }
      if (terrain === "湖") {
        levelMap[y][x] = -1;
        continue;
      }
      const raw = Number.isFinite(高度マップ?.[y]?.[x]) ? 高度マップ[y][x] : 35;
      let level = Math.round((raw - 42) / 10);
      if (terrain === "丘陵") level = Math.max(level, 1);
      if (terrain === "山岳") level = Math.max(level, 2);
      if (terrain === "火山") level = Math.max(level, 3);
      levelMap[y][x] = clamp(level, -1, 8);
    }
  }
  return levelMap;
}

function buildCoastMap(grid, w, h, 高度レベルマップ) {
  const coastMap = buildInitialGrid(w, h, false);
  const coastTypeMap = buildInitialGrid(w, h, "");
  let directCount = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!isLandTerrain(grid[y][x])) continue;
      const neighbors = getHexNeighborCoords(w, h, x, y);
      const seaNeighbors = neighbors.filter(n => grid[n.y][n.x] === "海");
      const hasSeaNeighbor = seaNeighbors.length > 0;
      if (!hasSeaNeighbor) continue;
      const landLevel = 高度レベルマップ?.[y]?.[x];
      if (!Number.isFinite(landLevel)) continue;
      const hasSeaLevelDiffWithinOne = seaNeighbors.some(n => {
        const seaLevel = 高度レベルマップ?.[n.y]?.[n.x];
        return Number.isFinite(seaLevel) && Math.abs(landLevel - seaLevel) <= 1;
      });
      if (!hasSeaLevelDiffWithinOne) continue;
      coastMap[y][x] = true;
      coastTypeMap[y][x] = "direct";
      directCount += 1;
    }
  }

  return {
    map: coastMap,
    typeMap: coastTypeMap,
    count: directCount,
    directCount
  };
}

function buildSpecialTileMap(grid, w, h, riverData, 高度レベルマップ) {
  const specialMap = buildInitialGrid(w, h, null);
  const specialCounts = { 沼地: 0, 峡谷: 0, 洞窟: 0, 洞窟_小: 0, 洞窟_中: 0, 洞窟_大: 0 };
  const riverSet = riverData?.riverSet || new Set();
  const canyonRule = 特殊地形設定.峡谷;
  const caveRule = 特殊地形設定.洞窟;
  const wetRule = 特殊地形設定.沼地.湿潤条件;
  const waterTerrainSet = new Set(wetRule.水地形キー || []);
  const canyonTerrainSet = new Set(canyonRule.対象地形キー || []);
  const caveTerrainSet = new Set(caveRule.対象地形キー || []);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const terrain = grid[y][x];
      const level = 高度レベルマップ?.[y]?.[x];
      const tileKey = `${x},${y}`;
      const neighbors = getHexNeighborCoords(w, h, x, y);

      if (canyonTerrainSet.has(terrain) && Number.isFinite(level) && level >= canyonRule.最低高度Lv) {
        const riverBase = (canyonRule.川判定に自マスを含む && riverSet.has(tileKey)) ? 1 : 0;
        const riverNear = neighbors.reduce((sum, n) => (
          sum + (riverSet.has(`${n.x},${n.y}`) ? 1 : 0)
        ), riverBase);
        const maxDrop = neighbors.reduce((best, n) => {
          const nLevel = 高度レベルマップ?.[n.y]?.[n.x];
          if (!Number.isFinite(nLevel)) return best;
          return Math.max(best, level - nLevel);
        }, 0);
        if (
          riverNear >= canyonRule.最低川隣接数
          && maxDrop >= canyonRule.最低落差Lv
          && Math.random() < 地形生成設定.確率.峡谷化
        ) {
          specialMap[y][x] = "峡谷";
          specialCounts.峡谷 += 1;
          continue;
        }
      }

      if (caveTerrainSet.has(terrain) && Number.isFinite(level) && level >= caveRule.最低高度Lv) {
        const mountainBase = (caveRule.山岳判定に自マスを含む && isMountainLikeTerrain(terrain)) ? 1 : 0;
        const mountainNear = neighbors.reduce((sum, n) => (
          sum + (isMountainLikeTerrain(grid[n.y][n.x]) ? 1 : 0)
        ), mountainBase);
        if (mountainNear >= caveRule.最低山岳隣接数 && Math.random() < 地形生成設定.確率.洞窟化) {
          specialMap[y][x] = "洞窟";
          specialCounts.洞窟 += 1;
          continue;
        }
      }

      if (terrain !== "森") continue;
      if (Number.isFinite(level) && level > 特殊地形設定.沼地.最大高度Lv) continue;
      const waterBase = (wetRule.水判定に自マスを含む && waterTerrainSet.has(grid[y][x])) ? 1 : 0;
      const waterNear = neighbors.reduce((sum, n) => {
        const terrain = grid[n.y][n.x];
        return sum + (waterTerrainSet.has(terrain) ? 1 : 0);
      }, waterBase);
      const riverBase = (wetRule.川判定に自マスを含む && riverSet.has(tileKey)) ? 1 : 0;
      const riverNear = neighbors.reduce((sum, n) => (
        sum + (riverSet.has(`${n.x},${n.y}`) ? 1 : 0)
      ), riverBase);

      const isWetForest = (
        waterNear >= wetRule.最低水隣接数
        || riverNear >= wetRule.最低川隣接数
      );
      if (!isWetForest) continue;

      if (Math.random() < 地形生成設定.確率.沼地化) {
        specialMap[y][x] = "沼地";
        specialCounts.沼地 += 1;
      }
    }
  }

  const caveSizeMap = buildInitialGrid(w, h, 0);
  const caveScaleMap = buildInitialGrid(w, h, "");
  const caveVisited = new Set();
  const caveScaleThreshold = caveRule.規模閾値 || { 中: 3, 大: 6 };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (specialMap[y][x] !== "洞窟") continue;
      const startKey = `${x},${y}`;
      if (caveVisited.has(startKey)) continue;

      const stack = [{ x, y }];
      const component = [];
      caveVisited.add(startKey);

      while (stack.length) {
        const cur = stack.pop();
        component.push(cur);
        for (const n of getHexNeighborCoords(w, h, cur.x, cur.y)) {
          if (specialMap[n.y][n.x] !== "洞窟") continue;
          const key = `${n.x},${n.y}`;
          if (caveVisited.has(key)) continue;
          caveVisited.add(key);
          stack.push({ x: n.x, y: n.y });
        }
      }

      const size = component.length;
      const scale = size >= caveScaleThreshold.大
        ? "large"
        : size >= caveScaleThreshold.中
          ? "medium"
          : "small";
      for (const cell of component) {
        caveSizeMap[cell.y][cell.x] = size;
        caveScaleMap[cell.y][cell.x] = scale;
      }
      if (scale === "large") specialCounts.洞窟_大 += size;
      else if (scale === "medium") specialCounts.洞窟_中 += size;
      else specialCounts.洞窟_小 += size;
    }
  }

  return { specialMap, specialCounts, caveSizeMap, caveScaleMap };
}

function buildStrongMonsterSpawnData(grid, w, h, 高度レベルマップ, specialMap, riverData, reliefMap) {
  const strongMonsterMap = buildInitialGrid(w, h, null);
  const strongMonsterInfoMap = buildInitialGrid(w, h, null);
  const setting = 強敵配置設定;
  if (!setting?.有効) {
    return {
      strongMonsterMap,
      strongMonsterInfoMap,
      strongMonsterStats: { 有効: false, 配置数: 0, 条件別: {} }
    };
  }

  const baseLevel = Math.max(1, Math.floor(setting.基本Lv || 1));
  const baseChance = normalizeProbability(setting.基本出現確率, 0.5);
  const allowRuleOverlap = setting.重複ルール許可 === true;
  const rules = setting.ルール || {};
  const relief = reliefMap || grid;
  const spawned = new Set();
  const ruleCounts = {
    森中央: 0,
    砂漠オアシス: 0,
    大森林外周: 0,
    森環丘山: 0
  };

  const terrainAt = (x, y) => grid?.[y]?.[x];
  const reliefAt = (x, y) => relief?.[y]?.[x];
  const heightLevelAt = (x, y) => 高度レベルマップ?.[y]?.[x];
  const isCompositeForest = (x, y) => {
    const t = terrainAt(x, y);
    const r = reliefAt(x, y);
    return t === "森" && (r === "丘陵" || r === "山岳");
  };
  const addSpawn = (x, y, level, ruleKey, extra = null) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const terrain = terrainAt(x, y);
    if (!terrain || terrain === "海") return false;
    const key = `${x},${y}`;
    const lv = Math.max(1, Math.floor(level || baseLevel));
    const current = strongMonsterInfoMap[y][x];
    if (current && !allowRuleOverlap) return false;
    if (!current) {
      strongMonsterMap[y][x] = "強敵候補";
      strongMonsterInfoMap[y][x] = {
        level: lv,
        rules: [ruleKey],
        terrain,
        relief: reliefAt(x, y),
        heightLevel: heightLevelAt(x, y),
        extra
      };
      spawned.add(key);
      ruleCounts[ruleKey] = (ruleCounts[ruleKey] || 0) + 1;
      return true;
    }

    current.level = Math.max(current.level, lv);
    if (!current.rules.includes(ruleKey)) {
      current.rules.push(ruleKey);
      ruleCounts[ruleKey] = (ruleCounts[ruleKey] || 0) + 1;
    }
    if (extra) current.extra = { ...(current.extra || {}), ...extra };
    return true;
  };

  // 1) 森の中央
  const forestCoreRule = rules.森中央 || {};
  if (forestCoreRule.有効 !== false) {
    const forestComps = buildTerrainComponents(grid, w, h, "森").components;
    const minForestSize = Math.max(1, Math.floor(forestCoreRule.最低森規模 || 1));
    const includeComposite = forestCoreRule.複合地勢セルを含む !== false;
    for (const comp of forestComps) {
      if (comp.size < minForestSize) continue;
      if (Math.random() > baseChance) continue;
      const centerCandidates = includeComposite
        ? comp.cells
        : comp.cells.filter(c => !isCompositeForest(c.x, c.y));
      const centerCell = pickNearestCellToCenter(centerCandidates, comp.cx, comp.cy);
      if (!centerCell) continue;
      addSpawn(centerCell.x, centerCell.y, baseLevel, "森中央", { 森規模: comp.size });
    }
  }

  // 2) 砂漠のオアシス
  const oasisRule = rules.砂漠オアシス || {};
  if (oasisRule.有効 !== false) {
    const minDesertNear = Math.max(1, Math.floor(oasisRule.最低砂漠隣接数 || 5));
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (grid[y][x] !== "湖") continue;
        const desertNear = countAround(grid, x, y, "砂漠");
        if (desertNear < minDesertNear) continue;
        if (Math.random() > baseChance) continue;
        addSpawn(x, y, baseLevel, "砂漠オアシス", { 砂漠隣接: desertNear });
      }
    }
  }

  // 3) 森規模21以上: 規模/7体を距離3リングへ各50%配置、単独ならLv+1
  const largeForestRule = rules.大森林外周 || {};
  if (largeForestRule.有効 !== false) {
    const minForestSize = Math.max(1, Math.floor(largeForestRule.最低森規模 || 21));
    const divisor = Math.max(1, Math.floor(largeForestRule.規模分母 || 7));
    const ringDist = Math.max(1, Math.floor(largeForestRule.配置距離 || 3));
    const perCandidateChance = normalizeProbability(largeForestRule.各候補出現確率, 0.5);
    const singleBoost = Math.max(0, Math.floor(largeForestRule.単独時Lv加算 || 0));
    const forestComps = buildTerrainComponents(grid, w, h, "森").components;

    for (const comp of forestComps) {
      if (comp.size < minForestSize) continue;
      const spawnBudget = Math.max(1, Math.floor(comp.size / divisor));
      const centerCell = pickNearestCellToCenter(comp.cells, comp.cx, comp.cy);
      if (!centerCell) continue;

      const ringCells = listCellsAtHexDistance(w, h, centerCell.x, centerCell.y, ringDist)
        .filter(c => {
          const t = terrainAt(c.x, c.y);
          return !!t && t !== "海";
        })
        .map(c => ({
          ...c,
          forestNear: countAround(grid, c.x, c.y, "森"),
          t: Math.random()
        }))
        .sort((a, b) => b.forestNear - a.forestNear || b.t - a.t);

      let spawnedInComp = 0;
      for (let i = 0; i < Math.min(spawnBudget, ringCells.length); i += 1) {
        const p = ringCells[i];
        if (Math.random() > perCandidateChance) continue;
        if (addSpawn(p.x, p.y, baseLevel, "大森林外周", { 森規模: comp.size, 森隣接: p.forestNear, 森コンポID: comp.id })) {
          spawnedInComp += 1;
        }
      }

      if (spawnedInComp === 1 && singleBoost > 0) {
        // 当コンポーネント内で今回追加された1体を特定してLv加算
        for (let y = 0; y < h; y += 1) {
          let found = false;
          for (let x = 0; x < w; x += 1) {
            const info = strongMonsterInfoMap[y][x];
            if (!info || !info.rules?.includes("大森林外周")) continue;
            if (Number(info.extra?.森コンポID) !== comp.id) continue;
            info.level = Math.max(info.level, baseLevel + singleBoost);
            info.extra = { ...(info.extra || {}), 単独補正: `Lv+${singleBoost}` };
            found = true;
            break;
          }
          if (found) break;
        }
      }
    }
  }

  // 4) 周囲が森、中央1マスだけ丘/山
  const ringForestRule = rules.森環丘山 || {};
  if (ringForestRule.有効 !== false) {
    const targetReliefSet = new Set(ringForestRule.中央対象地勢 || ["丘陵", "山岳"]);
    const forestNeed = Math.max(1, Math.floor(ringForestRule.最低森隣接数 || 6));
    const chance = normalizeProbability(ringForestRule.出現確率, baseChance);
    const excludeForestCoverCenter = ringForestRule.中央が被覆森を除外 !== false;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const centerRelief = reliefAt(x, y);
        if (!targetReliefSet.has(centerRelief)) continue;
        if (excludeForestCoverCenter && terrainAt(x, y) === "森") continue;
        const forestNear = countAround(grid, x, y, "森");
        if (forestNear < forestNeed) continue;
        if (Math.random() > chance) continue;
        addSpawn(x, y, baseLevel, "森環丘山", { 森隣接: forestNear, 中央地勢: centerRelief });
      }
    }
  }

  return {
    strongMonsterMap,
    strongMonsterInfoMap,
    strongMonsterStats: {
      有効: true,
      配置数: spawned.size,
      条件別: ruleCounts
    }
  };
}

function augmentRiverDataWithWaterfalls(riverData, 高度レベルマップ) {
  const waterfallSet = new Set();
  const waterfallEdgeSet = new Set();
  if (!riverData) return { waterfallSet, waterfallEdgeSet };

  const markEdgeIfWaterfall = edgeKey => {
    const [a, b] = edgeKey.split("|");
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const al = 高度レベルマップ?.[pa.y]?.[pa.x];
    const bl = 高度レベルマップ?.[pb.y]?.[pb.x];
    if (!Number.isFinite(al) || !Number.isFinite(bl)) return;
    const high = Math.max(al, bl);
    const low = Math.min(al, bl);
    const drop = high - low;
    // 滝は「高所(>=2)から低所へ落差がある区間」に限定する
    if (!(high >= 2 && drop >= 1)) return;
    if (Math.random() >= 地形生成設定.確率.滝化) return;

    waterfallEdgeSet.add(edgeKey);
    if (al === high && riverData.riverSet?.has(a)) waterfallSet.add(a);
    if (bl === high && riverData.riverSet?.has(b)) waterfallSet.add(b);
  };

  for (const edge of riverData.edgeSet || []) markEdgeIfWaterfall(edge);
  for (const edge of riverData.waterLinkSet || []) markEdgeIfWaterfall(edge);

  return {
    ...riverData,
    waterfallSet,
    waterfallEdgeSet
  };
}

function generateRivers(grid, w, h, totalTiles, 高度マップ, 高度レベルマップ) {
  const seas = listCoordsByTerrain(grid, "海");
  const waters = [...seas, ...listCoordsByTerrain(grid, "湖")];
  const riverSet = new Set();
  const sourceSet = new Set();
  const branchSet = new Set();
  const mouthSet = new Set();
  const edgeSet = new Set();
  const waterLinkSet = new Set();
  if (!waters.length) {
    return { riverSet, sourceSet, branchSet, mouthSet, edgeSet, waterLinkSet };
  }

  const flowLevelMap = (高度レベルマップ && 高度レベルマップ.length)
    ? 高度レベルマップ.map(row => [...row])
    : buildHeightLevelMap(grid, 高度マップ, w, h);

  function isWaterTerrain(terrain) {
    return terrain === "海" || terrain === "湖";
  }

  function keyOf(x, y) {
    return `${x},${y}`;
  }

  function riverEdgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function getLevel(x, y) {
    if (y < 0 || y >= h || x < 0 || x >= w) return -2;
    return flowLevelMap[y][x];
  }

  function waterNeighborOf(x, y) {
    const neighbors = getHexNeighborCoords(w, h, x, y);
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const n of neighbors) {
      if (!isWaterTerrain(grid[n.y][n.x])) continue;
      const dist = seas.length ? minDistanceToTargets(n.x, n.y, seas) : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = n;
      }
    }
    return best;
  }

  function traceRiverFromSource(source, isMajor) {
    const sourceKey = keyOf(source.x, source.y);
    sourceSet.add(sourceKey);
    const channels = [{
      x: source.x,
      y: source.y,
      ttl: (isMajor ? 22 : 15) + Math.floor(Math.random() * 10),
      age: 0,
      branchBudget: isMajor ? 2 : 1,
      major: isMajor,
      visited: new Set([sourceKey])
    }];

    while (channels.length) {
      const ch = channels.pop();
      let current = { x: ch.x, y: ch.y };
      let currentKey = keyOf(current.x, current.y);

      if (!isWaterTerrain(grid[current.y][current.x])) {
        riverSet.add(currentKey);
      }

      while (ch.ttl > 0) {
        const outlet = waterNeighborOf(current.x, current.y);
        if (outlet && ch.age >= 1) {
          const outletKey = keyOf(outlet.x, outlet.y);
          waterLinkSet.add(riverEdgeKey(currentKey, outletKey));
          mouthSet.add(currentKey);
          break;
        }

        const currentLevel = getLevel(current.x, current.y);
        const candidates = getHexNeighborCoords(w, h, current.x, current.y)
          .filter(n => !ch.visited.has(keyOf(n.x, n.y)))
          .map(n => {
            const terrain = grid[n.y][n.x];
            const level = getLevel(n.x, n.y);
            const drop = currentLevel - level;
            const waterDist = minDistanceToTargets(n.x, n.y, waters);
            const canFlow = isWaterTerrain(terrain) || level <= currentLevel;
            const score = (isWaterTerrain(terrain) ? -999 : 0)
              + (drop >= 0 ? -(drop * 3.6) : 999)
              + (waterDist * 0.65)
              + (Math.random() * 0.35);
            return { n, terrain, level, drop, waterDist, score, canFlow };
          })
          .filter(info => info.canFlow)
          .sort((a, b) => a.score - b.score);

        if (!candidates.length) break;
        let nextInfo = candidates[0];

        if (ch.age < 2 && isWaterTerrain(nextInfo.terrain) && candidates.length > 1) {
          nextInfo = candidates[1];
        }

        if (ch.age >= 3 && ch.branchBudget > 0 && candidates.length > 1) {
          const branchChance = ch.major ? 0.35 : 0.18;
          const alt = candidates[1];
          if (alt && !isWaterTerrain(alt.terrain) && Math.random() < branchChance) {
            branchSet.add(currentKey);
            channels.push({
              x: alt.n.x,
              y: alt.n.y,
              ttl: Math.max(5, Math.floor(ch.ttl * 0.52)),
              age: 0,
              branchBudget: ch.branchBudget - 1,
              major: false,
              visited: new Set(ch.visited)
            });
            ch.branchBudget -= 1;
          }
        }

        const next = nextInfo.n;
        const nextKey = keyOf(next.x, next.y);
        ch.visited.add(nextKey);
        ch.ttl -= 1;
        ch.age += 1;

        if (isWaterTerrain(nextInfo.terrain)) {
          waterLinkSet.add(riverEdgeKey(currentKey, nextKey));
          mouthSet.add(currentKey);
          break;
        }

        edgeSet.add(riverEdgeKey(currentKey, nextKey));
        riverSet.add(currentKey);
        riverSet.add(nextKey);
        current = next;
        currentKey = nextKey;
      }
    }
  }

  const sourceCandidates = listLandCoords(grid)
    .filter(c => !isWaterTerrain(grid[c.y][c.x]))
    .map(c => {
      const terrain = grid[c.y][c.x];
      const level = getLevel(c.x, c.y);
      return {
        ...c,
        level,
        terrain,
        sourceScore: (isMountainLikeTerrain(terrain) ? 3 : 0) + (terrain === "丘陵" ? 1 : 0) + level
      };
    })
    .filter(c => c.sourceScore >= 2)
    .sort((a, b) => b.sourceScore - a.sourceScore || Math.random() - 0.5);

  if (!sourceCandidates.length) {
    return { riverSet, sourceSet, branchSet, mouthSet, edgeSet, waterLinkSet };
  }

  const riverCount = Math.max(3, Math.floor(totalTiles / 70));
  const majorCount = Math.max(1, Math.floor(riverCount * 0.6));
  const topSliceSize = Math.max(4, Math.floor(sourceCandidates.length * 0.35));
  const topSources = sourceCandidates.slice(0, topSliceSize);
  const used = new Set();

  for (let i = 0; i < riverCount; i += 1) {
    let src = randomFrom(topSources) || randomFrom(sourceCandidates);
    if (!src) continue;
    let guard = 0;
    while (src && used.has(keyOf(src.x, src.y)) && guard < 12) {
      src = randomFrom(sourceCandidates);
      guard += 1;
    }
    if (!src) continue;
    used.add(keyOf(src.x, src.y));
    traceRiverFromSource(src, i < majorCount);
  }

  return { riverSet, sourceSet, branchSet, mouthSet, edgeSet, waterLinkSet };
}

function parseCoordKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function hexCenter(x, y) {
  const tileW = 40;
  const tileH = 48;
  const rowStep = 36; // 48 + (-12)
  const offsetX = (y % 2 === 1) ? 20 : 0;
  return {
    cx: offsetX + x * tileW + tileW / 2,
    cy: y * rowStep + tileH / 2
  };
}

function createIslandShapeData({ w, h, patternId = "balanced", islandCustomSettings = null }) {
  const totalTiles = w * h;
  const grid = buildInitialGrid(w, h, "海");
  const { patternName, islandGenerationInfo } = generateIslands(grid, w, h, totalTiles, patternId, {
    islandCustomSettings
  });
  return {
    w,
    h,
    totalTiles,
    grid,
    patternName,
    shapeOnly: true,
    riverData: null,
    heightMap: null,
    heightLevelMap: null,
    terrainRatioProfile: null,
    reliefMap: null,
    strongMonsterMap: null,
    strongMonsterInfoMap: null,
    strongMonsterStats: null,
    forestTargetCount: null,
    specialMap: null,
    specialCounts: null,
    caveSizeMap: null,
    caveScaleMap: null,
    mountainProfile: null,
    climateBandInfo: null,
    volcanoData: null,
    lavaState: null,
    lavaMap: null,
    lavaFlowData: null,
    coastMap: null,
    coastTypeMap: null,
    coastInfo: null,
    turnState: null,
    islandGenerationInfo
  };
}

function createTerrainMapData({ w, h, patternId = "balanced", mountainMode = "random", islandCustomSettings = null }) {
  const totalTiles = w * h;
  const grid = buildInitialGrid(w, h, "海");
  const { patternName, islandGenerationInfo } = generateIslands(grid, w, h, totalTiles, patternId, {
    islandCustomSettings
  });
  const { components: 島一覧 } = buildLandComponents(grid, w, h);
  const 島別比率設定 = buildIslandTerrainRatioProfiles(島一覧);
  const terrainRatioProfile = {
    key: "per-island",
    name: 島別比率設定.name,
    summary: 島別比率設定.summary,
    islandProfiles: 島別比率設定.profileList
  };

  const 陸地枚数 = 島一覧.reduce((sum, comp) => sum + comp.size, 0);
  const 山岳目標計画 = distributeIslandTargets(
    島一覧,
    島別比率設定.profileMap,
    "山岳",
    地形生成設定.最低枚数.山岳
  );
  const 丘陵目標計画 = distributeIslandTargets(
    島一覧,
    島別比率設定.profileMap,
    "丘陵",
    地形生成設定.最低枚数.丘陵
  );
  const 森目標計画 = distributeIslandTargets(
    島一覧,
    島別比率設定.profileMap,
    "森",
    陸地枚数 > 0 ? 1 : 0
  );
  const 砂漠目標計画 = distributeIslandTargets(
    島一覧,
    島別比率設定.profileMap,
    "砂漠",
    地形生成設定.最低枚数.砂漠
  );
  const 湖上限計画 = distributeIslandTargets(島一覧, 島別比率設定.profileMap, "湖上限", 0);

  const 高度マップ = generateHeightMap(grid, w, h);
  const 島別山岳プロファイル = [];
  for (const island of 島一覧) {
    const islandMountainTarget = 山岳目標計画.byIsland.get(island.id) || 0;
    const islandHillTarget = 丘陵目標計画.byIsland.get(island.id) || 0;
    const profile = applyTerrainByHeight(grid, 高度マップ, islandMountainTarget, islandHillTarget, {
      mountainMode,
      landCells: island.cells,
      resetTerrain: true
    });
    島別山岳プロファイル.push(profile);
  }
  const mountainProfile = mergeMountainProfiles(島別山岳プロファイル);
  const reliefMap = grid.map(row => [...row]);

  for (const island of 島一覧) {
    const islandCoordSet = new Set(island.cells.map(c => coordKey(c.x, c.y)));
    const islandForestTarget = 森目標計画.byIsland.get(island.id) || 0;
    if (islandForestTarget > 0) {
      growClusters(
        grid, w, h, "森", islandForestTarget,
        (x, y) => {
          if (!islandCoordSet.has(coordKey(x, y))) return false;
          const relief = reliefMap[y][x];
          if (relief === "海") return false;
          if (relief !== "平地" && relief !== "丘陵" && relief !== "山岳") return false;
          const mountainNear = countAround(reliefMap, x, y, "山岳");
          return relief === "山岳" ? mountainNear <= 3 : mountainNear <= 2;
        },
        (x, y) => {
          if (!islandCoordSet.has(coordKey(x, y))) return false;
          const relief = reliefMap[y][x];
          if (grid[y][x] === "海" || grid[y][x] === "湖" || grid[y][x] === "河川") return false;
          if (relief !== "平地" && relief !== "丘陵" && relief !== "山岳") return false;
          const mountainNear = countAround(reliefMap, x, y, "山岳");
          return relief === "山岳" ? mountainNear <= 3 : mountainNear <= 2;
        }
      );
    }

    const islandDesertTarget = 砂漠目標計画.byIsland.get(island.id) || 0;
    if (islandDesertTarget <= 0) continue;
    const islandMinClusters = Math.max(
      1,
      Math.min(地形生成設定.最小クラスタ数.砂漠, islandDesertTarget)
    );
    const 砂漠クラスタサイズ一覧 = buildClusterSizes(islandDesertTarget, islandMinClusters);
    const 砂漠シード一覧 = [];
    for (const size of 砂漠クラスタサイズ一覧) {
      const seed = pickClusterSeed(
        grid,
        砂漠シード一覧,
        (x, y) =>
          islandCoordSet.has(coordKey(x, y)) &&
          grid[y][x] === "平地" &&
          countAround(grid, x, y, "海") === 0 &&
          countAround(grid, x, y, "森") === 0 &&
          desertLatitudeWeight(y, h) >= 0.35,
        2
      );
      if (!seed) continue;
      砂漠シード一覧.push(seed);
      growClusterFromSeed(
        grid, w, h, "砂漠", seed, size,
        (x, y) =>
          islandCoordSet.has(coordKey(x, y)) &&
          grid[y][x] === "平地" &&
          countAround(grid, x, y, "海") === 0 &&
          Math.random() < desertLatitudeWeight(y, h)
      );
    }
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] === "海") continue;
      if (grid[y][x] === "山岳" && countAround(grid, x, y, "山岳") === 0) grid[y][x] = "丘陵";
      if (grid[y][x] === "森" && countAround(grid, x, y, "森") === 0) grid[y][x] = "平地";
    }
  }

  cohereTerrainBlobs(grid, w, h);
  for (const island of 島一覧) {
    const islandCoordSet = new Set(island.cells.map(c => coordKey(c.x, c.y)));
    const islandForestTarget = 森目標計画.byIsland.get(island.id) || 0;
    topUpForestToTarget(grid, reliefMap, w, h, islandForestTarget, islandCoordSet);
  }
  const reliefRule = 地形生成設定.山岳塊?.起伏保証 || {};
  if (reliefRule.有効 !== false) {
    const reliefAdded = ensureIslandRelief(
      grid,
      高度マップ,
      reliefRule.最低島サイズ,
      reliefRule.最低起伏枚数
    );
    if (mountainProfile) mountainProfile.islandReliefPlaced = reliefAdded;
  }
  const オアシスあり = placeCentralOasis(grid, w, h);
  const 島基準の湖上限 = 湖上限計画.totalTarget;
  const 湖上限 = Math.max(オアシスあり ? 1 : 0, 島基準の湖上限);
  let 配置済み湖数 = 0;
  if (オアシスあり) 配置済み湖数 = 1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (配置済み湖数 >= 湖上限) break;
      if (shouldBecomeLake(grid, x, y)) {
        grid[y][x] = "湖";
        配置済み湖数 += 1;
      }
    }
  }

  const climateBandInfo = applyNorthSnowBand(
    grid,
    w,
    h,
    地形生成設定.気候帯?.北端雪原帯行数
  );
  const dormantVolcanoData = buildDormantVolcanoMap(
    grid,
    w,
    h,
    地形生成設定.火山化?.休火山化率
  );
  const volcanoTurnResult = runVolcanoEruptionTurns(
    grid,
    w,
    h,
    dormantVolcanoData.map,
    地形生成設定.火山化
  );
  const volcanoData = {
    dormantRate: normalizeProbability(地形生成設定.火山化?.休火山化率, 0.2),
    eruptionRatePerTurn: normalizeProbability(地形生成設定.火山化?.噴火率毎ターン, 0.01),
    initialTurnChecks: Math.max(0, Math.floor(Number(地形生成設定.火山化?.初期噴火判定ターン数) || 0)),
    dormantMap: dormantVolcanoData.map,
    dormantCount: dormantVolcanoData.dormantSet.size,
    eruptedCount: volcanoTurnResult.eruptedSet.size,
    eruptedEvents: volcanoTurnResult.events,
    volcanoCount: listCoordsByTerrain(grid, "火山").length
  };

  const 高度レベルマップ = buildHeightLevelMap(grid, 高度マップ, w, h);
  const coastData = buildCoastMap(grid, w, h, 高度レベルマップ);
  const riverRawData = generateRivers(grid, w, h, totalTiles, 高度マップ, 高度レベルマップ);
  const riverData = augmentRiverDataWithWaterfalls(riverRawData, 高度レベルマップ);
  const { specialMap, specialCounts, caveSizeMap, caveScaleMap } = buildSpecialTileMap(grid, w, h, riverData, 高度レベルマップ);
  const { strongMonsterMap, strongMonsterInfoMap, strongMonsterStats } = buildStrongMonsterSpawnData(
    grid,
    w,
    h,
    高度レベルマップ,
    specialMap,
    riverData,
    reliefMap
  );
  return {
    w,
    h,
    totalTiles,
    grid,
    patternName,
    shapeOnly: false,
    riverData,
    heightMap: 高度マップ,
    heightLevelMap: 高度レベルマップ,
    terrainRatioProfile,
    reliefMap,
    strongMonsterMap,
    strongMonsterInfoMap,
    strongMonsterStats,
    forestTargetCount: 森目標計画.totalTarget,
    specialMap,
    specialCounts,
    caveSizeMap,
    caveScaleMap,
    mountainProfile,
    climateBandInfo,
    volcanoData,
    lavaState: { flows: [] },
    lavaMap: buildInitialGrid(w, h, false),
    lavaFlowData: {
      nodeKeys: [],
      edgeKeys: [],
      sourceKeys: []
    },
    coastMap: coastData.map,
    coastTypeMap: coastData.typeMap,
    coastInfo: {
      count: coastData.count,
      directCount: coastData.directCount
    },
    turnState: {
      turnNumber: 0,
      lastEventCount: 0
    },
    islandGenerationInfo
  };
}

export {
  parseCoordKey,
  hexCenter,
  createIslandShapeData,
  createTerrainMapData,
  advanceTerrainTurn
};


