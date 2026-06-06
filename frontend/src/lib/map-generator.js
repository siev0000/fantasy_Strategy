import { generateIsland as generateRealisticIsland } from "./realistic-island.js";
import { HEX_TILE_CONFIG } from "./phaser-map-panel-config.js";

const 地形定義 = [
  { key: "平地", color: "#b6cc71", weight: 26, short: "平" },
  { key: "荒野", color: "#d9c98b", weight: 12, short: "荒" },
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
    滝化: 0.5,
    峡谷化: 0.18,
    洞窟化: 0.1
  },
  河川: {
    発生率係数: 40,
    最低本数: 3,
    大陸あたり本数: {
      最小: 3,
      最大: 4
    },
    大陸判定最小マス: 12,
    幹線割合: 0.35,
    源流候補最小スコア: 2,
    源流上位抽選率: 0.35,
    源流上位最低件数: 4,
    源流重複再抽選回数: 12,
    水際回避ステップ: 2,
    流路長: {
      幹線基本: 26,
      支流基本: 18,
      追加ランダム: 10
    },
    分岐: {
      幹線予算: 2,
      支流予算: 1,
      開始年齢: 3,
      幹線確率: 0.24,
      支流確率: 0.1,
      分岐TTL倍率: 0.52,
      分岐TTL最小: 5,
      開始点最小距離: 4
    },
    網目抑制: {
      次角接続ペナルティ: 1.35,
      現在角接続ペナルティ: 0.75,
      平坦初期ペナルティ: 0.45,
      平坦後半ペナルティ: 1.8,
      平坦初期閾値: 1
    },
    網目処理: {
      有効: true,
      中央湖化: true,
      囲み辺閾値: 6
    }
  },
  高度: {
    基礎高度: 18,
    島中央隆起幅: 68,
    画面中央隆起幅: 0,
    海岸減衰幅: 44,
    海岸高地化率: {
      最小: 0.15,
      最大: 0.25
    },
    海岸高地加算: {
      最小: 10,
      最大: 18
    },
    海岸高地連鎖率: 0.35,
    ノイズ幅: 13,
    平滑化回数: 1,
    海沿岸高度Lv: -1,
    海深度最小Lv: -8,
    海深度距離係数: 1
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
    外縁高山シード率: {
      最小: 0.15,
      最大: 0.25
    },
    外縁候補比率: 0.85,
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
    対象地形キー: ["森", "丘陵", "山岳", "火山"],
    最低高度Lv: 2,
    最低山岳隣接数: 4,
    山岳判定に自マスを含む: true,
    森丘混在条件: {
      有効: true,
      最低丘陵隣接数: 1,
      最低森隣接数: 1,
      出現倍率: 1.45
    },
    海岸高地条件: {
      有効: true,
      最低海隣接数: 1,
      最低高地隣接数: 2,
      高地判定高度Lv: 2,
      出現倍率: 1.8,
      高地追加倍率: 0.14
    },
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
      川判定に自マスを含む: true,
      川判定種別: "大河", // "河川" | "大河"
      左右川で湿地化: {
        有効: true,
        判定種別: "大河" // "河川" | "大河"
      }
    }
  }
};

const 強敵配置設定 = {
  有効: true,
  基本Lv: 1,
  基本出現確率: 0.5,
  出現率倍率: 0.5,
  テリトリー半径: 3,
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

function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function randomInt(min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function normalizeIntRange(minValue, maxValue, hardMin, hardMax, fallbackMin, fallbackMax) {
  const rawMin = Number.isFinite(minValue) ? minValue : Number(minValue);
  const rawMax = Number.isFinite(maxValue) ? maxValue : Number(maxValue);
  const min = Number.isFinite(rawMin) ? Math.floor(rawMin) : fallbackMin;
  const max = Number.isFinite(rawMax) ? Math.floor(rawMax) : fallbackMax;
  const clampedMin = Math.max(hardMin, Math.min(hardMax, Math.min(min, max)));
  const clampedMax = Math.max(clampedMin, Math.min(hardMax, Math.max(min, max)));
  return { min: clampedMin, max: clampedMax };
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

function readProbabilityRange(primaryRange, fallbackRange, defaultMin, defaultMax) {
  const rawMin = Number.isFinite(primaryRange?.最小) ? primaryRange.最小 : (
    Number.isFinite(fallbackRange?.最小) ? fallbackRange.最小 : defaultMin
  );
  const rawMax = Number.isFinite(primaryRange?.最大) ? primaryRange.最大 : (
    Number.isFinite(fallbackRange?.最大) ? fallbackRange.最大 : defaultMax
  );
  const min = normalizeProbability(rawMin, defaultMin);
  const max = normalizeProbability(rawMax, defaultMax);
  return {
    min: Math.min(min, max),
    max: Math.max(min, max)
  };
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

function isValidCoordKeyText(value) {
  if (typeof value !== "string") return false;
  const [x, y] = value.split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y);
}

function normalizeCoordKeyText(value) {
  const text = String(value || "");
  if (!isValidCoordKeyText(text)) return "";
  const [x, y] = text.split(",").map(Number);
  return `${Math.floor(x)},${Math.floor(y)}`;
}

function appendEdgeEndpointsToCoordSet(targetSet, edgeIterable) {
  if (!(targetSet instanceof Set) || !edgeIterable) return;
  for (const edgeKeyRaw of edgeIterable) {
    const edgeKey = String(edgeKeyRaw || "");
    if (!edgeKey) continue;
    const [a, b] = edgeKey.split("|");
    const aKey = normalizeCoordKeyText(a);
    const bKey = normalizeCoordKeyText(b);
    if (aKey) targetSet.add(aKey);
    if (bKey) targetSet.add(bKey);
  }
}

function appendCornerEdgeTilesToCoordSet(targetSet, edgeIterable, w, h) {
  if (!(targetSet instanceof Set) || !edgeIterable) return;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
  const cornerEdgeTileMap = buildCornerEdgeTileMap(w, h);
  for (const edgeKeyRaw of edgeIterable) {
    const edgeKey = String(edgeKeyRaw || "");
    if (!edgeKey) continue;
    const tileSet = cornerEdgeTileMap.get(edgeKey);
    if (!tileSet) continue;
    for (const tileKey of tileSet) targetSet.add(tileKey);
  }
}

function buildRiverTouchSet(riverData, w = 0, h = 0) {
  const out = new Set();
  if (!riverData || typeof riverData !== "object") return out;
  for (const keyRaw of riverData.riverSet || []) {
    const key = normalizeCoordKeyText(String(keyRaw || ""));
    if (key) out.add(key);
  }
  for (const keyRaw of riverData.meshCenterSet || riverData.largeRiverSet || []) {
    const key = normalizeCoordKeyText(String(keyRaw || ""));
    if (key) out.add(key);
  }
  appendEdgeEndpointsToCoordSet(out, riverData.edgeSet);
  appendEdgeEndpointsToCoordSet(out, riverData.waterLinkSet);
  appendCornerEdgeTilesToCoordSet(out, riverData.cornerEdgeSet, w, h);
  appendCornerEdgeTilesToCoordSet(out, riverData.cornerWaterLinkSet, w, h);
  return out;
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
    if (grid[y][x] === "森" || grid[y][x] === "海" || grid[y][x] === "湖" || grid[y][x] === "河川" || grid[y][x] === "砂漠" || grid[y][x] === "荒野") {
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
  const offCenterSeedRateRange = readProbabilityRange(
    mode?.外縁高山シード率,
    rule?.外縁高山シード率,
    0.15,
    0.25
  );
  const offCenterSeedRate = offCenterSeedRateRange.min
    + (Math.random() * (offCenterSeedRateRange.max - offCenterSeedRateRange.min));
  const offCenterCandidateRatio = clamp(
    Number.isFinite(mode?.外縁候補比率)
      ? mode.外縁候補比率
      : (Number.isFinite(rule?.外縁候補比率) ? rule.外縁候補比率 : 0.85),
    0.45,
    1
  );

  if (山岳上限枚数 <= 0) {
    return {
      modeKey: mode.key,
      modeName: mode.name,
      modeSelection,
      minGap,
      foothillHillChance,
      offCenterSeedRate,
      offCenterCandidateRatio,
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
    offCenterSeedRate,
    offCenterCandidateRatio,
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
  const offCenterSeedRate = normalizeProbability(profile?.offCenterSeedRate, 0);
  const offCenterRatio = clamp(
    Number.isFinite(profile?.offCenterCandidateRatio) ? profile.offCenterCandidateRatio : 0.85,
    0.45,
    1
  );
  const offCenterBandEnd = Math.max(topSliceSize + 1, Math.floor(sortedByHeight.length * offCenterRatio));
  const offCenterCandidates = sortedByHeight.slice(topSliceSize, offCenterBandEnd);

  for (const p of 陸地一覧) {
    if (grid[p.y][p.x] === "山岳") placedSet.add(coordKey(p.x, p.y));
  }

  const canFillMountain = (x, y) => (
    allowedCoordSet.has(coordKey(x, y))
    && grid[y][x] !== "海"
    && grid[y][x] !== "山岳"
  );
  for (const massSize of profile.massSizes) {
    const useOffCenterSeed = offCenterCandidates.length > 0 && Math.random() < offCenterSeedRate;
    const seed = useOffCenterSeed
      ? (
        pickMountainSeed(offCenterCandidates, seeds, grid, profile.minGap)
        || pickMountainSeed(topCandidates, seeds, grid, profile.minGap)
        || pickMountainSeed(sortedByHeight, seeds, grid, profile.minGap)
        || pickMountainSeed(sortedByHeight, seeds, grid, 1)
      )
      : (
        pickMountainSeed(topCandidates, seeds, grid, profile.minGap)
        || pickMountainSeed(sortedByHeight, seeds, grid, profile.minGap)
        || pickMountainSeed(sortedByHeight, seeds, grid, 1)
      );
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
  const blobKeys = ["山岳", "丘陵", "森", "砂漠", "荒野"];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const t = grid[y][x];
      if (!blobKeys.includes(t)) continue;
      const same = countAround(grid, x, y, t);
      if (same >= 1) continue;
      const around = dominantNeighborTerrain(grid, x, y, ["山岳", "丘陵", "森", "平地", "荒野"]);
      next[y][x] = around || "平地";
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      grid[y][x] = next[y][x];
    }
  }
}

function applyCoastalHighlandVariation(grid, 高度マップ, w, h) {
  const heightRule = 地形生成設定?.高度 || {};
  const rateRange = readProbabilityRange(heightRule?.海岸高地化率, null, 0.15, 0.25);
  const boostRange = readRangeValue(heightRule?.海岸高地加算, null, 8, 16);
  const chainRate = normalizeProbability(heightRule?.海岸高地連鎖率, 0.35);
  const targetRate = rateRange.min + (Math.random() * (rateRange.max - rateRange.min));
  const coastCells = [];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] === "海") continue;
      const seaNear = countAround(grid, x, y, "海");
      if (seaNear <= 0) continue;
      const raw = Number.isFinite(高度マップ?.[y]?.[x]) ? 高度マップ[y][x] : 0;
      coastCells.push({
        x,
        y,
        seaNear,
        raw,
        rand: Math.random()
      });
    }
  }
  if (!coastCells.length) return 0;

  // 海に面した枚数のうち一部だけを高地化する（海岸の大半は低地のまま維持）。
  const targetCount = clamp(Math.round(coastCells.length * targetRate), 0, coastCells.length);
  if (targetCount <= 0) return 0;
  const selected = new Set();
  const ordered = [...coastCells].sort((a, b) => {
    // 既に少し高い海岸・海への接触が少ない海岸を優先して崖地形に寄せる。
    const scoreA = (a.raw * 1.1) - (a.seaNear * 6) + (a.rand * 8);
    const scoreB = (b.raw * 1.1) - (b.seaNear * 6) + (b.rand * 8);
    return scoreB - scoreA;
  });

  for (const c of ordered) {
    if (selected.size >= targetCount) break;
    const key = coordKey(c.x, c.y);
    if (selected.has(key)) continue;
    selected.add(key);
  }

  const applyBoost = (x, y, minBoost = boostRange.min, maxBoost = boostRange.max) => {
    if (!Number.isFinite(高度マップ?.[y]?.[x])) return;
    const add = randomInt(minBoost, maxBoost);
    高度マップ[y][x] = Math.round(clamp(高度マップ[y][x] + add, 1, 100));
  };

  let changed = 0;
  for (const key of selected) {
    const pos = parseCoordKey(key);
    if (!pos) continue;
    applyBoost(pos.x, pos.y);
    changed += 1;
    const neighbors = getHexNeighborCoords(w, h, pos.x, pos.y);
    for (const n of neighbors) {
      if (Math.random() >= chainRate) continue;
      if (grid[n.y][n.x] === "海") continue;
      if (countAround(grid, n.x, n.y, "海") <= 0) continue;
      applyBoost(n.x, n.y, Math.max(1, boostRange.min - 4), Math.max(2, boostRange.max - 6));
    }
  }
  return changed;
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

  applyCoastalHighlandVariation(grid, 高度マップ, w, h);

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

function applyWastelandTransition(grid, reliefMap, w, h) {
  const toWasteland = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] !== "平地") continue;
      const relief = reliefMap?.[y]?.[x];
      if (relief !== "平地" && relief !== "丘陵") continue;
      const desertNear = countAround(grid, x, y, "砂漠");
      if (desertNear <= 0) continue;
      const forestNear = countAround(grid, x, y, "森");
      const seaNear = countAround(grid, x, y, "海");
      const lakeNear = countAround(grid, x, y, "湖");
      const riverNear = countAround(grid, x, y, "河川");
      const dryness = desertLatitudeWeight(y, h);
      const aridScore = (desertNear * 1.35)
        + (dryness * 1.4)
        - (forestNear * 1.15)
        - (lakeNear * 0.9)
        - (riverNear * 0.45)
        - (seaNear * 0.35);
      if (aridScore >= 2.05 || (desertNear >= 2 && forestNear === 0 && dryness >= 0.4)) {
        toWasteland.push({ x, y });
      }
    }
  }
  for (const p of toWasteland) {
    grid[p.y][p.x] = "荒野";
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] !== "荒野") continue;
      const desertNear = countAround(grid, x, y, "砂漠");
      const forestNear = countAround(grid, x, y, "森");
      if (forestNear >= 2 && desertNear <= 1) {
        grid[y][x] = "平地";
      }
    }
  }
  return toWasteland.length;
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

