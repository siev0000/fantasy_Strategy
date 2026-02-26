function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fract(value) {
  return value - Math.floor(value);
}

function noise2d(x, y, seed) {
  const v = Math.sin((x * 127.1) + (y * 311.7) + (seed * 74.7)) * 43758.5453123;
  return fract(v);
}

function fractalNoise2d(x, y, seed) {
  const n1 = noise2d(x * 0.17, y * 0.17, seed);
  const n2 = noise2d((x * 0.41) + 19, (y * 0.41) + 7, seed + 11);
  const n3 = noise2d((x * 0.83) + 71, (y * 0.83) + 53, seed + 23);
  return (n1 * 0.55) + (n2 * 0.30) + (n3 * 0.15);
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

export function generateIsland(grid, w, h, targetLand, cfg) {
  const interiorCells = [];
  const peaks = [];
  const centerX = (w - 1) / 2;
  const centerY = (h - 1) / 2;
  const peakCount = clamp(Math.floor((w * h) / 380), 2, 4);
  const seed = Math.floor(Math.random() * 9999);

  for (let i = 0; i < peakCount; i += 1) {
    peaks.push({
      x: centerX + ((Math.random() * 2 - 1) * w * 0.16),
      y: centerY + ((Math.random() * 2 - 1) * h * 0.16),
      rx: (w * (0.22 + Math.random() * 0.12)),
      ry: (h * (0.22 + Math.random() * 0.12))
    });
  }

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      let peakValue = 0;
      let secondValue = 0;
      for (const p of peaks) {
        const dx = (x - p.x) / Math.max(1, p.rx);
        const dy = (y - p.y) / Math.max(1, p.ry);
        const d = Math.sqrt((dx * dx) + (dy * dy));
        const v = Math.max(0, 1 - (d * d));
        if (v >= peakValue) {
          secondValue = peakValue;
          peakValue = v;
        } else if (v > secondValue) {
          secondValue = v;
        }
      }

      const edgeDist = Math.min(x, y, (w - 1) - x, (h - 1) - y);
      const edgeNorm = clamp(edgeDist / Math.max(1, Math.min(w, h) * 0.5), 0, 1);
      const edgePenalty = Math.pow(1 - edgeNorm, 1.7);
      const noise = fractalNoise2d(x, y, seed) - 0.5;
      const score = (peakValue * 1.05) + (secondValue * 0.30) + (noise * 0.38) - (edgePenalty * 0.62);
      interiorCells.push({ x, y, score });
    }
  }

  interiorCells.sort((a, b) => b.score - a.score);
  const landLimit = clamp(targetLand, 0, interiorCells.length);
  for (let i = 0; i < landLimit; i += 1) {
    const c = interiorCells[i];
    grid[c.y][c.x] = "平地";
  }

  smoothLand(grid, w, h, Math.max(1, cfg.smoothingPasses || 1));
  erodeLand(grid, w, h, Math.max(cfg.erosionChance || 0, 0.01));
}
