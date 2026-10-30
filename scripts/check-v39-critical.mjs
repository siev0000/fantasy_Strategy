import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-combat-engine.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const actor={id:'a',level:10,status:{攻撃:0,命中:100,Cr率:100,Cr威力:50},equipment:[]};
const target={id:'b',level:10,status:{防御:0,速度:10}};
const skill={名前:'試験',攻撃手段:'素手',判定:'攻撃',物理:100,効果:'必中'};
assert.equal(m.isV39SupportSkill({名前:'守護行動',効果:'守護'},actor),true,'guardian effect targets allies even without other support fields');
const damage=(attacker=actor,row=skill,enemy=target,random=()=>0)=>m.computeAttackDamage({attacker,target:enemy,skillRow:row,random,gameSettings:{combatDamageMultiplier:1}});
const critical=damage();assert.equal(critical.criticalCount,1);assert.equal(critical.total,60);
assert.equal(critical.hitResults[0].critical,true);
const ordinary=damage({...actor,status:{...actor.status,Cr率:0}});assert.equal(ordinary.total,40);assert.equal(ordinary.criticalCount,0);
assert.equal(damage(actor,{...skill,攻撃回数:3}).criticalCount,3);
assert.equal(damage(actor,{...skill,攻撃手段:'魔法',判定:'魔力'}).criticalCount,0);
assert.equal(damage(actor,{...skill,物理:0,炎:100}).criticalCount,0);
assert.equal(damage(actor,skill,{...target,resistances:{Cr率耐性:100}}).criticalCount,0);
assert.equal(damage(actor,skill,{...target,resistances:{Cr威力耐性:50}}).total,40);
assert.equal(damage(actor,{...skill,効果:''},target,()=>1).criticalCount,0,'miss never critical');
const sword={slot:'武器1',name:'試験剣',power:100,criticalRate:10,criticalPower:135};
const weaponActor={...actor,status:{攻撃:0,命中:100},equipment:[sword]};
const weaponRow=m.buildWeaponAttackRow(sword);
assert.equal(damage(weaponActor,weaponRow).detail.criticalRate,0.1);
assert.equal(damage(weaponActor,weaponRow).detail.criticalMultiplier,1.35);
assert.equal(damage(weaponActor,weaponRow).total,54);
const rolls=[0,0,0.5];
assert.equal(damage(weaponActor,weaponRow,target,()=>rolls.shift()).criticalCount,0);
assert.equal(damage(weaponActor,{...skill,攻撃手段:'武器',物理:0,打撃:100}).detail.criticalRate,0.1,'physical skill uses selected weapon stats once');
console.log('PASS: physical-only critical chance/power, weapon data, skills, misses, multi-hit, rate/power resistances, ordinary/magic unchanged. No browser.');
