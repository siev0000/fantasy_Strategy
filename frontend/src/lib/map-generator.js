import { generateIsland as generateRealisticIsland } from "./realistic-island.js";

const 地形定義 = [
  { key: "平地", color: "#d9c98b", weight: 28, short: "平" },
  { key: "森", color: "#7fa56a", weight: 18, short: "森" },
  { key: "丘陵", color: "#a49367", weight: 12, short: "丘" },
  { key: "山岳", color: "#8b847d", weight: 10, short: "山" },
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
    森: 0.24,
    丘陵: 0.16,
    砂漠: 0.35,
    湖上限: 0.03
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
    湖候補: 0.35
  },
  高度: {
    中央隆起幅: 68,
    海岸減衰幅: 44,
    ノイズ幅: 10,
    平滑化回数: 2
  }
};

let 最新高度マップ = null;

function parseMapSize() {
  const selected = document.getElementById("mapSize").value;
  const parts = selected.split("x").map(Number);
  return { w: parts[0], h: parts[1] };
}

function getSelectedPatternId() {
  const el = document.getElementById("islandPattern");
  return el ? el.value : "balanced";
}

function pickWeightedTerrain(allowKeys) {
  const pool = 地形定義.filter(t => allowKeys.includes(t.key));
  const total = pool.reduce((sum, t) => sum + t.weight, 0);
  let r = Math.random() * total;
  for (const t of pool) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return pool[0];
}

function terrainDefByKey(key) {
  return 地形定義.find(t => t.key === key) || 地形定義[0];
}

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

