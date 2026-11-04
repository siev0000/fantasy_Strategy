import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
process.on('uncaughtException',error=>{console.error(String(error.stack||error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[bundle]').slice(0,1400));process.exit(1);});
const bundle=await build({entryPoints:['frontend/src/v39/combat/v39-combat-feedback.js'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'headless',setup(b){
 b.onLoad({filter:/v39-combat-feedback\.js$/},args=>({contents:readFileSync(args.path,'utf8')+'\nexport {showDamagePopups,showTypedPopup};',resolveDir:dirname(args.path),loader:'js'}));
 b.onLoad({filter:/game-data-registry\.js$/},args=>{const root=resolve('data/source/export/json'),data=Object.fromEntries(readdirSync(root).filter(n=>n.endsWith('.json')).map(n=>[`../../../data/source/export/json/${n}`,JSON.parse(readFileSync(`${root}/${n}`,'utf8'))]));return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,JSON.stringify(data)+';'),resolveDir:dirname(args.path),loader:'js'};});
}}]});
const labels=[],handlers=new Map(),scene={add:{text(x,y,text,style){const label={x,y,text,style,data:{},setOrigin(){return this;},setDepth(){return this;},setAlpha(){return this;},setName(){return this;},setData(key,value){this.data[key]=value;return this;},destroy(){}};labels.push(label);return label;}},tweens:{add(){}},time:{delayedCall(){}}};
const state={activeWorldId:'surface',activePlayerId:'p',timeline:{phase:'player'},players:[{id:'p',factionState:{units:[{id:'own',x:2,y:2,hp:100,maxHp:100}]}}],enemies:[{id:'hidden',x:4,y:4,hp:100,maxHp:100}]};
globalThis.window={addEventListener(name,fn){handlers.set(name,fn);},setTimeout(){},getV39GameState:()=>state,getV39EnemyTurnState:()=>state,isV39TestMode:()=>false,isV39TileInCurrentVision:()=>false,isV39EntityDetected:()=>false,__v39FieldRuntime:{game:{scene:{getScenes:()=>[scene]}}}};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));}finally{console.warn=warn;}
const config=JSON.parse(readFileSync('config/v39-combat-popups.json','utf8')),center={x:100,y:100};
m.showDamagePopups(scene,{targetId:'u',hits:[32],hitResults:[{critical:false}],detail:{power:40}},center);
assert.equal(labels.at(-1).text,'32');assert.equal(labels.at(-1).style.color,config.types.hpDamage.color);
m.showDamagePopups(scene,{targetId:'u',hits:[48],hitResults:[{critical:true}],detail:{power:60}},center);
assert.equal(labels.at(-1).text,'48!');assert.equal(labels.at(-1).style.color,config.types.critical.color);
const previousY=labels.at(-1).y;
m.showTypedPopup(scene,{targetId:'u',popupType:'abilityDamage',popupLabel:'速度',amount:12},center);
assert.equal(labels.at(-1).text,'速度 −12');assert.equal(labels.at(-1).style.color,config.types.abilityDamage.color);assert.ok(labels.at(-1).y<previousY);
const emit=(targetId,popupType='abilityDamage',amount=12,defer=false)=>handlers.get('v39:unit-effect-feedback')({detail:{worldId:'surface',defer,entries:[{targetId,x:2,y:2,popupType,popupLabel:'速度',amount,total:0}]}});
let count=labels.length;emit('hidden');assert.equal(labels.length,count,'hidden enemy changes stay hidden');
emit('own');assert.equal(labels.length,count+1,'own changes are visible');
count=labels.length;window.__v39SuppressCombatEffects=true;emit('own');assert.equal(labels.length,count);window.__v39SuppressCombatEffects=false;
emit('own','abilityHeal',10,true);emit('own','curseHeal',10,true);assert.equal(labels.length,count);
window.flushV39HazardFeedback();assert.equal(labels.length,count+2,'different recovery types stay separate when deferred');
assert.ok(labels.some(label=>label.text==='速度 呪回復10'&&label.style.color===config.types.curseHeal.color));
console.log('PASS: configured white/orange/purple/recovery text, vertical stacking, visibility, suppression and deferred type separation. No browser.');
