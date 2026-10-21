// One added class cannot satisfy multi-material or multi-body recipes.
// Only listed recipes are eligible; never infer arbitrary animal + attribute pairs.
export function getV39BossFusionCandidates(race, className, recipes, classNames, groups = {}, excludedNames = new Set()) {
  if (className && className !== race) return [];
  const candidates = new Map();
  for (const row of recipes) {
    if (!['確定', '候補'].includes(row?.状態) || !String(row.合成結果 || '').trim()) continue;
    // A listed fusion is not automatically eligible for natural boss evolution.
    if(excludedNames.has(String(row.合成結果).trim())
      ||String(row.ボーナスクラス||'').split(/[,、\n]/).some(name=>name.trim()==='神獣'))continue;
    const materials = String(row.素材 || '').split(/[,、\n]/).map(value => value.trim());
    if (materials.length !== 2) continue;
    const names = materials.map(value => /^(.+)_1$/.exec(value)?.[1]);
    if (names.some(name => !name) || names[0] === names[1]) continue;
    const expanded=names.map(name=>groups[name] || [name]);
    for(const pair of expanded[0].flatMap(a=>expanded[1].map(b=>[a,b]))){
      const index=pair.indexOf(race);if(index<0)continue;
      const extraClass=pair[1-index];
      if(extraClass==='神獣'||excludedNames.has(extraClass))continue;
      if(extraClass===race || extraClass===className || !classNames.has(extraClass))continue;
      const name=String(row.合成結果).trim();
      candidates.set(`${extraClass}:${name}`,{className:extraClass,name});
    }
  }
  return [...candidates.values()];
}
