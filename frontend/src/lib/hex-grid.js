const ODD_ROW_DELTAS = Object.freeze([[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]);
const EVEN_ROW_DELTAS = Object.freeze([[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]);
export const HEX_CLOCKWISE_NEIGHBOR_INDICES=Object.freeze([1,5,4,0,2,3]);

export function turnV39HexDirectionToward(current,target,steps=1){
  const from=HEX_CLOCKWISE_NEIGHBOR_INDICES.indexOf(current),to=HEX_CLOCKWISE_NEIGHBOR_INDICES.indexOf(target);
  if(to<0)return current;
  if(from<0)return target;
  const delta=(to-from+6)%6;
  const shortest=delta>3?delta-6:delta;
  return HEX_CLOCKWISE_NEIGHBOR_INDICES[(from+Math.sign(shortest)*Math.min(Math.abs(shortest),steps)+6)%6];
}

export function normalizeWrappedCoordinate(value, size) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(size)) || Number(size) <= 0) return 0;
  const result = Number(value) % Number(size);
  return result < 0 ? result + Number(size) : result;
}

export function getHexOffsetNeighbors(x, y) {
  const originX = Math.floor(Number(x) || 0);
  const originY = Math.floor(Number(y) || 0);
  const deltas = originY % 2 ? ODD_ROW_DELTAS : EVEN_ROW_DELTAS;
  return deltas.map(([dx, dy]) => ({ x:originX + dx, y:originY + dy }));
}

export function getHexNeighborCoords(width, height, x, y, worldWrapEnabled = false) {
  const w = Math.max(0, Math.floor(Number(width) || 0));
  const h = Math.max(0, Math.floor(Number(height) || 0));
  const result = [];
  const seen = new Set();
  for (const raw of getHexOffsetNeighbors(x, y)) {
    const nx = worldWrapEnabled ? normalizeWrappedCoordinate(raw.x, w) : raw.x;
    const ny = worldWrapEnabled ? normalizeWrappedCoordinate(raw.y, h) : raw.y;
    if (!worldWrapEnabled && (nx < 0 || ny < 0 || nx >= w || ny >= h)) continue;
    const key = `${nx},${ny}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ x:nx, y:ny, key });
  }
  return result;
}

export function getHexDistance(a, b) {
  const cube = point => {
    const y = Math.floor(Number(point?.y) || 0);
    const q = Math.floor(Number(point?.x) || 0) - ((y - (y & 1)) / 2);
    return [q, -q - y, y];
  };
  const aa = cube(a);
  const bb = cube(b);
  return Math.max(...aa.map((value, index) => Math.abs(value - bb[index])));
}
