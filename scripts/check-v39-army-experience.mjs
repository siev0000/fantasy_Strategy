import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-unit-experience.js';export * from './frontend/src/lib/v39-recruit-training.js';export * from './frontend/src/lib/v39-gameplay-balance.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const make=(count=1)=>({id:`army-${count}`,name:'試験軍',race:'只人',className:'ファイター',level:3,hp:100,maxHp:100,
  combatProfile:{memberCount:count},totalExp:m.resolveV39UnitTotalExpForLevel(3,'human')});
for(const [count,multiplier] of [[1,1],[2,1.5],[3,2],[4,2.5],[5,3]]){
  const unit=make(count),old=JSON.stringify(unit),need=m.resolveV39UnitExpNeed(3,'human');
  assert.equal(m.resolveV39ArmyExpMultiplier(unit),multiplier);
  assert.equal(m.resolveV39UnitExpDisplay(unit).need,Math.ceil(need*multiplier));
  let result=m.grantV39UnitExperience(unit,Math.ceil(need*multiplier)-1);
  assert.equal(result.unit.level,3,`${count} members must not level early`);
  assert.equal(m.resolveV39UnitExpDisplay(result.unit).exp,Math.ceil(need*multiplier)-1);
  result=m.grantV39UnitExperience(result.unit,1);
  assert.equal(result.unit.level,4,`${count} members level at scaled need`);
  assert.equal(JSON.stringify(unit),old,'no input/save level changes');
}
let small=make(2);
for(let i=0;i<9;i++)small=m.grantV39UnitExperience(small,1).unit;
assert.equal(m.resolveV39UnitExpDisplay(small).exp,9,'small awards are not lost');
assert.equal(m.grantV39UnitExperience(make(3),100).amount,100,'report original received EXP');
const old={...make(3),totalExp:make(3).totalExp+50};
assert.equal(m.resolveV39UnitExpDisplay(old).percent,50/m.resolveV39UnitExpNeed(3,'human')*100,'legacy progress percentage preserved');
assert.equal(m.resolveV39UnitExpDisplay(JSON.parse(JSON.stringify(small))).exp,9);
const member=i=>({id:`animal-${i}`,race:'ウルフ',className:'ウルフ',level:3,hp:100,maxHp:100,totalExp:m.resolveV39UnitTotalExpForLevel(3,'other')});
for(const size of [2,3,5]){
  const members=Array.from({length:size},(_,i)=>member(i));
  const unit={...members[0],id:'animal-army',combatProfile:{memberCount:size},animalArmy:{members}};
  const multiplier=1+(size-1)*.5,need=m.resolveV39UnitExpNeed(3,'other');
  assert.equal(m.resolveV39UnitExpDisplay(unit).need,Math.ceil(need*multiplier));
  const advanced=m.grantV39UnitExperience(unit,Math.ceil(need*multiplier));
  assert.equal(advanced.unit.level,4,'animal armies use same effective requirement, not count times multiplier');
  assert.equal(advanced.amount,Math.ceil(need*multiplier));
  assert(advanced.unit.animalArmy.members.every(row=>row.level>=4));
  let partial=unit;for(let i=0;i<6;i++)partial=m.grantV39UnitExperience(partial,1).unit;
  assert.equal(m.resolveV39UnitExpDisplay(partial).exp,6,'animal distributed fractions are retained');
}
const faction={units:[],settlements:[],recruitInstructorByTile:{}};
const base={settlementId:'b',tileFacilityMap:{},research:{}};
const solo=m.inspectV39RecruitTraining(faction,base,make(1));
const army=m.inspectV39RecruitTraining(faction,base,make(3));
assert.equal(army.requiredExp,solo.requiredExp*2);
assert.equal(army.expPerTurn,solo.expPerTurn);
console.log('PASS: 1-5 member linear EXP requirements, level thresholds, fractional awards, legacy/save progress, animal parity and recruit training. No browser.');
