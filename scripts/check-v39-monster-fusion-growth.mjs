import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
// Use the production EXP formula, but isolate this arithmetic test from UI/data imports.
const experience=readFileSync('frontend/src/lib/v39-unit-experience.js','utf8');
const start=experience.indexOf('export function resolveV39UnitExpNeed('),end=experience.indexOf('export function resolveV39UnitTotalExpForLevel(');
const exp=moduleUrl(`const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;const V39_UNIT_EXP_LEVEL_SPLIT=15;
export const resolveV39UnitRaceCategory=()=>"other";
${experience.slice(start,end)}`);
const rules=await import(moduleUrl(readFileSync('frontend/src/lib/v39-monster-fusion-growth.js','utf8').replace("'./v39-unit-experience.js'",JSON.stringify(exp))));
const unit=(id,race,level)=>({id,race,className:race,level,derivedCharacter:{ok:true,race,className:race,raceLevels:Math.ceil(level/2),classLevels:Math.floor(level/2),prerequisiteClassLevels:{}}});
const calculate=(a,b,acquiredClasses=['幻獣'])=>rules.calculateV39MonsterFusionGrowth({materials:[unit('a','ホース',a),unit('b','デヴィル',b)],requiredClasses:['ホース','デヴィル'],acquiredClasses});
let result=calculate(10,10);assert(result.ok);assert.equal(result.sourceLevel,20);assert.equal(result.level,12);assert.equal(result.levelsByClass.幻獣,1);
result=calculate(10,10,['幻獣','角']);assert(result.ok);assert.equal(result.level,12);assert.equal(result.levelsByClass.幻獣,1);assert.equal(result.levelsByClass.角,1);
result=calculate(6,6);assert(result.ok);assert.equal(result.baseProgress.fraction,.2);assert.equal(result.baseProgress.exp,result.baseProgress.need*.2);assert.equal(result.acquiredProgress.幻獣.exp,0);
result=calculate(30,5);assert(result.ok);assert.equal(result.level,31);
result=calculate(20,10,[]);assert(result.ok);assert.equal(result.level,22);
result=calculate(5,6,['デヴィル']);assert(result.ok);assert.equal(result.acquiredProgress.デヴィル.finalLevel,result.levelsByClass.デヴィル);assert.equal(result.acquiredProgress.デヴィル.exp,0);
assert(!calculate(1,1).ok,'never remove a required class or inflate the completed level');
assert(!rules.calculateV39MonsterFusionGrowth({materials:[unit('same','ホース',10),unit('same','デヴィル',10)]}).ok);
assert(!rules.calculateV39MonsterFusionGrowth({materials:[unit('a','ホース',10),unit('b','デヴィル',10)],requiredClasses:['未保持']}).ok);
for(let a=1;a<=35;a++)for(let b=1;b<=35;b++){
  const target=Math.max(a,b)+Math.min(a,b)/5;
  result=calculate(a,b,['幻獣','角']);if(Math.floor(target)<4){assert(!result.ok);continue;}assert(result.ok);
  assert.equal(result.level,Math.floor(target));
  assert.equal(Object.values(result.levelsByClass).reduce((sum,value)=>sum+value,0),result.level);
  assert(result.levelsByClass.ホース>=1&&result.levelsByClass.デヴィル>=1&&result.levelsByClass.幻獣>=1&&result.levelsByClass.角>=1);
  assert.equal(result.baseProgress.fraction,Math.round((target-Math.floor(target))*1e12)/1e12);
  for(const progress of [result.baseProgress,...Object.values(result.acquiredProgress)])assert(progress.exp>=0&&progress.exp<progress.need);
}
const inputs=[unit('a','ホース',5),unit('b','デヴィル',6)],before=JSON.stringify(inputs);
rules.calculateV39MonsterFusionGrowth({materials:inputs,requiredClasses:['ホース','デヴィル'],acquiredClasses:['角']});assert.equal(JSON.stringify(inputs),before);
const many=rules.calculateV39MonsterFusionGrowth({materials:[unit('a','ホース',20),unit('b','デヴィル',10),unit('c','狼',5)],requiredClasses:['ホース','デヴィル','狼'],acquiredClasses:['角']});
assert(many.ok);assert.equal(many.level,23);assert.equal(many.levelsByClass.角,1);
assert(!rules.calculateV39MonsterFusionGrowth({materials:[unit('a','ホース',120),unit('b','デヴィル',5)]}).ok);
console.log('fusion growth: highest + other levels * 20%, all required/acquired >=1, fractions, 1225 combinations, multi-material, caps and immutable inputs passed');