function buildSeaDistanceMapFromLand(grid, w, h) {
  const distanceMap = buildInitialGrid(w, h, Number.POSITIVE_INFINITY);
  const queue = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] === "海") continue;
      distanceMap[y][x] = 0;
      queue.push({ x, y });
    }
  }
  if (!queue.length) {
    return buildInitialGrid(w, h, 1);
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    const baseDistance = Number(distanceMap[cur.y][cur.x]) || 0;
    const neighbors = getHexNeighborCoords(w, h, cur.x, cur.y);
    for (const n of neighbors) {
      if (grid[n.y][n.x] !== "海") continue;
      const nextDistance = baseDistance + 1;
      if (nextDistance >= distanceMap[n.y][n.x]) continue;
      distanceMap[n.y][n.x] = nextDistance;
      queue.push({ x: n.x, y: n.y });
    }
  }
  return distanceMap;
}

function resolveSeaHeightLevelByDistance(distanceFromLand) {
  const coastalLevel = Number.isFinite(地形生成設定.高度.海沿岸高度Lv)
    ? Math.floor(地形生成設定.高度.海沿岸高度Lv)
    : -1;
  const minLevel = Number.isFinite(地形生成設定.高度.海深度最小Lv)
    ? Math.floor(地形生成設定.高度.海深度最小Lv)
    : -8;
  const distanceFactor = Number.isFinite(地形生成設定.高度.海深度距離係数)
    ? Math.max(0.1, Number(地形生成設定.高度.海深度距離係数))
    : 1;
  const distBase = Number.isFinite(distanceFromLand) ? Number(distanceFromLand) : 1;
  const dist = Math.max(1, Math.floor(distBase));
  const depthStep = Math.max(0, Math.floor((dist - 1) * distanceFactor));
  return clamp(coastalLevel - depthStep, minLevel, coastalLevel);
}

function buildHeightLevelMap(grid, 高度マップ, w, h) {
  const levelMap = buildInitialGrid(w, h, null);
  const seaDistanceMap = buildSeaDistanceMapFromLand(grid, w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const terrain = grid[y][x];
      if (terrain === "海") {
        const distanceFromLand = seaDistanceMap?.[y]?.[x];
        levelMap[y][x] = resolveSeaHeightLevelByDistance(distanceFromLand);
        continue;
      }
      if (terrain === "湖") {
        continue;
      }
      const raw = Number.isFinite(高度マップ?.[y]?.[x]) ? 高度マップ[y][x] : 35;
      let level = Math.round((raw - 42) / 10);
      if (terrain === "山岳") level += 1;
      if (terrain === "火山") level += 2;
      if (terrain === "丘陵") level = Math.max(level, 1);
      if (terrain === "山岳") level = Math.max(level, 2);
      if (terrain === "火山") level = Math.max(level, 3);
      levelMap[y][x] = clamp(level, -1, 8);
    }
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] !== "湖") continue;
      const neighborLevels = getHexNeighborCoords(w, h, x, y)
        .map(n => ({ level: levelMap?.[n.y]?.[n.x], terrain: grid?.[n.y]?.[n.x] }))
        .filter(n => n.terrain !== "海" && Number.isFinite(n.level))
        .map(n => Number(n.level));
      if (!neighborLevels.length) {
        levelMap[y][x] = -1;
        continue;
      }
      const average = Math.round(neighborLevels.reduce((sum, value) => sum + value, 0) / neighborLevels.length);
      const minLevel = Math.min(...neighborLevels);
      const maxLevel = Math.max(...neighborLevels);
      // 湖は周囲より約1段低い水準に寄せる
      const aroundMinusOne = average - 1;
      const normalized = Math.max(minLevel - 1, Math.min(maxLevel, aroundMinusOne));
      levelMap[y][x] = clamp(normalized, -2, 7);
    }
  }
  return levelMap;
}

