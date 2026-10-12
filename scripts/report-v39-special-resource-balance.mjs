import {readFileSync,writeFileSync,mkdirSync} from "node:fs";

const read=name=>JSON.parse(readFileSync(`data/source/export/json/${name}.json`,"utf8"));
const definitions=read("特産品").filter(row=>row.分類==="特殊資源");
const consumption=read("消費量"),equipment=read("装備");
const round1=value=>Math.round(value*10)/10;
const requiredTurns=(cost,definition,sites=1,researchLevel=0)=>{
  if(cost<=0)return 0;
  const cycles=Math.ceil(cost/(sites*definition.採取量));
  return Math.ceil(cycles*definition.採取周期/(1+researchLevel*definition.研究速度補正));
};
const waits=cost=>Object.fromEntries(definitions.filter(row=>Number(cost[row.名前])>0).map(row=>[
  row.名前,{cost:cost[row.名前],oneSite:requiredTurns(cost[row.名前],row),
    threeSites:requiredTurns(cost[row.名前],row,3),researchLv2:requiredTurns(cost[row.名前],row,1,2)}
]));
const craftCosts=[];
for(const item of equipment.filter(row=>["剣","弓"].includes(row.装備名))) {
  for(const quality of consumption.filter(row=>row.種別==="装備"&&row.品質キー)) {
    const cost={};
    for(const key of ["黒木","特木"])cost[key]=round1(Number(quality[key]||0)*Number(item.木材||0));
    for(const key of ["銀鉄","青金鋼","赤黒鋼"])cost[key]=round1(Number(quality[key]||0)*Number(item.鉱石||0));
    craftCosts.push({item:item.装備名,quality:quality.品質名,cost,waits:waits(cost)});
  }
}
const report={
  assumptions:"在庫0・取得済み自領・全地点の進捗0。資源ごとの採取待ちだけで、発見・研究・移動・運搬・通常資源の待ちを含まない。装備は現行の素材比率と小数1桁丸めを使用。",
  resources:definitions.map(row=>({name:row.名前,turns:row.採取周期,amount:row.採取量,research:row.研究区分,speedPerResearchLevel:row.研究速度補正})),
  craftCosts,
  facilities:read("施設").filter(row=>definitions.some(def=>Number(row[def.名前])>0))
    .map(row=>({name:row.施設名,waits:waits(row)})),
  enchantment:consumption.filter(row=>row.種別==="付与").map(row=>({level:row.Lv,waits:waits(row)}))
};
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/special-resource-balance.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
