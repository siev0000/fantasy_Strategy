import {classData} from "./game-data-registry.js";
import {getV39PlayableRaceDefinitions} from "./v39-race-definitions.js";
import {buildV39UnitEntity,getV39InitialJobClasses} from "./v39-unit-creation-rules.js";

export const V39_GACHA_DRAW_COUNT = 6;
export const V39_GACHA_UNIT_LEVEL = 10;

const RARITY_GROUPS = [
  {rarity:1,rate:35,species:[
    "タイガー","ウルフ","スネーク","ホーク","ベア","クロコダイル","ホース","ボア",
    "ライオン","ゴート","オウル","リザード","モンキー","フォックス","タートル","ディア",
    "ビートル","スタッグビートル","マンティス","ビー","アント","スパイダー","センティピード","スコーピオン"
  ]},
  {rarity:2,rate:30,races:["ヒューマン","エルフ","ドワーフ"]},
  {rarity:3,rate:20,races:["ドラゴニュート","オーガ","ジャイアント","ゴブリン"],species:["トレント"]},
  {rarity:4,rate:15,races:["デヴィル","エンジェル","ヴァンパイア"],species:[
    "ゾンビ","スケルトン","ゴースト","フレイムエレメンタル","フロストエレメンタル",
    "ウォーターエレメンタル","エアエレメンタル","アースエレメンタル"
  ]}
];

export function drawV39GachaUnits({random=Math.random}={}) {
  const tierOne = row => Number(row.Tire)===1 && Number(row.HP)>0;
  const tierOneNames = new Set(classData.filter(tierOne).map(row=>row.名前));
  const jobs = getV39InitialJobClasses().filter(tierOne);
  const races = getV39PlayableRaceDefinitions().filter(row=>tierOneNames.has(row.className));
  const groups = RARITY_GROUPS.map(({rarity,rate,species=[],races:allowedRaces=[]})=>({
    rarity,rate,candidates:[
      ...species.filter(name=>tierOneNames.has(name)).map(name=>({race:name,name,className:name,raceOnly:true})),
      ...races.filter(row=>allowedRaces.includes(row.className)).flatMap(row=>jobs.map(job=>({
        race:row.key,name:row.name,className:job.名前
      })))
    ]
  }));
  if(groups.some(group=>!group.candidates.length))return [];

  const pick=rows=>rows[Math.min(rows.length-1,Math.floor(random()*rows.length))];
  return Array.from({length:V39_GACHA_DRAW_COUNT},(_,index)=>{
    let roll=random()*100;
    const group=groups.find(({rate})=>(roll-=rate)<0)??groups.at(-1);
    const {race,name,className,raceOnly=false}=pick(group.candidates);
    const unit=buildV39UnitEntity({
      id:`gacha-unit-${index+1}`,name,race,className,level:V39_GACHA_UNIT_LEVEL,
      unitType:raceOnly?"通常ユニット":"ヒーロー",isMob:raceOnly,isNamed:false,raceOnly
    });
    return {...unit,gachaRarity:group.rarity};
  });
}