function applyMeshRiverLakeTiles(grid, meshCenterSet, heightLevelMap, w, h) {
  if (!Array.isArray(grid) || !(meshCenterSet instanceof Set) || !meshCenterSet.size) return 0;
  let converted = 0;
  for (const keyRaw of meshCenterSet) {
    const pos = parseCoordKey(String(keyRaw || ""));
    if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) continue;
    const x = Math.floor(pos.x);
    const y = Math.floor(pos.y);
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const terrain = grid?.[y]?.[x];
    if (!terrain || terrain === "海" || terrain === "湖") continue;
    grid[y][x] = "湖";
    converted += 1;

    if (!Array.isArray(heightLevelMap) || !Array.isArray(heightLevelMap[y])) continue;
    const neighborLevels = getHexNeighborCoords(w, h, x, y)
      .map(n => ({ level: heightLevelMap?.[n.y]?.[n.x], terrain: grid?.[n.y]?.[n.x] }))
      .filter(n => n.terrain !== "海" && Number.isFinite(n.level))
      .map(n => Number(n.level));
    if (!neighborLevels.length) {
      heightLevelMap[y][x] = -1;
      continue;
    }
    const average = Math.round(neighborLevels.reduce((sum, value) => sum + value, 0) / neighborLevels.length);
    const minLevel = Math.min(...neighborLevels);
    const maxLevel = Math.max(...neighborLevels);
    const aroundMinusOne = average - 1;
    const normalized = Math.max(minLevel - 1, Math.min(maxLevel, aroundMinusOne));
    heightLevelMap[y][x] = clamp(normalized, -2, 7);
  }
  return converted;
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
  const caveCoastAnchorMap = buildInitialGrid(w, h, "");
  const riverSet = riverData?.riverSet instanceof Set ? riverData.riverSet : new Set();
  const riverTouchSet = riverData?.riverTouchSet instanceof Set
    ? riverData.riverTouchSet
    : buildRiverTouchSet(riverData || {}, w, h);
  const majorRiverSet = riverData?.largeRiverSet instanceof Set
    ? riverData.largeRiverSet
    : (riverData?.meshCenterSet instanceof Set ? riverData.meshCenterSet : new Set());
  const canyonRule = 特殊地形設定.峡谷;
  const caveRule = 特殊地形設定.洞窟;
  const wetRule = 特殊地形設定.沼地.湿潤条件;
  const waterTerrainSet = new Set(wetRule.水地形キー || []);
  const canyonTerrainSet = new Set(canyonRule.対象地形キー || []);
  const caveTerrainSet = new Set(caveRule.対象地形キー || []);
  const resolveRiverJudgeSet = judgeType => (judgeType === "大河" ? majorRiverSet : riverTouchSet);
  const wetRiverSet = resolveRiverJudgeSet(String(wetRule.川判定種別 || "河川"));
  const leftRightRule = wetRule.左右川で湿地化 || {};
  const leftRightRiverSet = resolveRiverJudgeSet(String(leftRightRule.判定種別 || wetRule.川判定種別 || "河川"));

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const terrain = grid[y][x];
      const level = 高度レベルマップ?.[y]?.[x];
      const tileKey = `${x},${y}`;
      const neighbors = getHexNeighborCoords(w, h, x, y);

      if (canyonTerrainSet.has(terrain) && Number.isFinite(level) && level >= canyonRule.最低高度Lv) {
        const riverBase = (canyonRule.川判定に自マスを含む && riverTouchSet.has(tileKey)) ? 1 : 0;
        const riverNear = neighbors.reduce((sum, n) => (
          sum + (riverTouchSet.has(`${n.x},${n.y}`) ? 1 : 0)
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
        const seaNear = neighbors.reduce((sum, n) => (
          sum + (grid[n.y][n.x] === "海" ? 1 : 0)
        ), 0);
        const seaNeighbors = neighbors.filter(n => grid[n.y][n.x] === "海");
        const forestNear = neighbors.reduce((sum, n) => (
          sum + (grid[n.y][n.x] === "森" ? 1 : 0)
        ), terrain === "森" ? 1 : 0);
        const hillNear = neighbors.reduce((sum, n) => (
          sum + (grid[n.y][n.x] === "丘陵" ? 1 : 0)
        ), terrain === "丘陵" ? 1 : 0);

        const forestHillRule = caveRule.森丘混在条件 || {};
        const coastRule = caveRule.海岸高地条件 || {};
        const baseChance = normalizeProbability(地形生成設定.確率.洞窟化, 0.1);

        const forestHillEligible = (
          forestHillRule.有効 !== false
          && forestNear >= Math.max(1, Math.floor(toSafeNumber(forestHillRule.最低森隣接数, 1)))
          && hillNear >= Math.max(1, Math.floor(toSafeNumber(forestHillRule.最低丘陵隣接数, 1)))
        );

        const highLevelThreshold = Math.max(1, Math.floor(toSafeNumber(coastRule.高地判定高度Lv, 2)));
        const highNear = neighbors.reduce((sum, n) => {
          const nLevel = Number(高度レベルマップ?.[n.y]?.[n.x]);
          if (!Number.isFinite(nLevel)) return sum;
          return sum + (nLevel >= highLevelThreshold ? 1 : 0);
        }, 0);
        const coastEligible = (
          coastRule.有効 !== false
          && seaNear >= Math.max(1, Math.floor(toSafeNumber(coastRule.最低海隣接数, 1)))
          && highNear >= Math.max(1, Math.floor(toSafeNumber(coastRule.最低高地隣接数, 2)))
        );

        const mountainEligible = mountainNear >= caveRule.最低山岳隣接数;
        const caveEligible = mountainEligible || forestHillEligible || coastEligible;
        if (caveEligible) {
          let chance = baseChance;
          if (forestHillEligible) {
            chance *= Math.max(1, toSafeNumber(forestHillRule.出現倍率, 1.45));
          }
          if (coastEligible) {
            const coastBoost = Math.max(1, toSafeNumber(coastRule.出現倍率, 1.8));
            const extraPerHigh = Math.max(0, toSafeNumber(coastRule.高地追加倍率, 0.14));
            const overHigh = Math.max(0, highNear - Math.floor(toSafeNumber(coastRule.最低高地隣接数, 2)));
            chance *= coastBoost * (1 + (overHigh * extraPerHigh));
          }
          chance = clamp(chance, 0, 0.92);
          if (Math.random() < chance) {
            specialMap[y][x] = "洞窟";
            if (coastEligible && seaNeighbors.length) {
              const targetSea = seaNeighbors[Math.floor(Math.random() * seaNeighbors.length)];
              caveCoastAnchorMap[y][x] = coordKey(targetSea.x, targetSea.y);
            }
            specialCounts.洞窟 += 1;
            continue;
          }
        }
      }

      if (terrain !== "森") continue;
      if (Number.isFinite(level) && level > 特殊地形設定.沼地.最大高度Lv) continue;
      const waterBase = (wetRule.水判定に自マスを含む && waterTerrainSet.has(grid[y][x])) ? 1 : 0;
      const waterNear = neighbors.reduce((sum, n) => {
        const terrain = grid[n.y][n.x];
        return sum + (waterTerrainSet.has(terrain) ? 1 : 0);
      }, waterBase);
      const riverBase = (wetRule.川判定に自マスを含む && wetRiverSet.has(tileKey)) ? 1 : 0;
      const riverNear = neighbors.reduce((sum, n) => (
        sum + (wetRiverSet.has(`${n.x},${n.y}`) ? 1 : 0)
      ), riverBase);
      const hasLeftRightRiver = (
        leftRightRule.有効 !== false
        && x > 0
        && x < (w - 1)
        && leftRightRiverSet.has(`${x - 1},${y}`)
        && leftRightRiverSet.has(`${x + 1},${y}`)
      );

      const isWetForest = (
        waterNear >= wetRule.最低水隣接数
        || riverNear >= wetRule.最低川隣接数
        || hasLeftRightRiver
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

  return { specialMap, specialCounts, caveSizeMap, caveScaleMap, caveCoastAnchorMap };
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
  const spawnChanceScale = clamp(toSafeNumber(setting?.出現率倍率, 0.5), 0, 1);
  const baseChance = clamp(normalizeProbability(setting.基本出現確率, 0.5) * spawnChanceScale, 0, 1);
  const territoryRadiusBase = Math.max(1, Math.floor(toSafeNumber(setting?.テリトリー半径, 3)));
  const allowRuleOverlap = setting.重複ルール許可 === true;
  const rules = setting.ルール || {};
  const relief = reliefMap || grid;
  const spawned = new Set();
  const occupiedStrongTerritories = [];
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
  const oddrToCube = (x, y) => {
    const q = x - ((y - (y & 1)) / 2);
    const r = y;
    const cx = q;
    const cz = r;
    const cy = -cx - cz;
    return { x: cx, y: cy, z: cz };
  };
  const hexDistance = (ax, ay, bx, by) => {
    const a = oddrToCube(ax, ay);
    const b = oddrToCube(bx, by);
    return Math.max(
      Math.abs(a.x - b.x),
      Math.abs(a.y - b.y),
      Math.abs(a.z - b.z)
    );
  };
  const isStrongTerritoryOverlapped = (x, y, radius) => occupiedStrongTerritories.some(territory => {
    const distance = hexDistance(x, y, territory.x, territory.y);
    const threshold = Math.max(1, Math.floor(toSafeNumber(radius, territoryRadiusBase)))
      + Math.max(1, Math.floor(toSafeNumber(territory.radius, territoryRadiusBase)));
    return distance <= threshold;
  });
  const addSpawn = (x, y, level, ruleKey, extra = null) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const terrain = terrainAt(x, y);
    if (!terrain || terrain === "海") return false;
    const key = `${x},${y}`;
    const lv = Math.max(1, Math.floor(level || baseLevel));
    const current = strongMonsterInfoMap[y][x];
    if (current && !allowRuleOverlap) return false;
    if (!current) {
      const territoryRadius = Math.max(
        1,
        Math.floor(toSafeNumber(extra?.territoryRadius, territoryRadiusBase))
      );
      if (isStrongTerritoryOverlapped(x, y, territoryRadius)) return false;
      strongMonsterMap[y][x] = "強敵候補";
      strongMonsterInfoMap[y][x] = {
        level: lv,
        rules: [ruleKey],
        terrain,
        relief: reliefAt(x, y),
        heightLevel: heightLevelAt(x, y),
        territoryId: `strong-${x}-${y}`,
        territoryCenterX: x,
        territoryCenterY: y,
        territoryRadius,
        extra
      };
      occupiedStrongTerritories.push({ x, y, radius: territoryRadius });
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
    const perCandidateChance = clamp(
      normalizeProbability(largeForestRule.各候補出現確率, 0.5) * spawnChanceScale,
      0,
      1
    );
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
    const hasCustomChance = Number.isFinite(toSafeNumber(ringForestRule.出現確率, Number.NaN));
    const chance = hasCustomChance
      ? clamp(normalizeProbability(ringForestRule.出現確率, baseChance) * spawnChanceScale, 0, 1)
      : baseChance;
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

function buildHexCornerPoints(x, y) {
  const tileW = Math.max(1, toSafeNumber(HEX_TILE_CONFIG?.width, 40));
  const tileH = Math.max(1, toSafeNumber(HEX_TILE_CONFIG?.height, 48));
  const rowStep = Math.max(1, toSafeNumber(HEX_TILE_CONFIG?.rowStep, 36));
  const oddRowOffsetX = toSafeNumber(HEX_TILE_CONFIG?.oddRowOffsetX, tileW / 2);
  const halfW = tileW / 2;
  const upperY = tileH - rowStep;
  const lowerY = rowStep;
  const offsetX = (y % 2 === 1) ? oddRowOffsetX : 0;
  const left = (x * tileW) + offsetX;
  const top = y * rowStep;
  return [
    { x: left + halfW, y: top + 0 },
    { x: left + tileW, y: top + upperY },
    { x: left + tileW, y: top + lowerY },
    { x: left + halfW, y: top + tileH },
    { x: left + 0, y: top + lowerY },
    { x: left + 0, y: top + upperY }
  ];
}

function cornerCoordKey(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return "";
  const x = Math.round(point.x * 1000) / 1000;
  const y = Math.round(point.y * 1000) / 1000;
  return `${x},${y}`;
}

function riverEdgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildCornerLevelMapFromHeight(heightLevelMap, w, h) {
  const cornerLevelBuckets = new Map();
  const cornerTileMap = new Map();
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const lv = Number(heightLevelMap?.[y]?.[x]);
      if (!Number.isFinite(lv)) continue;
      const tileKey = coordKey(x, y);
      const points = buildHexCornerPoints(x, y);
      for (const point of points) {
        const cKey = cornerCoordKey(point);
        if (!cKey) continue;
        if (!cornerLevelBuckets.has(cKey)) cornerLevelBuckets.set(cKey, []);
        cornerLevelBuckets.get(cKey).push(lv);
        if (!cornerTileMap.has(cKey)) cornerTileMap.set(cKey, new Set());
        cornerTileMap.get(cKey).add(tileKey);
      }
    }
  }
  const cornerLevelMap = new Map();
  for (const [cKey, values] of cornerLevelBuckets.entries()) {
    if (!Array.isArray(values) || !values.length) continue;
    cornerLevelMap.set(cKey, Math.min(...values));
  }
  return { cornerLevelMap, cornerTileMap };
}

function buildCornerEdgeTileMap(w, h) {
  const out = new Map();
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const tileKey = coordKey(x, y);
      const corners = buildHexCornerPoints(x, y)
        .map(cornerCoordKey)
        .filter(Boolean);
      if (corners.length !== 6) continue;
      for (let i = 0; i < corners.length; i += 1) {
        const edgeKey = riverEdgeKey(corners[i], corners[(i + 1) % corners.length]);
        if (!out.has(edgeKey)) out.set(edgeKey, new Set());
        out.get(edgeKey).add(tileKey);
      }
    }
  }
  return out;
}

