export function resolveV39TerrainNameAt(mapData, x, y) {
  if (x === null || x === undefined || x === "" || y === null || y === undefined || y === "") return "";
  const nx = Math.floor(Number(x));
  const ny = Math.floor(Number(y));
  if (!mapData?.grid || !Number.isFinite(nx) || !Number.isFinite(ny)) return "";
  if (!mapData.grid[ny]?.[nx]) return "";
  if (mapData.lavaMap?.[ny]?.[nx]) return "溶岩";
  return String(mapData.specialMap?.[ny]?.[nx] || mapData.grid[ny][nx]).trim();
}
