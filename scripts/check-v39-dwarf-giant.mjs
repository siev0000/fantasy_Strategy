import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';

const bundle=await build({
  stdin:{resolveDir:process.cwd(),contents:`
    export * from './frontend/src/lib/v39-race-definitions.js';
    export * from './frontend/src/v39/core/v39-initial-sovereign.js';
  `},bundle:true,write:false,format:'esm',platform:'node',loader:{'.css':'empty'},
  define:{'import.meta.url':'"file:///test/race-enable.js"'},
  plugins:[{name:'runtime-data',setup(builder){
    builder.onLoad({filter:/icon-library\.js$/},args=>({
      contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([\s\S]*?\);/,'{};'),
      resolveDir:dirname(args.path),loader:'js'
    }));
    builder.onLoad({filter:/game-data-registry\.js$/},args=>{
      const root=resolve('data/source/export/json');
      const data=Object.fromEntries(readdirSync(root).filter(name=>name.endsWith('.json')).map(name=>[
        '../../../data/source/export/json/'+name,JSON.parse(readFileSync(resolve(root,name),'utf8'))
      ]));
      return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,JSON.stringify(data)+';'),resolveDir:dirname(args.path),loader:'js'};
    });
  }}]
});
globalThis.window={addEventListener(){},dispatchEvent(){},getV39GameState:()=>null};
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const factions=JSON.parse(readFileSync('data/source/export/json/勢力.json','utf8'));
for(const [race,alias,population] of [['ドワーフ','土人',50],['巨人','ジャイアント',15]]){
  const definition=m.resolveV39RaceDefinition(race);
  assert.equal(m.isV39RacePlayable(race),true);
  assert.equal(m.normalizeV39RaceName(alias),race);
  assert.equal(m.getV39PlayableRaceDefinitions().some(row=>row.key===race),true);
  assert.equal(factions.find(row=>row.種族===race).使用可,true);
  assert.equal(definition.初期人数,population);
  assert.ok(existsSync(resolve(definition.icon.replace(/^\//,''))),'existing icon: '+race);
  const candidates=m.getV39InitialSovereignClassCandidates(race);
  assert.ok(candidates.length>0);
  const hero=m.createV39InitialSovereign({playerId:'test',race,className:candidates[0].名前,characterName:'検証'});
  assert.equal(hero.ok,true,hero.reason);assert.equal(hero.unit.race,race);assert.ok(hero.unit.maxHp>0);
  const army=m.createV39InitialArmy({playerId:'test',race});
  assert.equal(army.ok,true,army.reason);assert.equal(army.unit.race,race);assert.equal(army.unit.isInitialArmy,true);
}
assert.equal(m.isV39RacePlayable('獣人'),false,'other incomplete races stay disabled');
console.log('PASS: dwarf/giant selection, faction eligibility, aliases, existing icons, initial hero and army creation. No browser.');