function augmentRiverDataWithWaterfalls(riverData, heightLevelMap) {
  const waterfallSet = new Set();
  const waterfallEdgeSet = new Set();
  const cornerWaterfallEdgeSet = new Set();
  const blockedCornerNodeSet = new Set();
  const blockedTileNodeSet = new Set();
  const baseWaterfallChance = normalizeProbability(地形生成設定?.確率?.滝化, 0.18);
  if (!riverData) return { waterfallSet, waterfallEdgeSet, cornerWaterfallEdgeSet, riverTouchSet: new Set() };

  const levelMapH = Array.isArray(heightLevelMap) ? heightLevelMap.length : 0;
  const levelMapW = levelMapH > 0 && Array.isArray(heightLevelMap[0]) ? heightLevelMap[0].length : 0;
  const hasCornerRiverEdges = ((riverData.cornerEdgeSet?.size || 0) + (riverData.cornerWaterLinkSet?.size || 0)) > 0;

  if (hasCornerRiverEdges && levelMapW > 0 && levelMapH > 0) {
    const { cornerLevelMap, cornerTileMap } = buildCornerLevelMapFromHeight(heightLevelMap, levelMapW, levelMapH);
    const cornerEdgeTileMap = buildCornerEdgeTileMap(levelMapW, levelMapH);
    const tileLevelOf = tileKey => {
      const p = parseCoordKey(String(tileKey || ""));
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return Number.NEGATIVE_INFINITY;
      const lv = Number(heightLevelMap?.[p.y]?.[p.x]);
      return Number.isFinite(lv) ? lv : Number.NEGATIVE_INFINITY;
    };
    const markCornerEdgeIfWaterfall = (edgeKey, isWaterLink = false) => {
      const [a, b] = String(edgeKey || "").split("|");
      if (!a || !b) return;
      if (blockedCornerNodeSet.has(a) || blockedCornerNodeSet.has(b)) return;
      const al = Number(cornerLevelMap.get(a));
      const bl = Number(cornerLevelMap.get(b));
      if (!Number.isFinite(al) || !Number.isFinite(bl)) return;
      const high = Math.max(al, bl);
      const low = Math.min(al, bl);
      const drop = high - low;
      if (!(high >= 2 && drop >= 1)) return;

      const edgeTiles = [...(cornerEdgeTileMap.get(edgeKey) || [])];
      const riverTilesOnEdge = edgeTiles.filter(tileKey => riverData.riverSet?.has(tileKey));
      if (!riverTilesOnEdge.length) return;

      if (isWaterLink && drop < 2) return;
      let chance = baseWaterfallChance + Math.min(0.28, Math.max(0, drop - 1) * 0.12);
      if (isWaterLink) chance *= 0.45;
      if (Math.random() >= chance) return;

      cornerWaterfallEdgeSet.add(edgeKey);
      blockedCornerNodeSet.add(a);
      blockedCornerNodeSet.add(b);
      const sortedTiles = riverTilesOnEdge
        .map(tileKey => ({ tileKey, level: tileLevelOf(tileKey), tie: Math.random() }))
        .sort((lhs, rhs) => rhs.level - lhs.level || lhs.tie - rhs.tie);
      const chosenTileKey = sortedTiles[0]?.tileKey || riverTilesOnEdge[0];
      if (chosenTileKey) waterfallSet.add(chosenTileKey);
    };
    for (const edge of riverData.cornerEdgeSet || []) markCornerEdgeIfWaterfall(edge, false);
    for (const edge of riverData.cornerWaterLinkSet || []) markCornerEdgeIfWaterfall(edge, true);
  } else {
    const markTileEdgeIfWaterfall = edgeKey => {
      const [a, b] = String(edgeKey || "").split("|");
      if (!a || !b) return;
      if (blockedTileNodeSet.has(a) || blockedTileNodeSet.has(b)) return;
      const pa = parseCoordKey(a);
      const pb = parseCoordKey(b);
      const al = heightLevelMap?.[pa.y]?.[pa.x];
      const bl = heightLevelMap?.[pb.y]?.[pb.x];
      if (!Number.isFinite(al) || !Number.isFinite(bl)) return;
      const high = Math.max(al, bl);
      const low = Math.min(al, bl);
      const drop = high - low;
      if (!(high >= 2 && drop >= 1)) return;
      const chance = baseWaterfallChance + Math.min(0.28, Math.max(0, drop - 1) * 0.12);
      if (Math.random() >= chance) return;

      waterfallEdgeSet.add(edgeKey);
      blockedTileNodeSet.add(a);
      blockedTileNodeSet.add(b);
      const candidates = [];
      if (riverData.riverSet?.has(a)) candidates.push({ key: a, level: Number(al), tie: Math.random() });
      if (riverData.riverSet?.has(b)) candidates.push({ key: b, level: Number(bl), tie: Math.random() });
      candidates.sort((lhs, rhs) => rhs.level - lhs.level || lhs.tie - rhs.tie);
      if (candidates[0]?.key) waterfallSet.add(candidates[0].key);
    };
    for (const edge of riverData.edgeSet || []) markTileEdgeIfWaterfall(edge);
    for (const edge of riverData.waterLinkSet || []) markTileEdgeIfWaterfall(edge);
  }

  return {
    ...riverData,
    riverTouchSet: buildRiverTouchSet(riverData, levelMapW, levelMapH),
    waterfallSet,
    waterfallEdgeSet,
    cornerWaterfallEdgeSet
  };
}

