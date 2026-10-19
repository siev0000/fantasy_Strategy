import {resolveAnimalArtworkReference,getArtworkClassNames} from './animal-artwork-config.js';
import {resolveInsectSpecies,resolveInsectArtwork} from './insect-artwork-config.js';
import {RACE_CLASS_NAME_MAP} from '../constants/unitCommon.js';

// 画像だけの対応表。4列×3行、左上から横順に1～12。能力データは変更しない。
export const アンデッド画像対応 = Object.freeze({
  ゾンビ:{fileName:'ゾンビ・スケルトン_ユニット集1.webp',slotNumber:1},
  動死体:{fileName:'ゾンビ・スケルトン_ユニット集1.webp',slotNumber:1},
  スケルトン:{fileName:'ゾンビ・スケルトン_ユニット集1.webp',slotNumber:2},
  骸骨:{fileName:'ゾンビ・スケルトン_ユニット集1.webp',slotNumber:2},
  グール:{fileName:'アンデッド・霊体系_ユニット集.webp',slotNumber:3},
  ワイト:{fileName:'アンデッド・霊体系_ユニット集.webp',slotNumber:5},
  ゴースト:{fileName:'アンデッド・霊体系_ユニット集.webp',slotNumber:6},
  幽霊:{fileName:'アンデッド・霊体系_ユニット集.webp',slotNumber:6},
  レイス:{fileName:'アンデッド・霊体系_ユニット集.webp',slotNumber:7},
  リッチ:{fileName:'アンデッド・霊体系_ユニット集.webp',slotNumber:10}
});

// 各対はゾンビ/スケルトンの順。画像集を目視確認した種族のみ対応させる。
const 種族別アンデッド画像 = {
  只人:[1,1],ヒューマン:[1,1],人間:[1,1],エルフ:[1,3],ドワーフ:[1,5],
  ゴブリン:[1,7],オーガ:[1,9],ドラゴニュート:[1,11],
  ジャイアント:[2,1],巨人:[2,1],ウルフマン:[2,3],タイガーマン:[2,5],バードマン:[2,9]
};

export function resolveUndeadArtworkReference(unit={}) {
  const insect=resolveInsectSpecies(unit);
  const names=[...getArtworkClassNames(unit),unit.race,unit.raceName,unit.種族名,unit.種族];
  const target=names.find(name=>Object.hasOwn(アンデッド画像対応,name)
    || insect&&['ヴァンパイア','吸血鬼'].includes(name));
  if(!target)return null;
  if(insect&&['ヴァンパイア','吸血鬼','ゾンビ','動死体','スケルトン','骸骨'].includes(target))return resolveInsectArtwork(unit,target);
  const rawSpecies=unit.race || unit.raceName || unit.種族;
  const species=RACE_CLASS_NAME_MAP[rawSpecies] || rawSpecies;
  const pair=種族別アンデッド画像[species];
  if(pair&&['ゾンビ','スケルトン'].includes(target))return {
    fileName:`ゾンビ・スケルトン_ユニット集${pair[0]}.webp`,
    slotNumber:pair[1]+(target==='スケルトン'?1:0),sizeByLevel:false};
  if(['ドレイク','ワイバーン'].includes(species)&&['ゾンビ','スケルトン'].includes(target))return {
    fileName:'アンデッド・霊体系_ユニット一覧.webp',slotNumber:10,sizeByLevel:false};
  // 動物の骨/ゾンビ画像は対応する動物専用シートのままにする。
  const animal=resolveAnimalArtworkReference(unit);
  if(animal&&['スケルトン','ゾンビ'].includes(target))return animal;
  return {...アンデッド画像対応[target],sizeByLevel:false};
}
