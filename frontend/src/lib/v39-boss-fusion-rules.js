// One added class cannot satisfy multi-material or multi-body recipes.
export function getV39BossFusionCandidates(race, className, recipes, classNames) {
  if (className && className !== race) return [];
  const candidates = new Map();
  for (const row of recipes) {
    if (!['確定', '候補'].includes(row?.状態) || !String(row.合成結果 || '').trim()) continue;
    const materials = String(row.素材 || '').split(/[,、\n]/).map(value => value.trim());
    if (materials.length !== 2) continue;
    const names = materials.map(value => /^(.+)_1$/.exec(value)?.[1]);
    if (names.some(name => !name) || names[0] === names[1]) continue;
    const index = names.indexOf(race);
    if (index < 0) continue;
    const extraClass = names[1 - index];
    if (extraClass === className || !classNames.has(extraClass)) continue;
    const name = String(row.合成結果).trim();
    candidates.set(`${extraClass}:${name}`, { className:extraClass, name });
  }
  return [...candidates.values()];
}
