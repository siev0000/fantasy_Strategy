import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';

const bundled=await build({stdin:{contents:`export * from './frontend/src/constants/unitCommon.js';export * from './frontend/src/composables/unitStatusUtils.js';export * from './frontend/src/lib/v39-selection-detail.js';export * from './frontend/src/lib/v39-passive-rules.js';export * from './frontend/src/v39/unit/v39-character-derived-rules.js';export {classData,getGameDataRows} from './frontend/src/lib/game-data-registry.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'runtime-data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const root=resolve('data/source/export/json');
    const modules=Object.fromEntries(readdirSync(root).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(resolve(root,name),'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
}}]});
const warn=console.warn;let m;
try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const names=m.getGameDataRows('説明').map(row=>row.技能名);
assert.equal(names.length,24);
assert.equal(new Set(m.SKILL_LEVEL_FIELDS).size,m.SKILL_LEVEL_FIELDS.length);
for(const key of names){
  assert(m.SKILL_LEVEL_FIELDS.includes(key),key);
  assert(m.TIMED_EFFECT_FIELDS.includes(key),key);
  const grown=m.buildUnitSkillLevelsFromRules({raceRow:{[key]:20},classRow:{[key]:30},raceLevels:2,classLevels:3,raceLevelBaseOffset:5,skillLevelFields:m.SKILL_LEVEL_FIELDS,statusGrowthDivisor:10});
  assert.equal(grown[key],23,`${key} follows the existing growth formula`);
  const selected=m.buildV39SelectionDetailFromClassRow({名前:'検証',HP:100,[key]:30});
  assert(selected.skillRows.some(row=>row.key===key&&row.value===30&&row.desc),`${key} selection value/description`);
  assert.equal(m.collectV39PassiveBonuses([{名前:'検証', [key]:7}]).skillLevels[key],7,`${key} passive`);
}
for(const key of ['MP','ST']){
  assert(!m.STATUS_FIELDS.includes(key));assert(!m.STATUS_GROWTH_FIELDS.includes(key));assert(!m.SKILL_LEVEL_FIELDS.includes(key));
}
assert.equal(JSON.parse(readFileSync('data/source/export/json/クラス.json','utf8')).length,461);
assert(m.classData.length>=461,'runtime compatibility rows may be appended');
assert(m.getGameDataRows('技能').length>0);
assert(m.classData.some(row=>Object.values(row).includes('#N/A')),'source placeholders are retained, not invented');
const actual=m.deriveV39CharacterFromRaceClass({id:'schema-test',race:'只人',className:'ファイター',level:10});
assert(actual.ok);
for(const key of names)assert(Number.isFinite(actual.skillLevels[key]),`${key} actual derivation`);
assert(!Object.hasOwn(actual.status,'MP'));assert(!Object.hasOwn(actual.status,'ST'));
console.log('PASS: 24 source skills, descriptions, growth, passive effects, selection and actual character derivation; 461 classes; MP/ST remain inactive. No browser.');