function shouldBecomeLake(grid, x, y) {
  const terrain = grid[y][x];
  if (terrain === "海" || terrain === "河川" || terrain === "山岳") return false;
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

function generateIslands(grid, w, h, totalTiles, patternId = "balanced") {
  const cfg = 島パターン定義[patternId] || 島パターン定義.balanced;
  const targetLand = Math.floor(totalTiles * (cfg.landMin + Math.random() * (cfg.landMax - cfg.landMin)));
  if (patternId === "realistic") {
    generateRealisticIsland(grid, w, h, targetLand, cfg);
    return cfg.name;
  }
  const baseSeedCount = Math.max(2, Math.floor(totalTiles / 140));
  const seedCount = patternId === "archipelago"
    ? baseSeedCount + 3
    : patternId === "continent"
      ? 2
      : patternId === "twins"
        ? 4
        : patternId === "chain"
          ? Math.max(4, baseSeedCount + 1)
          : baseSeedCount;

  const frontier = [];
  let landCount = 0;
  const seeds = buildPatternSeeds(patternId, w, h, seedCount);
  for (const seed of seeds) {
    grid[seed.y][seed.x] = "平地";
    landCount += 1;
    frontier.push(seed);
  }

  while (landCount < targetLand && frontier.length) {
    const current = randomFrom(frontier);
    if (!current) break;
    const neighbors = getHexNeighborCoords(w, h, current.x, current.y);
    let expanded = false;
    for (const n of neighbors) {
      if (landCount >= targetLand) break;
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
  return cfg.name;
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
  const 中央X = (w - 1) / 2;
  const 中央Y = (h - 1) / 2;
  const 最大距離 = Math.max(1, Math.hypot(Math.max(中央X, w - 1 - 中央X), Math.max(中央Y, h - 1 - 中央Y)));

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] === "海") {
        高度マップ[y][x] = 0;
        continue;
      }
      const 中央距離比 = clamp(Math.hypot(x - 中央X, y - 中央Y) / 最大距離, 0, 1);
      const 中央補正 = 1 - 中央距離比;
      const 海隣接度 = countAround(grid, x, y, "海") / 6;
      const ノイズ = (Math.random() * 2 - 1) * 地形生成設定.高度.ノイズ幅;
      const 高度値 = 18
        + (中央補正 * 地形生成設定.高度.中央隆起幅)
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

function applyTerrainByHeight(grid, 高度マップ, 山岳目標枚数, 丘陵目標枚数) {
  const 陸地一覧 = [];
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[0].length; x += 1) {
      if (grid[y][x] === "海") continue;
      grid[y][x] = "平地";
      陸地一覧.push({ x, y, 高度: 高度マップ[y][x], 乱数: Math.random() });
    }
  }

  陸地一覧.sort((a, b) => b.高度 - a.高度 || b.乱数 - a.乱数);

  const 山岳数 = clamp(山岳目標枚数, 0, 陸地一覧.length);
  const 丘陵数 = clamp(丘陵目標枚数, 0, Math.max(0, 陸地一覧.length - 山岳数));

  for (let i = 0; i < 山岳数; i += 1) {
    const p = 陸地一覧[i];
    grid[p.y][p.x] = "山岳";
  }
  for (let i = 山岳数; i < 山岳数 + 丘陵数; i += 1) {
    const p = 陸地一覧[i];
    grid[p.y][p.x] = "丘陵";
  }
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

function generateRivers(grid, w, h, totalTiles) {
  const mountainSources = listCoordsByTerrain(grid, "山岳");
  const seas = listCoordsByTerrain(grid, "海");
  const waters = [...seas, ...listCoordsByTerrain(grid, "湖")];
  const riverSet = new Set();
  const sourceSet = new Set();
  const branchSet = new Set();
  const mouthSet = new Set();
  const edgeSet = new Set();
  const waterLinkSet = new Set();
  if (!mountainSources.length || !waters.length) {
    return { riverSet, sourceSet, branchSet, mouthSet, edgeSet, waterLinkSet };
  }

  function terrainFlowPenalty(t) {
    switch (t) {
      case "山岳": return 2.0;
      case "丘陵": return 1.2;
      case "森": return 1.0;
      case "砂漠": return 0.9;
      case "平地": return 0.6;
      case "湖": return -5.0;
      case "海": return -8.0;
      default: return 1.0;
    }
  }

  function keyOf(x, y) {
    return `${x},${y}`;
  }

  function simulateRiverFrom(source, isMajor) {
    sourceSet.add(keyOf(source.x, source.y));
    const channels = [{
      x: source.x,
      y: source.y,
      ttl: (isMajor ? 18 : 12) + Math.floor(Math.random() * 8),
      age: 0,
      branchBudget: isMajor ? 2 : 1,
      major: isMajor,
      branchedOnce: false,
      visited: new Set([keyOf(source.x, source.y)])
    }];

    while (channels.length) {
      const ch = channels.pop();
      let current = { x: ch.x, y: ch.y };

      if (grid[current.y][current.x] !== "海" && grid[current.y][current.x] !== "湖") {
        riverSet.add(keyOf(current.x, current.y));
      }

      while (ch.ttl > 0) {
        const prevWaterDist = minDistanceToTargets(current.x, current.y, waters);
        const candidates = getHexNeighborCoords(w, h, current.x, current.y)
          .filter(n => !ch.visited.has(keyOf(n.x, n.y)))
          .map(n => {
            const terrain = grid[n.y][n.x];
            const waterDist = minDistanceToTargets(n.x, n.y, waters);
            const seaDist = seas.length ? minDistanceToTargets(n.x, n.y, seas) : waterDist;
            const score =
              waterDist * (ch.major ? 2.0 : 2.3) +
              seaDist * (ch.major ? 0.8 : 1.1) +
              terrainFlowPenalty(terrain) +
              (Math.random() * 0.9);
            return { n, terrain, waterDist, score };
          })
          .sort((a, b) => a.score - b.score);

        if (!candidates.length) break;
        let nextInfo = candidates[0];

        // 発生直後の即海落ちを避ける
        if (ch.age < 2 && (nextInfo.terrain === "海" || nextInfo.terrain === "湖") && candidates.length > 1) {
          nextInfo = candidates[1];
        }

        // 分岐（主流の中盤で発生しやすくする）
        if (ch.age >= 3 && ch.branchBudget > 0 && candidates.length > 1) {
          const branchChance = ch.major ? 0.45 : 0.24;
          const alt = candidates[1];
          const shouldForceBranch = ch.major && !ch.branchedOnce && ch.age >= 5 && ch.ttl >= 5;
          if (alt && alt.terrain !== "海" && (shouldForceBranch || Math.random() < branchChance)) {
            branchSet.add(keyOf(current.x, current.y));
            channels.push({
              x: alt.n.x,
              y: alt.n.y,
              ttl: Math.max(5, Math.floor(ch.ttl * 0.55)),
              age: 0,
              branchBudget: ch.branchBudget - 1,
              major: false,
              branchedOnce: false,
              visited: new Set(ch.visited)
            });
            ch.branchBudget -= 1;
            ch.branchedOnce = true;
          }
        }

        const next = nextInfo.n;
        const terrain = nextInfo.terrain;
        const currentKey = keyOf(current.x, current.y);
        const nextKey = keyOf(next.x, next.y);

        // 一部は途中で消える（リアル寄り）
        let stopChance = ch.major ? 0.03 : 0.07;
        if (nextInfo.waterDist >= prevWaterDist) stopChance += 0.14;
        if (ch.age >= 6) stopChance += 0.05;
        if (ch.age >= 10) stopChance += 0.06;
        if (ch.age > 3 && terrain !== "海" && terrain !== "湖" && Math.random() < stopChance) break;

        ch.visited.add(nextKey);
        ch.ttl -= 1;
        ch.age += 1;

        if (terrain === "海" || terrain === "湖") {
          const wk = currentKey < nextKey ? `${currentKey}|${nextKey}` : `${nextKey}|${currentKey}`;
          waterLinkSet.add(wk);
          mouthSet.add(currentKey);
          break;
        }

        const ek = currentKey < nextKey ? `${currentKey}|${nextKey}` : `${nextKey}|${currentKey}`;
        edgeSet.add(ek);
        current = next;
        riverSet.add(currentKey);
        riverSet.add(nextKey);

        // 次の一手で水域なら現在地点を終点扱い
        const nearWater = getHexNeighborCoords(w, h, current.x, current.y)
          .some(n => grid[n.y][n.x] === "海" || grid[n.y][n.x] === "湖");
        if (nearWater && ch.age >= 2) {
          mouthSet.add(keyOf(current.x, current.y));
        }
      }
    }
  }

  const riverCount = Math.max(3, Math.floor(totalTiles / 65));
  const majorCount = Math.max(1, Math.floor(riverCount * 0.6));
  for (let i = 0; i < riverCount; i += 1) {
    const src = randomFrom(mountainSources);
    if (!src) continue;
    simulateRiverFrom(src, i < majorCount);
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

function buildRiverOverlaySvg(grid, w, h, riverData) {
  if (!riverData?.riverSet || riverData.riverSet.size === 0) return "";

  const riverSet = riverData.riverSet;
  const edges = riverData.edgeSet || new Set();
  const waterLinks = riverData.waterLinkSet || new Set();

  const width = w * 40 + 20;
  const height = (h - 1) * 36 + 48;

  let lines = "";
  for (const ek of edges) {
    const [a, b] = ek.split("|");
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    lines += `<line class="river-seg" x1="${ca.cx}" y1="${ca.cy}" x2="${cb.cx}" y2="${cb.cy}" />`;
  }
  for (const wk of waterLinks) {
    const [a, b] = wk.split("|");
    const pa = parseCoordKey(a);
    const pb = parseCoordKey(b);
    const ca = hexCenter(pa.x, pa.y);
    const cb = hexCenter(pb.x, pb.y);
    lines += `<line class="river-link" x1="${ca.cx}" y1="${ca.cy}" x2="${cb.cx}" y2="${cb.cy}" />`;
  }

  let nodes = "";
  for (const key of riverSet) {
    const { x, y } = parseCoordKey(key);
    const c = hexCenter(x, y);
    const isSource = riverData.sourceSet?.has(key);
    const isBranch = riverData.branchSet?.has(key);
    const isMouth = riverData.mouthSet?.has(key);
    const cls = isSource
      ? "river-node source"
      : isBranch
        ? "river-node branch"
        : isMouth
          ? "river-node mouth"
          : "river-node";
    nodes += `<circle class="${cls}" cx="${c.cx}" cy="${c.cy}" r="3.1" />`;
  }

  const lakesUsed = new Set();
  for (const wk of waterLinks) {
    const [a, b] = wk.split("|");
    const aIsRiver = riverSet.has(a);
    const bIsRiver = riverSet.has(b);
    if (!aIsRiver) lakesUsed.add(a);
    if (!bIsRiver) lakesUsed.add(b);
  }
  for (const lk of lakesUsed) {
    const { x, y } = parseCoordKey(lk);
    const c = hexCenter(x, y);
    nodes += `<circle class="lake-node" cx="${c.cx}" cy="${c.cy}" r="4.3" />`;
  }

  return `<svg class="river-overlay" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${lines}${nodes}</svg>`;
}

function renderMap(grid, w, h, shapeOnly = false, patternName = "", riverData = null) {
  const counts = {};
  地形定義.forEach(t => { counts[t.key] = 0; });
  let landCount = 0;
  let seaCount = 0;
  const rows = [];

  for (let y = 0; y < h; y += 1) {
    let rowHtml = `<div class="hex-row${y % 2 === 1 ? " offset" : ""}">`;
    for (let x = 0; x < w; x += 1) {
      const key = grid[y][x];
      const isSea = key === "海";
      if (isSea) seaCount += 1;
      else landCount += 1;

      const tile = shapeOnly
        ? isSea
          ? { color: "#4f88ba", short: "海", key: "海" }
          : { color: "#8fb07a", short: "陸", key: "陸地" }
        : terrainDefByKey(key);
      if (!shapeOnly) counts[tile.key] += 1;
      const riverSet = riverData?.riverSet;
      const hasRiver = !shapeOnly && riverSet && riverSet.has(`${x},${y}`);
      const isSource = !shapeOnly && riverData?.sourceSet?.has(`${x},${y}`);
      const isBranch = !shapeOnly && riverData?.branchSet?.has(`${x},${y}`);
      const isMouth = !shapeOnly && riverData?.mouthSet?.has(`${x},${y}`);
      const riverClass = hasRiver ? " river" : "";
      const sourceClass = isSource ? " river-source" : "";
      const branchClass = isBranch ? " river-branch" : "";
      const mouthClass = isMouth ? " river-mouth" : "";
      const title = hasRiver
        ? `${tile.key} + 川${isSource ? " / 源流" : ""}${isBranch ? " / 分岐" : ""}${isMouth ? " / 終点" : ""}`
        : tile.key;
      rowHtml += `<div class="tile${riverClass}${sourceClass}${branchClass}${mouthClass}" data-x="${x}" data-y="${y}" data-terrain="${tile.key}" data-river="${hasRiver ? "1" : "0"}" style="background:${tile.color}" title="${title}">${tile.short}</div>`;
    }
    rowHtml += "</div>";
    rows.push(rowHtml);
  }

  const mapGridEl = document.getElementById("mapGrid");
  const overlay = !shapeOnly ? buildRiverOverlaySvg(grid, w, h, riverData) : "";
  mapGridEl.innerHTML = `<div class="hex-wrap">${rows.join("")}${overlay}</div>`;
  fitMapGrid();

  const lines = [`サイズ: ${w}x${h} (${w * h}マス)`];
  if (patternName) lines.push(`パターン: ${patternName}`);
  if (shapeOnly) {
    lines.push(`陸地: ${landCount} (${((landCount / (w * h)) * 100).toFixed(1)}%)`);
    lines.push(`海: ${seaCount} (${((seaCount / (w * h)) * 100).toFixed(1)}%)`);
  } else {
    for (const t of 地形定義) {
      const c = counts[t.key];
      const pct = ((c / (w * h)) * 100).toFixed(1);
      lines.push(`${t.key}: ${c} (${pct}%)`);
    }
    if (riverData?.riverSet) {
      lines.push(`川(重なり): ${riverData.riverSet.size} (${((riverData.riverSet.size / (w * h)) * 100).toFixed(1)}%)`);
      lines.push(`源流: ${riverData.sourceSet.size} / 分岐: ${riverData.branchSet.size} / 終点: ${riverData.mouthSet.size}`);
    }
  }
  document.getElementById("mapStats").textContent = lines.join("\n");
  updateMapMeta(w, h, patternName);
}

function fitMapGrid() {
  const container = document.getElementById("mapGrid");
  const content = container?.querySelector(".hex-wrap");
  if (!container || !content) return;

  content.style.transform = "scale(1)";
  const availW = Math.max(1, container.clientWidth - 2);
  const availH = Math.max(1, container.clientHeight - 2);
  const rawW = Math.max(1, content.scrollWidth);
  const rawH = Math.max(1, content.scrollHeight);
  const scale = Math.min(availW / rawW, availH / rawH, 1);
  content.style.transform = `scale(${scale})`;
}

function updateMapMeta(w, h, patternName = "") {
  const centerX = Math.floor((w - 1) / 2);
  const centerY = Math.floor((h - 1) / 2);
  const sizeEl = document.getElementById("mapSizeInfo");
  const centerEl = document.getElementById("mapCenterInfo");
  if (sizeEl) sizeEl.textContent = `サイズ: ${w} x ${h} (${w * h}マス)`;
  if (centerEl) centerEl.textContent = `中央座標: (${centerX}, ${centerY})${patternName ? ` / ${patternName}` : ""}`;
}

function handleMapClick(event) {
  const tile = event.target.closest(".tile");
  if (!tile) return;
  const x = Number(tile.dataset.x);
  const y = Number(tile.dataset.y);
  const terrain = tile.dataset.terrain || "-";
  const river = tile.dataset.river === "1" ? "あり" : "なし";
  const height = 最新高度マップ?.[y]?.[x];
  const clickEl = document.getElementById("mapClickInfo");
  if (clickEl) clickEl.textContent = `クリック座標: (${x}, ${y}) / 地形: ${terrain} / 川: ${river} / 高度: ${Number.isFinite(height) ? height : "-"}`;
}

function generateIslandShapeOnly() {
  const { w, h } = parseMapSize();
  const totalTiles = w * h;
  const patternId = getSelectedPatternId();
  const grid = buildInitialGrid(w, h, "海");
  const patternName = generateIslands(grid, w, h, totalTiles, patternId);
  最新高度マップ = null;
  renderMap(grid, w, h, true, patternName);
}

function generateTerrainMap() {
  const { w, h } = parseMapSize();
  const totalTiles = w * h;
  const patternId = getSelectedPatternId();
  const grid = buildInitialGrid(w, h, "海");
  const patternName = generateIslands(grid, w, h, totalTiles, patternId);

  const 陸地枚数 = listLandCoords(grid).length;
  const 山岳目標枚数 = Math.max(地形生成設定.最低枚数.山岳, Math.floor(陸地枚数 * 地形生成設定.比率.山岳));
  const 森目標枚数 = Math.max(1, Math.floor(陸地枚数 * 地形生成設定.比率.森));
  const 丘陵目標枚数 = Math.max(地形生成設定.最低枚数.丘陵, Math.floor(陸地枚数 * 地形生成設定.比率.丘陵));
  const 砂漠目標枚数 = Math.max(地形生成設定.最低枚数.砂漠, Math.floor(陸地枚数 * 地形生成設定.比率.砂漠));

  // 高度マップを作成し、中央ほど高くなりやすい地形にする
  const 高度マップ = generateHeightMap(grid, w, h);
  最新高度マップ = 高度マップ;
  applyTerrainByHeight(grid, 高度マップ, 山岳目標枚数, 丘陵目標枚数);

  growClusters(
    grid, w, h, "森", 森目標枚数,
    (x, y) => grid[y][x] === "平地" || grid[y][x] === "丘陵",
    (x, y) => (grid[y][x] === "平地" || grid[y][x] === "丘陵") && countAround(grid, x, y, "山岳") <= 2
  );

  // 砂漠は35%固定、最低6クラスタで生成
  const 砂漠クラスタサイズ一覧 = buildClusterSizes(砂漠目標枚数, 地形生成設定.最小クラスタ数.砂漠);
  const 砂漠シード一覧 = [];
  for (const size of 砂漠クラスタサイズ一覧) {
    const seed = pickClusterSeed(
      grid,
      砂漠シード一覧,
      (x, y) =>
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
        grid[y][x] === "平地" &&
        countAround(grid, x, y, "海") === 0 &&
        Math.random() < desertLatitudeWeight(y, h)
    );
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (grid[y][x] === "海") continue;
      if (grid[y][x] === "山岳" && countAround(grid, x, y, "山岳") === 0) grid[y][x] = "丘陵";
      if (grid[y][x] === "森" && countAround(grid, x, y, "森") === 0) grid[y][x] = "平地";
    }
  }

  // 仕上げ: 地形を塊に寄せる補正
  cohereTerrainBlobs(grid, w, h);

  // 中央付近にオアシス湖を1つ作る
  const オアシスあり = placeCentralOasis(grid, w, h);

  // 湖の上限は「マップ全体」ではなく「島(陸地)面積」に対する割合で決める
  const 島面積枚数 = listLandCoords(grid).length;
  const 島基準の湖上限 = Math.floor(島面積枚数 * 地形生成設定.比率.湖上限);
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

  const riverData = generateRivers(grid, w, h, totalTiles);
  renderMap(grid, w, h, false, patternName, riverData);
}

export {
  fitMapGrid,
  handleMapClick,
  generateIslandShapeOnly,
  generateTerrainMap
};


