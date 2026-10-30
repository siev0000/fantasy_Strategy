import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-siz-status-rules.js';export * from './frontend/src/lib/v39-gameplay-balance.js';export * from './frontend/src/v39/unit/v39-character-derived-rules.js';export {classData} from './frontend/src/lib/game-data-registry.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'runtime-data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
}}]});
globalThis.window={isV39TestMode:()=>false};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const raw={HP:400,攻撃:400,魔力:400,速度:400,命中:400,防御:400,精神:400,APP:100};
for(const [siz,power,speed,hit] of [[10,300,500,430],[170,400,400,400],[1000,500,300,370],[50,325,475,423]]){
  const result=m.applyV39SizStatusModifiers({...raw,SIZ:siz},{隠密:400,索敵:100});
  assert.equal(result.status.HP,power);assert.equal(result.status.攻撃,power);assert.equal(result.status.魔力,power);
  assert.equal(result.status.速度,speed);assert.equal(result.skillLevels.隠密,speed);assert.equal(result.status.命中,hit);
  assert.equal(result.status.防御,400);assert.equal(result.status.精神,400);assert.equal(result.status.APP,100);assert.equal(result.skillLevels.索敵,100);
}
assert.equal(m.resolveV39SizStatusModifiers(2000).statusPercent.HP,25*1830/830);
assert.equal(m.resolveV39SizStatusModifiers(-100).siz,10);
assert.equal(m.resolveV39SizStatusModifiers(undefined).siz,170);
assert.equal(m.applyV39SizStatusModifiers({HP:0,SIZ:10}).status.HP,0);
assert.ok(m.applyV39SizStatusModifiers({...raw,SIZ:100000}).status.速度>0);
assert.equal(m.resolveV39MovementStatFromStatus({速度:100,SIZ:10}),m.resolveV39MovementStatFromStatus({速度:100,SIZ:1000}));
const unit={id:'siz-test',race:'只人',className:'ファイター',level:10,equipment:[]};
const race=m.deriveV39CharacterFromRaceClass(unit).raceRow;assert.ok(race);
const originalSiz=race.SIZ;
try{
  race.SIZ=170;const neutral=m.deriveV39CharacterFromRaceClass(unit);assert.equal(neutral.ok,true);
  for(const [siz,factor] of [[10,.75],[1000,1.25]]){
    race.SIZ=siz;const derived=m.deriveV39CharacterFromRaceClass(unit);
    for(const key of ['HP','攻撃','魔力']){
      const passive=Number(neutral.passiveBonuses.status[key])||0;
      assert.equal(derived.status[key],Math.round((neutral.status[key]-passive)*factor)+passive);
    }
    const first=m.applyV39DerivedCharacterData(unit),second=m.applyV39DerivedCharacterData(first);
    assert.deepEqual(first.status,second.status);assert.deepEqual(first.skillLevels,second.skillLevels);
    assert.equal(first.maxHp,first.status.HP);
    const saved=JSON.parse(JSON.stringify({...first,hp:Math.round(first.maxHp/2),currentHp:Math.round(first.maxHp/2)}));
    assert.deepEqual(m.applyV39DerivedCharacterData(saved).status,first.status);
  }
  race.SIZ=170;const normal=m.applyV39DerivedCharacterData(unit);
  race.SIZ=1000;const resized=m.applyV39DerivedCharacterData({...normal,hp:normal.maxHp,currentHp:normal.maxHp});
  assert.equal(resized.hp,resized.maxHp);
  const dead=m.applyV39DerivedCharacterData({...normal,hp:0,currentHp:0,state:'死亡'});assert.equal(dead.hp,0);
  const partial=m.applyV39DerivedCharacterData({...normal,hp:normal.maxHp*.4,currentHp:normal.maxHp*.4});
  assert.equal(partial.hp,Math.round(partial.maxHp*.4));
}finally{race.SIZ=originalSiz;}
console.log('PASS: SIZ10/50/170/1000 and extrapolation, stat/stealth application, no movement double penalty, real character derivation/recalculation/save, HP-ratio migration/death. No browser.');
