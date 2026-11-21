export function iconSheetCatalog(definitions, terrain, filenames) {
  const labels = Object.fromEntries(Object.entries(terrain.terrains).map(([name, tile]) => [tile.frame, name]));
  const frames = Object.keys(labels).map(Number);
  const terrainSheet = {
    filename:terrain.asset.split("/").pop(), label:"地形", group:"terrain",
    columns:terrain.columns, rows:terrain.rows, labels,
    firstNumber:Math.min(...frames), lastNumber:Math.max(...frames),
    excludedNumbers:Array.from({length:terrain.columns * terrain.rows}, (_, i) => i + 1).filter(n => !labels[n])
  };
  const sheets = [...definitions, terrainSheet];
  const known = new Set(sheets.map(sheet => sheet.filename));
  for (const filename of filenames) {
    if (known.has(filename) || !/\.(webp|png|jpe?g|svg)$/.test(filename)) continue;
    sheets.push({filename, label:filename.replace(/\.[^.]+$/, ""), group:"individual", columns:1, rows:1, firstNumber:1});
  }
  return sheets;
}
