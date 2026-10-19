// Image references only; unit abilities and fusion recipes remain sheet-managed.
// Four columns by three rows, numbered left to right from the top.
const sheets = {
  '妖怪_ユニット集1.webp': [
    '天狗', '河童', '絡新婦', '鬼火',
    '雪女', '鵺', 'がしゃどくろ', '妖狐',
    '九尾狐', '鬼車', '相柳', '猫又'
  ],
  '妖怪_ユニット集2.webp': [
    '饕餮', '窮奇', '檮杌', '混沌',
    '青龍', '白虎', '朱雀', '玄武',
    '白沢', '麒麟', '応龍', '犼'
  ]
};

export const YOKAI_ARTWORK_ENTRIES = Object.freeze(Object.entries(sheets).flatMap(([fileName,names])=>
  names.map((name,index)=>Object.freeze({name,fileName,slotNumber:index+1,sizeByLevel:false}))));
const byName = new Map(YOKAI_ARTWORK_ENTRIES.map(row=>[row.name,row]));

export function resolveYokaiArtworkReference(unit={}) {
  const names=[unit.strongFusionResultName,unit.fusionGrowth?.recipeName,
    unit.種族名,unit.speciesName,unit.enemyName,unit.name,unit.displayName,
    unit.race,unit.種族,unit.raceName,unit.className,unit.サブクラス];
  for(const name of names){
    const reference=byName.get(String(name??'').trim());
    if(reference)return reference;
  }
  return null;
}
