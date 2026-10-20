export function parseV39SpawnTerrains(value){
  const values=Array.isArray(value)?value:[value];
  return [...new Set(values.flatMap(item=>String(item??'').split(/[、,，;；|｜/／\n]+/)).map(name=>name.trim()).filter(Boolean))];
}
