// Each species has a vampire slot followed by a zombie slot, never a skeleton slot.
export const INSECT_ARTWORK = Object.freeze({
  アンケグ:['アンケグ・スコーピオン_ユニット集.webp',1],
  サソリ:['アンケグ・スコーピオン_ユニット集.webp',7],
  アリ:['アント・ビー_ユニット集.webp',1],
  ハチ:['アント・ビー_ユニット集.webp',7],
  ビートル:['カブトムシ・クワガタ_ユニット集.webp',1],
  クワガタ:['カブトムシ・クワガタ_ユニット集.webp',7],
  クモ:['スパイダー・センチピード_ユニット集.webp',1],
  ムカデ:['スパイダー・センチピード_ユニット集.webp',7],
  フライ:['フライ・バタフライ_ユニット集.webp',1],
  バタフライ:['フライ・バタフライ_ユニット集.webp',7],
  カマキリ:['マンティス・グラスホッパー_ユニット集.webp',1],
  グラスホッパー:['マンティス・グラスホッパー_ユニット集.webp',7]
});

const aliases = Object.freeze({
  スコーピオン:'サソリ',ジャイアントスコーピオン:'サソリ',
  アント:'アリ',ビー:'ハチ',ワスプ:'ハチ',カブトムシ:'ビートル',
  スパイダー:'クモ',センチピード:'ムカデ',マンティス:'カマキリ',
  ハエ:'フライ',チョウ:'バタフライ',バッタ:'グラスホッパー'
});

export function resolveInsectSpecies(unit={}) {
  if(!unit)return '';
  return [unit.race,unit.種族,unit.raceName,unit.speciesName,unit.種族名,unit.name]
    .map(value=>String(value||'').trim()).map(name=>aliases[name]||name)
    .find(name=>Object.hasOwn(INSECT_ARTWORK,name)) || '';
}

export function resolveInsectArtwork(unit,undeadClass='') {
  const species=resolveInsectSpecies(unit),row=INSECT_ARTWORK[species];
  if(!row || ['スケルトン','骸骨'].includes(undeadClass))return null;
  const offset=['ヴァンパイア','吸血鬼'].includes(undeadClass)?4:['ゾンビ','動死体'].includes(undeadClass)?5:0;
  return {fileName:row[0],slotNumber:row[1]+offset,sizeByLevel:false};
}
