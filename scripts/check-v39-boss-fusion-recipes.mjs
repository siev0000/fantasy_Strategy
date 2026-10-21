import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync('frontend/src/lib/v39-boss-fusion-rules.js','utf8');
const {getV39BossFusionCandidates:choose}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const recipes=read('data/source/export/json/モンスター合成.json');
const classes=new Set(read('data/source/export/json/クラス.json').map(row=>row.名前));
const groups=read('config/v39-fusion-defaults.json').materialGroups;
const lion=choose('ライオン','ライオン',recipes,classes,groups);
assert(lion.length>0,'registered lion recipes remain available');
assert(!lion.some(row=>row.className==='フロストアニマル'),'no unlisted lion + frost evolution');
assert(!choose('タイガー','タイガー',recipes,classes,groups).some(row=>row.name==='白虎'),'listed divine fusion must not spawn as a natural boss');
assert(choose('ベア','ベア',recipes,classes,groups).some(row=>row.className==='フロストアニマル'&&row.name==='イエティ'));
for(const race of classes){
 for(const candidate of choose(race,race,recipes,classes,groups)){
  assert(!recipes.some(recipe=>recipe.合成結果===candidate.name&&String(recipe.ボーナスクラス||'').split(',').includes('神獣')));
  assert(recipes.some(recipe=>['確定','候補'].includes(recipe.状態)&&recipe.合成結果===candidate.name
   &&choose(race,race,[recipe],classes,groups).some(row=>row.className===candidate.className)),`${race}: recipe required`);
 }
}
assert.deepEqual(choose('ライオン','ライオン',[],classes,groups),[],'no random attribute fallback');
assert.deepEqual(choose('ライオン','フロストアニマル',recipes,classes,groups),[],'no evolution from an unlisted existing subclass');
console.log('Boss evolution uses registered recipes only; lion + frost rejected, bear + frost retained');