function generateRivers(grid, w, h, totalTiles, heightMap, heightLevelMap, islandCustomSettings = null) {
  const seas = listCoordsByTerrain(grid, "海");
  const waters = [...seas, ...listCoordsByTerrain(grid, "湖")];
  const riverSet = new Set();
  const sourceSet = new Set();
  const branchSet = new Set();
  const mouthSet = new Set();
  const edgeSet = new Set();
  const waterLinkSet = new Set();
  const cornerEdgeSet = new Set();
  const cornerWaterLinkSet = new Set();

  if (!waters.length) {
    return {
      riverSet,
      sourceSet,
      branchSet,
      mouthSet,
      edgeSet,
      waterLinkSet,
      cornerEdgeSet,
      cornerWaterLinkSet,
      meshCenterSet: new Set(),
      largeRiverSet: new Set(),
      riverTouchSet: new Set()
    };
  }

  const flowLevelMap = (heightLevelMap && heightLevelMap.length)
    ? heightLevelMap.map(row => [...row])
    : buildHeightLevelMap(grid, heightMap, w, h);
  const riverRule = 地形生成設定.河川 || {};
  const riverFlowRule = riverRule.流路長 || {};
  const riverMeshHandlingRule = riverRule.網目処理 || {};
  const sourceRetryLimit = Math.max(8, Math.floor(toSafeNumber(riverRule.源流重複再抽選回数, 28)));
  const majorMinLength = Math.max(6, Math.floor(toSafeNumber(riverFlowRule.主河川最小長, 6)));
  const majorMaxLength = Math.max(majorMinLength + 4, Math.floor(toSafeNumber(riverFlowRule.主河川最大長, Math.max(12, Math.floor((w + h) * 0.58)))));
  const minorMinLength = Math.max(3, Math.floor(toSafeNumber(riverFlowRule.小河川最小長, 3)));
  const minorMaxLength = Math.max(minorMinLength, Math.floor(toSafeNumber(riverFlowRule.小河川最大長, 8)));
  const majorMouthMinDistance = Math.max(1, Math.floor(toSafeNumber(riverRule.主河川河口最小距離, 6)));
  const majorMidMinDistance = Math.max(1, Math.floor(toSafeNumber(riverRule.主河川中間最小距離, 4)));
  const minorSpacingDistance = Math.max(1, Math.floor(toSafeNumber(riverRule.小河川最小距離, 2)));
  const minorDensityDivisor = Math.max(120, Math.floor(toSafeNumber(riverRule.小河川密度係数, 210)));
  const minorRetryLimitPerRiver = Math.max(8, Math.floor(toSafeNumber(riverRule.小河川再生成上限, 22)));
  const branchRule = riverRule.分岐 || {};
  // 枝分かれの発生率。既定で25%に抑える。
  const branchSpawnRate = clamp(normalizeProbability(branchRule.幹線確率, 0.25), 0, 1);
  const branchMinorRate = clamp(normalizeProbability(branchRule.支流確率, 0.1), 0, 1);
  const branchStartMinDistance = Math.max(2, Math.floor(toSafeNumber(branchRule.開始点最小距離, 4)));
  // 枝分かれした先は短すぎないように、通常の小河川より長めにする。
  const branchLengthFactor = clamp(toSafeNumber(branchRule.分岐TTL倍率, 0.52), 0.45, 0.9);
  const branchMinLength = Math.max(
    Math.floor(toSafeNumber(branchRule.分岐TTL最小, 5)),
    minorMinLength + 2,
    Math.floor(majorMinLength * Math.max(0.6, branchLengthFactor))
  );
  const branchMaxLength = Math.max(branchMinLength + 4, Math.floor(majorMaxLength * Math.min(0.88, branchLengthFactor + 0.22)));
  const meshLoopEnabled = riverMeshHandlingRule.有効 !== false;
  const meshLoopThreshold = Math.max(3, Math.min(6, Math.floor(Number.isFinite(riverMeshHandlingRule.囲み辺閾値) ? riverMeshHandlingRule.囲み辺閾値 : 6)));
  const continentMinTiles = Math.max(1, Math.floor(toSafeNumber(riverRule.大陸判定最小マス, 12)));
  const customRiverMinRaw = Number(islandCustomSettings?.riverPerContinentMin);
  const customRiverMaxRaw = Number(islandCustomSettings?.riverPerContinentMax);
  const hasCustomRiverRange = Number.isFinite(customRiverMinRaw) && Number.isFinite(customRiverMaxRaw);
  const customRiverMin = hasCustomRiverRange ? Math.max(0, Math.floor(Math.min(customRiverMinRaw, customRiverMaxRaw))) : 0;
  const customRiverMax = hasCustomRiverRange ? Math.max(customRiverMin, Math.floor(Math.max(customRiverMinRaw, customRiverMaxRaw))) : 0;

  const isWaterTerrain = terrain => terrain === "海" || terrain === "湖";
  const keyOf = (x, y) => `${x},${y}`;
  const getLevel = (x, y) => {
    if (y < 0 || y >= h || x < 0 || x >= w) return -2;
    return flowLevelMap[y][x];
  };
  const oddrToCube = (x, y) => {
    const q = x - ((y - (y & 1)) / 2);
    const r = y;
    const cx = q;
    const cz = r;
    const cy = -cx - cz;
    return { x: cx, y: cy, z: cz };
  };
  const hexDistance = (ax, ay, bx, by) => {
    const a = oddrToCube(ax, ay);
    const b = oddrToCube(bx, by);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  };

  const tileCornersMap = new Map();
  const edgeInfoMap = new Map();
  const tilePairToCornerEdgeMap = new Map();

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const tileKey = keyOf(x, y);
      const cornerKeys = buildHexCornerPoints(x, y).map(cornerCoordKey).filter(Boolean);
      if (cornerKeys.length !== 6) continue;
      tileCornersMap.set(tileKey, cornerKeys);
      for (let i = 0; i < cornerKeys.length; i += 1) {
        const a = cornerKeys[i];
        const b = cornerKeys[(i + 1) % cornerKeys.length];
        const edgeKey = riverEdgeKey(a, b);
        if (!edgeInfoMap.has(edgeKey)) edgeInfoMap.set(edgeKey, { a, b, tileKeys: new Set() });
        edgeInfoMap.get(edgeKey).tileKeys.add(tileKey);
      }
    }
  }

  for (const [cornerEdgeKey, edgeInfo] of edgeInfoMap.entries()) {
    const sideKeys = [...(edgeInfo?.tileKeys || [])];
    if (sideKeys.length !== 2) continue;
    tilePairToCornerEdgeMap.set(riverEdgeKey(sideKeys[0], sideKeys[1]), cornerEdgeKey);
  }

  const isTileKeyWater = tileKey => {
    const pos = parseCoordKey(tileKey);
    if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y)) return false;
    return isWaterTerrain(grid[pos.y]?.[pos.x]);
  };

  const splitCornerEdgeKey = edgeKey => {
    const [a, b] = String(edgeKey || "").split("|");
    if (!a || !b) return null;
    return [a, b];
  };

  const buildBridgeCornerEdgesOnTile = (tileKey, prevEndpoints, nextEndpoints) => {
    const corners = tileCornersMap.get(tileKey);
    if (!Array.isArray(corners) || corners.length !== 6) return [];
    if (!Array.isArray(prevEndpoints) || prevEndpoints.length !== 2) return [];
    if (!Array.isArray(nextEndpoints) || nextEndpoints.length !== 2) return [];
    const idxMap = new Map(corners.map((key, i) => [key, i]));

    let bestPair = null;
    for (const fromKey of prevEndpoints) {
      const fromIdx = idxMap.get(fromKey);
      if (!Number.isFinite(fromIdx)) continue;
      for (const toKey of nextEndpoints) {
        const toIdx = idxMap.get(toKey);
        if (!Number.isFinite(toIdx)) continue;
        if (fromIdx === toIdx) continue;
        const cw = (toIdx - fromIdx + 6) % 6;
        const ccw = (fromIdx - toIdx + 6) % 6;
        const steps = Math.min(cw, ccw);
        if (!bestPair || steps < bestPair.steps) {
          bestPair = { fromIdx, toIdx, cw, ccw, steps };
        }
      }
    }
    if (!bestPair) return [];
    const useCw = bestPair.cw <= bestPair.ccw;
    const dir = useCw ? 1 : -1;
    const edges = [];
    let idx = bestPair.fromIdx;
    while (idx !== bestPair.toIdx) {
      const nextIdx = (idx + dir + 6) % 6;
      const a = corners[idx];
      const b = corners[nextIdx];
      if (a && b) edges.push(riverEdgeKey(a, b));
      idx = nextIdx;
    }
    return edges;
  };

  const waterDistanceMap = buildInitialGrid(w, h, Number.POSITIVE_INFINITY);
  const waterQueue = [];
  for (const src of waters) {
    if (!Number.isFinite(src?.x) || !Number.isFinite(src?.y)) continue;
    if (src.x < 0 || src.x >= w || src.y < 0 || src.y >= h) continue;
    if (waterDistanceMap[src.y][src.x] !== Number.POSITIVE_INFINITY) continue;
    waterDistanceMap[src.y][src.x] = 0;
    waterQueue.push({ x: src.x, y: src.y });
  }
  for (let q = 0; q < waterQueue.length; q += 1) {
    const cur = waterQueue[q];
    const curDist = waterDistanceMap[cur.y][cur.x];
    for (const n of getHexNeighborCoords(w, h, cur.x, cur.y)) {
      const nextDist = curDist + 1;
      if (nextDist >= waterDistanceMap[n.y][n.x]) continue;
      waterDistanceMap[n.y][n.x] = nextDist;
      waterQueue.push({ x: n.x, y: n.y });
    }
  }

  const majorRiverCoords = [];
  const majorMouthCoords = [];
  const allRiverCoords = [];
  const allRiverCoordSet = new Set();
  const majorRiverSet = new Set();

  const ensureAllRiverCoord = (x, y) => {
    const k = keyOf(x, y);
    if (allRiverCoordSet.has(k)) return;
    allRiverCoordSet.add(k);
    allRiverCoords.push({ x, y });
  };

  const registerTileEdge = (fromTileKey, toTileKey, useWaterLink = false) => {
    const tileEdgeKey = riverEdgeKey(fromTileKey, toTileKey);
    if (useWaterLink) waterLinkSet.add(tileEdgeKey);
    else edgeSet.add(tileEdgeKey);
    const cornerEdgeKey = tilePairToCornerEdgeMap.get(tileEdgeKey);
    if (cornerEdgeKey) {
      if (useWaterLink) cornerWaterLinkSet.add(cornerEdgeKey);
      else cornerEdgeSet.add(cornerEdgeKey);
    }
    const fromIsWater = isTileKeyWater(fromTileKey);
    const toIsWater = isTileKeyWater(toTileKey);
    if (!fromIsWater) riverSet.add(fromTileKey);
    if (!toIsWater) riverSet.add(toTileKey);
    if (useWaterLink) {
      if (!fromIsWater) mouthSet.add(fromTileKey);
      if (!toIsWater) mouthSet.add(toTileKey);
    }
  };

  const majorCountBySize = size => {
    if (hasCustomRiverRange) {
      if (size < continentMinTiles) return 0;
      return Math.min(6, Math.max(0, randomInt(customRiverMin, customRiverMax)));
    }
    if (size < 40) return 0;
    if (size < 120) return 1;
    if (size < 220) return 2;
    if (size < 360) return 3;
    if (size < 540) return 4;
    if (size < 760) return 5;
    return 6;
  };

  const isSeaMouthRoute = route => {
    if (!route?.ok || !route?.mouth) return false;
    const mx = Number(route.mouth.x);
    const my = Number(route.mouth.y);
    if (!Number.isFinite(mx) || !Number.isFinite(my)) return false;
    return grid[my]?.[mx] === "海";
  };

  const buildLandmassComponents = () => {
    const visited = buildInitialGrid(w, h, false);
    const components = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (visited[y][x]) continue;
        if (isWaterTerrain(grid[y][x])) continue;
        const queue = [{ x, y }];
        const cells = [];
        visited[y][x] = true;
        for (let q = 0; q < queue.length; q += 1) {
          const cur = queue[q];
          cells.push(cur);
          for (const n of getHexNeighborCoords(w, h, cur.x, cur.y)) {
            if (visited[n.y][n.x]) continue;
            if (isWaterTerrain(grid[n.y][n.x])) continue;
            visited[n.y][n.x] = true;
            queue.push({ x: n.x, y: n.y });
          }
        }
        if (!cells.length) continue;
        const cx = cells.reduce((sum, c) => sum + c.x, 0) / cells.length;
        const cy = cells.reduce((sum, c) => sum + c.y, 0) / cells.length;
        components.push({ cells, size: cells.length, cx, cy });
      }
    }
    return components;
  };

  const listMountainCenters = component => {
    const componentKeySet = new Set(component.cells.map(c => keyOf(c.x, c.y)));
    const visited = new Set();
    const centers = [];
    for (const cell of component.cells) {
      const terrain = grid[cell.y][cell.x];
      if (!isMountainLikeTerrain(terrain)) continue;
      const sKey = keyOf(cell.x, cell.y);
      if (visited.has(sKey)) continue;
      const queue = [cell];
      const cluster = [];
      visited.add(sKey);
      for (let q = 0; q < queue.length; q += 1) {
        const cur = queue[q];
        cluster.push(cur);
        for (const n of getHexNeighborCoords(w, h, cur.x, cur.y)) {
          const nKey = keyOf(n.x, n.y);
          if (visited.has(nKey)) continue;
          if (!componentKeySet.has(nKey)) continue;
          if (!isMountainLikeTerrain(grid[n.y][n.x])) continue;
          visited.add(nKey);
          queue.push({ x: n.x, y: n.y });
        }
      }
      if (!cluster.length) continue;
      const cx = cluster.reduce((sum, c) => sum + c.x, 0) / cluster.length;
      const cy = cluster.reduce((sum, c) => sum + c.y, 0) / cluster.length;
      let center = cluster[0];
      let best = Number.POSITIVE_INFINITY;
      for (const c of cluster) {
        const d = Math.hypot(c.x - cx, c.y - cy);
        if (d < best) {
          best = d;
          center = c;
        }
      }
      centers.push(center);
    }
    return centers;
  };

  const buildSourceCandidates = component => {
    if (!component?.cells?.length) return [];
    let maxLevel = Number.NEGATIVE_INFINITY;
    for (const c of component.cells) {
      const lv = getLevel(c.x, c.y);
      if (Number.isFinite(lv)) maxLevel = Math.max(maxLevel, lv);
    }
    if (!Number.isFinite(maxLevel)) maxLevel = 0;
    const mountainCenters = listMountainCenters(component);
    const fallbackCenter = { x: Math.round(component.cx || 0), y: Math.round(component.cy || 0) };
    return component.cells
      .map(c => {
        const terrain = grid[c.y][c.x];
        const level = getLevel(c.x, c.y);
        const nearPeak = Number(level >= (maxLevel - 1));
        const distToCenter = mountainCenters.length
          ? Math.min(...mountainCenters.map(m => hexDistance(c.x, c.y, m.x, m.y)))
          : hexDistance(c.x, c.y, fallbackCenter.x, fallbackCenter.y);
        const centerBonus = Math.max(0, 36 - (distToCenter * 5));
        const terrainBonus = (isMountainLikeTerrain(terrain) ? 36 : 0) + (terrain === "丘陵" ? 12 : 0);
        const score = (toSafeNumber(level, 0) * 18) + (nearPeak * 90) + terrainBonus + centerBonus + (Math.random() * 0.25);
        return { x: c.x, y: c.y, key: keyOf(c.x, c.y), terrain, level, score };
      })
      .filter(c => Number.isFinite(c.level))
      .sort((a, b) => b.score - a.score);
  };

  const buildPreferredMajorSourceCandidates = (candidates, component) => {
    if (!Array.isArray(candidates) || !candidates.length) return [];
    const maxLevel = component?.cells?.length
      ? component.cells.reduce((mx, c) => {
        const lv = getLevel(c.x, c.y);
        return Number.isFinite(lv) ? Math.max(mx, lv) : mx;
      }, Number.NEGATIVE_INFINITY)
      : Number.NEGATIVE_INFINITY;
    const preferred = candidates.filter(c => {
      if (!Number.isFinite(c?.level)) return false;
      const highByLevel = Number.isFinite(maxLevel) ? c.level >= (maxLevel - 1) : false;
      const highByTerrain = isMountainLikeTerrain(c?.terrain) || c?.terrain === "丘陵";
      return highByLevel || highByTerrain;
    });
    if (preferred.length >= Math.max(4, Math.floor(candidates.length * 0.18))) return preferred;
    return candidates.slice(0, Math.max(6, Math.floor(candidates.length * 0.35)));
  };

  const pickMouthWaterTile = (waterCandidates, preferSea = true) => {
    if (!Array.isArray(waterCandidates) || !waterCandidates.length) return null;
    const scored = waterCandidates.map(c => {
      const terrain = grid[c.y]?.[c.x];
      const seaBonus = (preferSea && terrain === "海") ? -8 : 0;
      const level = getLevel(c.x, c.y);
      return { ...c, score: seaBonus + toSafeNumber(level, 0) + (Math.random() * 0.2) };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0] || null;
  };

  const traceDownhillPath = (source, opts = {}) => {
    const minLen = Math.max(1, Math.floor(toSafeNumber(opts.minLength, 1)));
    const maxLen = Math.max(minLen, Math.floor(toSafeNumber(opts.maxLength, minLen)));
    const requireWaterMouth = opts.requireWaterMouth !== false;
    const preferSeaMouth = opts.preferSeaMouth !== false;
    const allowEarlyStop = opts.allowEarlyStop === true;
    const path = [];
    const visited = new Set();
    let breachSteps = 0;
    const maxBreachSteps = Math.max(3, Math.floor(maxLen * 0.5));
    const sourceKey = keyOf(source.x, source.y);
    path.push({ x: source.x, y: source.y, key: sourceKey, level: getLevel(source.x, source.y) });
    visited.add(sourceKey);

    while (path.length <= maxLen) {
      const current = path[path.length - 1];
      const waterNeighbors = getHexNeighborCoords(w, h, current.x, current.y).filter(n => isWaterTerrain(grid[n.y]?.[n.x]));
      if (path.length >= minLen && waterNeighbors.length) {
        return { ok: true, path, mouth: pickMouthWaterTile(waterNeighbors, preferSeaMouth) };
      }
      if (path.length >= maxLen) break;

      const rawCandidates = getHexNeighborCoords(w, h, current.x, current.y)
        .map(n => {
          const terrain = grid[n.y]?.[n.x];
          if (isWaterTerrain(terrain)) return null;
          const nKey = keyOf(n.x, n.y);
          if (visited.has(nKey)) return null;
          const nextLevel = getLevel(n.x, n.y);
          const curLevel = getLevel(current.x, current.y);
          if (!Number.isFinite(nextLevel) || !Number.isFinite(curLevel)) return null;
          const drop = curLevel - nextLevel;
          const waterDist = toSafeNumber(waterDistanceMap[n.y]?.[n.x], Number.POSITIVE_INFINITY);
          const terrainBonus = (terrain === "丘陵" ? -0.8 : 0) + (isMountainLikeTerrain(terrain) ? -0.6 : 0);
          return {
            x: n.x,
            y: n.y,
            key: nKey,
            level: nextLevel,
            drop,
            // 基本は下り（drop>0）を優先。詰まったときのみ平坦/微上りを許可する。
            downScore: nextLevel + (waterDist * 0.3) - (Math.max(drop, 0) * 0.7) + terrainBonus + (Math.random() * 0.2),
            breachScore: (waterDist * 0.95) + (nextLevel * 0.35) + (drop === 0 ? 1.8 : 4.2) + (Math.random() * 0.2)
          };
        })
        .filter(Boolean);
      const downhill = rawCandidates
        .filter(c => c.drop > 0)
        .sort((a, b) => a.downScore - b.downScore || a.level - b.level || b.drop - a.drop);
      const breach = rawCandidates
        .filter(c => c.drop >= -3)
        .sort((a, b) => a.breachScore - b.breachScore || a.level - b.level || a.waterDist - b.waterDist);
      const usingBreach = downhill.length === 0;
      if (usingBreach && !breach.length) break;
      if (usingBreach && breachSteps >= maxBreachSteps) break;
      const next = usingBreach ? breach[0] : downhill[0];
      if (!next) break;
      breachSteps = usingBreach ? (breachSteps + 1) : Math.max(0, breachSteps - 1);
      path.push(next);
      visited.add(next.key);

      if (allowEarlyStop && path.length >= minLen) {
        const remaining = maxLen - path.length;
        const stopChance = remaining <= 0 ? 1 : clamp(0.15 + ((path.length - minLen) * 0.1), 0.15, 0.7);
        if (Math.random() < stopChance) {
          const lakeNear = getHexNeighborCoords(w, h, next.x, next.y).filter(n => isWaterTerrain(grid[n.y]?.[n.x]));
          return { ok: true, path, mouth: pickMouthWaterTile(lakeNear, false) };
        }
      }
    }

    if (path.length >= minLen) {
      const current = path[path.length - 1];
      const waterNeighbors = getHexNeighborCoords(w, h, current.x, current.y).filter(n => isWaterTerrain(grid[n.y]?.[n.x]));
      if (waterNeighbors.length) return { ok: true, path, mouth: pickMouthWaterTile(waterNeighbors, preferSeaMouth) };
      if (!requireWaterMouth) return { ok: true, path, mouth: null };
    }

    return { ok: false, path, mouth: null };
  };

  // 最終フォールバック用: 水際距離を優先して海/湖へ到達させる流路探索。
  // 地形が平坦すぎて通常の下り探索で詰まるケースを救済する。
  const traceForcedToWaterPath = (source, opts = {}) => {
    const minLen = Math.max(1, Math.floor(toSafeNumber(opts.minLength, 1)));
    const maxLen = Math.max(minLen, Math.floor(toSafeNumber(opts.maxLength, Math.max(24, majorMaxLength + 12))));
    const path = [];
    const visited = new Set();
    const sourceKey = keyOf(source.x, source.y);
    path.push({ x: source.x, y: source.y, key: sourceKey, level: getLevel(source.x, source.y) });
    visited.add(sourceKey);

    while (path.length <= maxLen) {
      const current = path[path.length - 1];
      const waterNeighbors = getHexNeighborCoords(w, h, current.x, current.y).filter(n => isWaterTerrain(grid[n.y]?.[n.x]));
      if (path.length >= minLen && waterNeighbors.length) {
        return { ok: true, path, mouth: pickMouthWaterTile(waterNeighbors, true) };
      }
      if (path.length >= maxLen) break;

      const candidates = getHexNeighborCoords(w, h, current.x, current.y)
        .map(n => {
          const terrain = grid[n.y]?.[n.x];
          if (isWaterTerrain(terrain)) return null;
          const nKey = keyOf(n.x, n.y);
          if (visited.has(nKey)) return null;
          const nextLevel = getLevel(n.x, n.y);
          const curLevel = getLevel(current.x, current.y);
          if (!Number.isFinite(nextLevel) || !Number.isFinite(curLevel)) return null;
          const uphill = Math.max(0, nextLevel - curLevel);
          const waterDist = toSafeNumber(waterDistanceMap[n.y]?.[n.x], Number.POSITIVE_INFINITY);
          return {
            x: n.x,
            y: n.y,
            key: nKey,
            level: nextLevel,
            score: (waterDist * 1.35) + (uphill * 3.6) + (nextLevel * 0.12) + (Math.random() * 0.2)
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score || a.level - b.level);
      if (!candidates.length) break;

      const next = candidates[0];
      path.push(next);
      visited.add(next.key);
    }

    return { ok: false, path, mouth: null };
  };

  const hasAnyPathTileNear = (path, coords, minDistance) => {
    if (!coords.length || minDistance <= 0) return false;
    for (const p of path) {
      for (const c of coords) {
        if (hexDistance(p.x, p.y, c.x, c.y) < minDistance) return true;
      }
    }
    return false;
  };

  const bridgeCornerEdgesBetweenTileSteps = (prevTileKey, curTileKey, nextTileKey) => {
    const prevCornerEdgeKey = tilePairToCornerEdgeMap.get(riverEdgeKey(prevTileKey, curTileKey));
    const nextCornerEdgeKey = tilePairToCornerEdgeMap.get(riverEdgeKey(curTileKey, nextTileKey));
    if (!prevCornerEdgeKey || !nextCornerEdgeKey) return;
    if (prevCornerEdgeKey === nextCornerEdgeKey) return;
    const prevEnds = splitCornerEdgeKey(prevCornerEdgeKey);
    const nextEnds = splitCornerEdgeKey(nextCornerEdgeKey);
    if (!prevEnds || !nextEnds) return;
    const shared = prevEnds.some(p => nextEnds.includes(p));
    if (shared) return;
    const bridgeEdges = buildBridgeCornerEdgesOnTile(curTileKey, prevEnds, nextEnds);
    for (const bridgeEdge of bridgeEdges) {
      cornerEdgeSet.add(bridgeEdge);
    }
  };

  const commitPath = (route, type) => {
    if (!route?.ok || !Array.isArray(route.path) || !route.path.length) return;
    sourceSet.add(route.path[0].key);
    for (const n of route.path) {
      riverSet.add(n.key);
      ensureAllRiverCoord(n.x, n.y);
      if (type === "major") {
        majorRiverSet.add(n.key);
        majorRiverCoords.push({ x: n.x, y: n.y });
      } else {
        branchSet.add(n.key);
      }
    }
    for (let i = 1; i < route.path.length; i += 1) {
      registerTileEdge(route.path[i - 1].key, route.path[i].key, false);
    }

    // tileベース経路をedgeベースに変換した際、連続stepでも共有頂点を持たないケースがある。
    // その場合は中間タイル境界の最短ルートを補間して、edge連結を途切れさせない。
    for (let i = 1; i < route.path.length - 1; i += 1) {
      const prevTileKey = route.path[i - 1].key;
      const curTileKey = route.path[i].key;
      const nextTileKey = route.path[i + 1].key;
      bridgeCornerEdgesBetweenTileSteps(prevTileKey, curTileKey, nextTileKey);
    }

    if (route.mouth && Number.isFinite(route.mouth.x) && Number.isFinite(route.mouth.y)) {
      const endNode = route.path[route.path.length - 1];
      const mouthTileKey = keyOf(route.mouth.x, route.mouth.y);
      registerTileEdge(endNode.key, mouthTileKey, true);

      // 河口接続側でもedgeの切断を防ぐため、必要時のみ終端タイル上で補間する。
      if (route.path.length >= 2) {
        const prevEndNode = route.path[route.path.length - 2];
        const prevCornerEdgeKey = tilePairToCornerEdgeMap.get(riverEdgeKey(prevEndNode.key, endNode.key));
        const mouthCornerEdgeKey = tilePairToCornerEdgeMap.get(riverEdgeKey(endNode.key, mouthTileKey));
        if (prevCornerEdgeKey && mouthCornerEdgeKey && prevCornerEdgeKey !== mouthCornerEdgeKey) {
          const prevEnds = splitCornerEdgeKey(prevCornerEdgeKey);
          const mouthEnds = splitCornerEdgeKey(mouthCornerEdgeKey);
          const shared = !!(prevEnds && mouthEnds && prevEnds.some(p => mouthEnds.includes(p)));
          if (!shared) {
            const bridgeEdges = buildBridgeCornerEdgesOnTile(endNode.key, prevEnds, mouthEnds);
            for (const bridgeEdge of bridgeEdges) {
              cornerEdgeSet.add(bridgeEdge);
            }
          }
        }
      }

      if (type === "major") majorMouthCoords.push({ x: endNode.x, y: endNode.y });
    }
  };

  const minorCountBySize = (size, majorTarget = 0) => {
    if (!Number.isFinite(size) || size < 40) return 0;
    const baseDensity = Math.max(60, Math.floor(minorDensityDivisor * 0.58));
    const bySize = Math.floor(size / baseDensity);
    const byMajor = Math.max(0, Math.floor(majorTarget * 0.8));
    const result = bySize + byMajor;
    // 小河川は主河川より多めだが、過密回避のため上限を設ける
    return Math.max(0, Math.min(result, 28));
  };

  const detectMeshCenterTiles = () => {
    const out = new Set();
    if (!meshLoopEnabled) return out;
    const activeEdges = new Set([...cornerEdgeSet, ...cornerWaterLinkSet]);
    if (!activeEdges.size) return out;
    for (const [tileKey, corners] of tileCornersMap.entries()) {
      if (!Array.isArray(corners) || corners.length !== 6) continue;
      if (isTileKeyWater(tileKey)) continue;
      let aroundCount = 0;
      for (let i = 0; i < corners.length; i += 1) {
        const edgeKey = riverEdgeKey(corners[i], corners[(i + 1) % corners.length]);
        if (activeEdges.has(edgeKey)) aroundCount += 1;
      }
      if (aroundCount >= meshLoopThreshold) {
        out.add(tileKey);
        riverSet.add(tileKey);
        const p = parseCoordKey(tileKey);
        if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) ensureAllRiverCoord(p.x, p.y);
      }
    }
    return out;
  };

  const components = buildLandmassComponents().filter(c => Number(c?.size) > 0).sort((a, b) => b.size - a.size);
  const riverGenStats = [];
  if (!components.length) {
    const meshCenterSet = new Set();
    return {
      riverSet,
      sourceSet,
      branchSet,
      mouthSet,
      edgeSet,
      waterLinkSet,
      cornerEdgeSet,
      cornerWaterLinkSet,
      meshCenterSet,
      largeRiverSet: new Set(),
      riverTouchSet: buildRiverTouchSet({ riverSet, edgeSet, waterLinkSet, meshCenterSet, cornerEdgeSet, cornerWaterLinkSet }, w, h)
    };
  }

  for (const component of components) {
    const majorTarget = majorCountBySize(component.size);
    if (majorTarget <= 0) {
      riverGenStats.push({
        continentSize: component.size,
        target: majorTarget,
        generated: 0,
        sourceCandidates: 0
      });
      continue;
    }
    const candidates = buildSourceCandidates(component);
    if (!candidates.length) {
      riverGenStats.push({
        continentSize: component.size,
        target: majorTarget,
        generated: 0,
        sourceCandidates: 0
      });
      continue;
    }
    let generated = 0;
    const usedSources = new Set();
    const majorCandidates = buildPreferredMajorSourceCandidates(candidates, component);
    const topCount = Math.max(1, Math.floor(majorCandidates.length * 0.45));
    const topList = majorCandidates.slice(0, topCount);
    const retryCap = Math.max(sourceRetryLimit * 4, majorTarget * sourceRetryLimit * 2);
    for (let retry = 0; retry < retryCap && generated < majorTarget; retry += 1) {
      let source = randomFrom(topList) || randomFrom(majorCandidates) || randomFrom(candidates);
      if (!source) break;
      if (usedSources.has(source.key)) {
        source = randomFrom(majorCandidates.filter(c => !usedSources.has(c.key)))
          || randomFrom(candidates.filter(c => !usedSources.has(c.key)));
        if (!source) continue;
      }
      usedSources.add(source.key);
      const route = traceDownhillPath(source, {
        minLength: majorMinLength,
        maxLength: majorMaxLength,
        requireWaterMouth: true,
        preferSeaMouth: true,
        allowEarlyStop: false
      });
      if (!isSeaMouthRoute(route)) continue;
      if (route.path.length < majorMinLength) continue;
      if (hasAnyPathTileNear(route.path, majorRiverCoords, majorMidMinDistance)) continue;
      const end = route.path[route.path.length - 1];
      if (majorMouthCoords.some(m => hexDistance(end.x, end.y, m.x, m.y) < majorMouthMinDistance)) continue;
      commitPath(route, "major");
      generated += 1;
    }

    // 条件が厳しすぎて主河川が不足した場合の補完生成。
    // 「主河川のみ」の方針は維持しつつ、間隔・長さの閾値を少しだけ緩めて再試行する。
    if (generated < majorTarget) {
      const relaxedMinLength = Math.max(4, majorMinLength - 2);
      const relaxedMidDistance = Math.max(1, majorMidMinDistance - 1);
      const relaxedMouthDistance = Math.max(1, majorMouthMinDistance - 2);
      const relaxedRetryCap = Math.max(sourceRetryLimit * 8, (majorTarget - generated) * sourceRetryLimit * 4);
      for (let retry = 0; retry < relaxedRetryCap && generated < majorTarget; retry += 1) {
        const source = randomFrom(majorCandidates) || randomFrom(candidates);
        if (!source) break;
        const route = traceDownhillPath(source, {
          minLength: relaxedMinLength,
          maxLength: majorMaxLength + 8,
          requireWaterMouth: true,
          preferSeaMouth: true,
          allowEarlyStop: false
        });
        if (!isSeaMouthRoute(route)) continue;
        if (route.path.length < relaxedMinLength) continue;
        if (hasAnyPathTileNear(route.path, majorRiverCoords, relaxedMidDistance)) continue;
        const end = route.path[route.path.length - 1];
        if (majorMouthCoords.some(m => hexDistance(end.x, end.y, m.x, m.y) < relaxedMouthDistance)) continue;
        commitPath(route, "major");
        generated += 1;
      }
    }

    // まだ不足している場合の最終フォールバック。
    if (generated < majorTarget) {
      const forcedMinLength = Math.max(3, majorMinLength - 3);
      const forcedMidDistance = Math.max(1, majorMidMinDistance - 2);
      const forcedMouthDistance = Math.max(1, majorMouthMinDistance - 3);
      const forcedRetryCap = Math.max(48, (majorTarget - generated) * 30);
      for (let retry = 0; retry < forcedRetryCap && generated < majorTarget; retry += 1) {
        const source = randomFrom(majorCandidates) || randomFrom(candidates);
        if (!source) break;
        const route = traceForcedToWaterPath(source, {
          minLength: forcedMinLength,
          maxLength: majorMaxLength + Math.max(14, Math.floor((w + h) * 0.25))
        });
        if (!isSeaMouthRoute(route)) continue;
        if (route.path.length < forcedMinLength) continue;
        if (hasAnyPathTileNear(route.path, majorRiverCoords, forcedMidDistance)) continue;
        const end = route.path[route.path.length - 1];
        if (majorMouthCoords.some(m => hexDistance(end.x, end.y, m.x, m.y) < forcedMouthDistance)) continue;
        commitPath(route, "major");
        generated += 1;
      }
    }

    // 保険: それでも0本の場合は最低1本だけ強制確保。
    if (generated === 0 && majorTarget > 0 && candidates.length) {
      const guaranteedMinLength = Math.max(2, majorMinLength - 4);
      const fallbackPool = [...buildPreferredMajorSourceCandidates(candidates, component), ...candidates];
      for (let i = 0; i < Math.min(fallbackPool.length, 180); i += 1) {
        const source = fallbackPool[i];
        const route = traceForcedToWaterPath(source, {
          minLength: guaranteedMinLength,
          maxLength: majorMaxLength + Math.max(20, Math.floor((w + h) * 0.35))
        });
        if (!isSeaMouthRoute(route)) continue;
        if (route.path.length < guaranteedMinLength) continue;
        commitPath(route, "major");
        generated = 1;
        break;
      }
    }

    riverGenStats.push({
      continentSize: component.size,
      target: majorTarget,
      generated,
      sourceCandidates: candidates.length
    });
  }

  for (const component of components) {
    const majorTarget = majorCountBySize(component.size);
    const minorTargetBase = minorCountBySize(component.size, majorTarget);
    const minorSpawnScale = clamp(0.5 + branchMinorRate, 0.5, 1.3);
    const minorTarget = Math.max(0, Math.round(minorTargetBase * branchSpawnRate * minorSpawnScale));
    if (minorTarget <= 0) continue;
    const componentKeySet = new Set(component.cells.map(c => keyOf(c.x, c.y)));
    const branchParentCoords = [];
    const branchStarterMap = new Map();
    for (const c of component.cells) {
      const riverKey = keyOf(c.x, c.y);
      if (!majorRiverSet.has(riverKey)) continue;
      const parentLevel = getLevel(c.x, c.y);
      for (const n of getHexNeighborCoords(w, h, c.x, c.y)) {
        const nKey = keyOf(n.x, n.y);
        if (!componentKeySet.has(nKey)) continue;
        if (isWaterTerrain(grid[n.y]?.[n.x])) continue;
        if (riverSet.has(nKey)) continue;
        const nextLevel = getLevel(n.x, n.y);
        if (!Number.isFinite(parentLevel) || !Number.isFinite(nextLevel)) continue;
        const drop = parentLevel - nextLevel;
        const waterDist = toSafeNumber(waterDistanceMap[n.y]?.[n.x], Number.POSITIVE_INFINITY);
        const uphillPenalty = Math.max(0, -drop) * 2.8;
        const score = nextLevel + (waterDist * 0.45) + uphillPenalty + (Math.random() * 0.15);
        const prev = branchStarterMap.get(nKey);
        if (!prev || score < prev.score) {
          branchStarterMap.set(nKey, {
            x: n.x,
            y: n.y,
            key: nKey,
            level: nextLevel,
            score,
            parent: { x: c.x, y: c.y, key: riverKey, level: parentLevel }
          });
        }
      }
    }
    const branchStarters = [...branchStarterMap.values()].sort((a, b) => a.score - b.score);
    const fallbackCandidates = buildSourceCandidates(component)
      .filter(c => !majorRiverSet.has(c.key) && !riverSet.has(c.key))
      .map(c => ({ ...c, parent: null }));
    const candidates = branchStarters.length ? branchStarters : fallbackCandidates;
    if (!candidates.length) continue;
    const topCount = Math.max(1, Math.floor(candidates.length * 0.85));
    const topList = candidates.slice(0, topCount);
    let generated = 0;
    let retry = 0;
    const retryCap = minorTarget * minorRetryLimitPerRiver;
    while (generated < minorTarget && retry < retryCap) {
      retry += 1;
      const source = randomFrom(topList) || randomFrom(candidates);
      if (!source) break;
      if (riverSet.has(source.key)) continue;
      if (
        source.parent &&
        branchParentCoords.some(p => hexDistance(source.parent.x, source.parent.y, p.x, p.y) < branchStartMinDistance)
      ) continue;
      const route = traceDownhillPath(source, {
        minLength: branchMinLength,
        maxLength: randomInt(branchMinLength, Math.max(branchMinLength, branchMaxLength)),
        requireWaterMouth: false,
        preferSeaMouth: false,
        allowEarlyStop: false
      });
      if (!route.ok) continue;
      if (route.path.length < branchMinLength || route.path.length > branchMaxLength) continue;
      if (route.path.some((n, idx) => idx > 0 && riverSet.has(n.key))) continue;
      const spacingCheckStart = Math.min(3, route.path.length);
      const pathForSpacing = route.path.slice(spacingCheckStart);
      const branchSpacingDistance = Math.max(2, minorSpacingDistance);
      if (pathForSpacing.length && hasAnyPathTileNear(pathForSpacing, allRiverCoords, branchSpacingDistance)) continue;
      if (source.parent && route.path.length) {
        registerTileEdge(source.parent.key, route.path[0].key, false);
        if (route.path.length >= 2) {
          bridgeCornerEdgesBetweenTileSteps(source.parent.key, route.path[0].key, route.path[1].key);
        }
      }
      commitPath(route, "minor");
      if (source.parent) branchParentCoords.push({ x: source.parent.x, y: source.parent.y });
      generated += 1;
    }
  }

  const splitTileEdgeKey = edgeKey => {
    const [aRaw, bRaw] = String(edgeKey || "").split("|");
    const a = normalizeCoordKeyText(aRaw);
    const b = normalizeCoordKeyText(bRaw);
    if (!a || !b) return null;
    return [a, b];
  };

  // 見た目を崩す「1マスだけ横に飛び出す枝」を除去する。
  // 条件: 支流タイルで、陸地河川隣接が1、かつ接続先が分岐点(次数3以上)。
  const pruneSingleTileSideBranches = () => {
    const landAdjMap = new Map();
    const ensureAdj = tileKey => {
      if (!landAdjMap.has(tileKey)) landAdjMap.set(tileKey, new Set());
      return landAdjMap.get(tileKey);
    };
    for (const edgeKey of edgeSet) {
      const nodes = splitTileEdgeKey(edgeKey);
      if (!nodes) continue;
      const [a, b] = nodes;
      if (!riverSet.has(a) || !riverSet.has(b)) continue;
      if (isTileKeyWater(a) || isTileKeyWater(b)) continue;
      ensureAdj(a).add(b);
      ensureAdj(b).add(a);
    }

    const pruneTargets = [];
    for (const tileKey of branchSet) {
      if (!riverSet.has(tileKey)) continue;
      if (majorRiverSet.has(tileKey)) continue;
      if (mouthSet.has(tileKey)) continue;
      const neighbors = [...(landAdjMap.get(tileKey) || [])];
      if (neighbors.length !== 1) continue;
      const parentKey = neighbors[0];
      const parentDegree = (landAdjMap.get(parentKey)?.size) || 0;
      if (parentDegree < 3) continue;
      pruneTargets.push(tileKey);
    }
    if (!pruneTargets.length) return 0;

    const pruneSet = new Set(pruneTargets);
    for (const tileKey of pruneTargets) {
      riverSet.delete(tileKey);
      branchSet.delete(tileKey);
      sourceSet.delete(tileKey);
      mouthSet.delete(tileKey);
      allRiverCoordSet.delete(tileKey);
    }

    for (const edgeKey of [...edgeSet]) {
      const nodes = splitTileEdgeKey(edgeKey);
      if (!nodes) continue;
      const [a, b] = nodes;
      if (!pruneSet.has(a) && !pruneSet.has(b)) continue;
      edgeSet.delete(edgeKey);
      const cornerKey = tilePairToCornerEdgeMap.get(edgeKey);
      if (cornerKey) cornerEdgeSet.delete(cornerKey);
    }
    for (const edgeKey of [...waterLinkSet]) {
      const nodes = splitTileEdgeKey(edgeKey);
      if (!nodes) continue;
      const [a, b] = nodes;
      if (!pruneSet.has(a) && !pruneSet.has(b)) continue;
      waterLinkSet.delete(edgeKey);
      const cornerKey = tilePairToCornerEdgeMap.get(edgeKey);
      if (cornerKey) cornerWaterLinkSet.delete(cornerKey);
    }

    allRiverCoords.length = 0;
    for (const key of allRiverCoordSet) {
      if (!riverSet.has(key)) continue;
      const p = parseCoordKey(key);
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
      allRiverCoords.push({ x: p.x, y: p.y });
    }
    return pruneTargets.length;
  };
  const prunedSingleTileBranchCount = pruneSingleTileSideBranches();

  // 角エッジ描画で出る「1本トゲ」を除去する（片端が葉、もう片端が分岐点）。
  const pruneSingleSegmentCornerSpikes = () => {
    const activeCornerEdges = new Set([...cornerEdgeSet, ...cornerWaterLinkSet]);
    if (!activeCornerEdges.size) return 0;
    const degreeMap = new Map();
    const addDegree = cornerKey => {
      degreeMap.set(cornerKey, (degreeMap.get(cornerKey) || 0) + 1);
    };
    for (const edgeKey of activeCornerEdges) {
      const nodes = splitCornerEdgeKey(edgeKey);
      if (!nodes) continue;
      addDegree(nodes[0]);
      addDegree(nodes[1]);
    }

    const pruneEdges = [];
    for (const edgeKey of cornerEdgeSet) {
      const nodes = splitCornerEdgeKey(edgeKey);
      if (!nodes) continue;
      const [a, b] = nodes;
      const degA = degreeMap.get(a) || 0;
      const degB = degreeMap.get(b) || 0;
      const isSpike = (degA === 1 && degB >= 3) || (degB === 1 && degA >= 3);
      if (isSpike) pruneEdges.push(edgeKey);
    }
    for (const edgeKey of pruneEdges) {
      cornerEdgeSet.delete(edgeKey);
    }
    return pruneEdges.length;
  };
  const prunedCornerSpikeCount = pruneSingleSegmentCornerSpikes();

  const meshCenterSet = detectMeshCenterTiles();
  if (typeof console !== "undefined" && typeof console.log === "function") {
    const majorRiverCount = majorMouthCoords.length;
    const minorRiverCount = Math.max(0, sourceSet.size - majorRiverCount);
    console.log("[RiverGen] 主河川生成結果", {
      continents: components.length,
      majorRiverCount,
      minorRiverCount,
      riverTileCount: riverSet.size,
      edgeCount: edgeSet.size,
      cornerEdgeCount: cornerEdgeSet.size,
      mouthLinkCount: waterLinkSet.size,
      cornerWaterLinkCount: cornerWaterLinkSet.size,
      prunedSingleTileBranchCount,
      prunedCornerSpikeCount,
      customRiverRange: hasCustomRiverRange ? { min: customRiverMin, max: customRiverMax } : null,
      continentMinTiles,
      stats: riverGenStats
    });
  }

  return {
    riverSet,
    sourceSet,
    branchSet,
    mouthSet,
    edgeSet,
    waterLinkSet,
    cornerEdgeSet,
    cornerWaterLinkSet,
    meshCenterSet,
    largeRiverSet: majorRiverSet,
    riverTouchSet: buildRiverTouchSet({ riverSet, edgeSet, waterLinkSet, meshCenterSet, cornerEdgeSet, cornerWaterLinkSet }, w, h)
  };
}
function parseCoordKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

function hexCenter(x, y) {
  const tileW = Math.max(1, toSafeNumber(HEX_TILE_CONFIG?.width, 40));
  const tileH = Math.max(1, toSafeNumber(HEX_TILE_CONFIG?.height, 48));
  const rowStep = Math.max(1, toSafeNumber(HEX_TILE_CONFIG?.rowStep, 36));
  const oddRowOffsetX = toSafeNumber(HEX_TILE_CONFIG?.oddRowOffsetX, tileW / 2);
  const offsetX = (y % 2 === 1) ? oddRowOffsetX : 0;
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
    caveCoastAnchorMap: null,
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
  applyWastelandTransition(grid, reliefMap, w, h);

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
  const riverRawData = generateRivers(
    grid,
    w,
    h,
    totalTiles,
    高度マップ,
    高度レベルマップ,
    islandCustomSettings
  );
  const riverData = augmentRiverDataWithWaterfalls(riverRawData, 高度レベルマップ);
  const meshHandlingRule = 地形生成設定.河川?.網目処理 || {};
  if (meshHandlingRule.中央湖化 !== false) {
    applyMeshRiverLakeTiles(grid, riverData?.meshCenterSet, 高度レベルマップ, w, h);
  }
  const coastData = buildCoastMap(grid, w, h, 高度レベルマップ);
  const { specialMap, specialCounts, caveSizeMap, caveScaleMap, caveCoastAnchorMap } = buildSpecialTileMap(grid, w, h, riverData, 高度レベルマップ);
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
    caveCoastAnchorMap,
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
  buildRiverTouchSet,
  createIslandShapeData,
  createTerrainMapData,
  advanceTerrainTurn
};


