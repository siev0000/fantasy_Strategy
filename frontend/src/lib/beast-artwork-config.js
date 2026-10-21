// Image-only mapping, four columns by three rows, numbered left to right.
const sheets={
  '魔獣_ユニット集.webp':[
    'マンティコア','キメラ','グリフォン','アウルベア',
    'スフィンクス','ディスプレイサービースト','バシリスク','ハイドラ',
    'ヘルハウンド','ブレット','コカトリス','ヒッポグリフ'
  ],
  '魔獣_ユニット集2.webp':[
    'フェニックス','サラマンダー','ペルーダ','ガーゴイル',
    'アスピドケロン','カトブレパス','クラーケン','オルトロス',
    'ビホルダー','ケルベロス','ペリュトン','ケートス'
  ]
};

export const BEAST_ARTWORK_ENTRIES=Object.freeze(Object.entries(sheets).flatMap(([fileName,names])=>
  names.map((name,index)=>Object.freeze({name,fileName,slotNumber:index+1,sizeByLevel:false}))));
const byName=new Map(BEAST_ARTWORK_ENTRIES.map(row=>[row.name,row]));

export function resolveBeastArtworkReference(unit={}){
  const names=[unit.strongFusionResultName,unit.fusionGrowth?.recipeName,
    unit.種族名,unit.speciesName,unit.enemyName,unit.name,unit.displayName,
    unit.race,unit.種族,unit.raceName,unit.className,unit.サブクラス];
  for(const name of names){
    const reference=byName.get(String(name??'').trim());
    if(reference)return reference;
  }
  return null;
}
