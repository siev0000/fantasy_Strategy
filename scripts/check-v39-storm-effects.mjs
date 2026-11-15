import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';

const bundled=await build({entryPoints:['frontend/src/lib/v39-storm-effects.js'],bundle:true,format:'esm',platform:'node',write:false});
const {resolveV39StormPower,resolveV39StormBodyDamage,resolveV39StormFlightLoss,resolveV39StormShotPowerLoss,
  resolveV39DisasterPenaltyDamage,resolveV39ColdWaveMovementLoss,resolveV39ColdWaveShotPowerLoss}
  =await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
async function bundledModule(path){
  const result=await build({entryPoints:[path],bundle:true,format:'esm',platform:'node',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

assert.equal(resolveV39StormPower({origin:'natural'}),40);
assert.equal(resolveV39StormPower({origin:'magic',details:{magicPower:100}}),100);
const attacker={x:1,y:1,level:1,status:{体幹耐性:20,飛行:70}};
assert.equal(resolveV39StormBodyDamage(attacker,40),30);
const map={w:5,h:5,grid:Array.from({length:5},()=>Array(5).fill('平地')),
  disasterFields:[{disasterId:'暴風',tileKeys:['1,1','2,1','3,1'],stormPower:40}]};
assert.equal(resolveV39StormFlightLoss(map,attacker),30);
assert.equal(resolveV39StormShotPowerLoss(map,attacker,{x:3,y:1}),90);
map.disasterFields.push({disasterId:'暴風',tileKeys:['2,1'],stormPower:10});
assert.equal(resolveV39StormShotPowerLoss(map,attacker,{x:3,y:1}),90);
assert.equal(resolveV39StormFlightLoss(map,{...attacker,x:0,y:0}),0);
const coldUnit={...attacker,status:{氷耐性:20,飛行:70}};
assert.equal(resolveV39DisasterPenaltyDamage(coldUnit,40,'氷耐性'),30);
map.disasterFields=[{disasterId:'大寒波',tileKeys:['1,1','2,1','3,1'],coldPower:40}];
assert.equal(resolveV39ColdWaveMovementLoss(map,coldUnit),30);
assert.equal(resolveV39ColdWaveShotPowerLoss(map,coldUnit,{x:3,y:1}),90);
assert.equal(resolveV39ColdWaveShotPowerLoss(map,coldUnit,{x:0,y:0}),30);
const {projectV39DynamicDisasterFields}=await bundledModule('frontend/src/lib/v39-disaster-dynamics.js');
const {resolveV39GravityPower,resolveV39GravityMovementEffect}=await bundledModule('frontend/src/lib/v39-gravity-effects.js');
assert.equal(resolveV39GravityPower({origin:'natural'}),40);
assert.equal(resolveV39GravityPower({origin:'magic',details:{magicPower:90}}),90);
assert.deepEqual(resolveV39GravityMovementEffect({disasterFields:[{disasterId:'重力異常',tileKeys:['1,1'],gravityPower:40}]},[{x:1,y:1}]),{movementLoss:40,flightBlocked:true});
assert.deepEqual(resolveV39GravityMovementEffect({disasterFields:[]},[{x:1,y:1}]),{movementLoss:0,flightBlocked:false});
const projected={...map,disasterFields:[]};
projectV39DynamicDisasterFields(projected,null,[{disasterId:'暴風',tileKeys:['1,1'],x:1,y:1,startsAtTurn:1,expiresAtTurn:2,details:{}}],1);
assert.equal(projected.disasterFields[0].stormPower,40);
projectV39DynamicDisasterFields(projected,null,[{disasterId:'大寒波',tileKeys:['1,1'],x:1,y:1,startsAtTurn:1,expiresAtTurn:2,damagePower:40,details:{}}],1);
assert.equal(projected.disasterFields[0].coldPower,40);
projectV39DynamicDisasterFields(projected,null,[{disasterId:'大寒波',origin:'magic',tileKeys:['1,1'],x:1,y:1,startsAtTurn:1,expiresAtTurn:2,damagePower:40,details:{magicPower:90}}],1);
assert.equal(projected.disasterFields[0].coldPower,90);
projectV39DynamicDisasterFields(projected,null,[{disasterId:'重力異常',origin:'magic',tileKeys:['1,1'],x:1,y:1,startsAtTurn:1,expiresAtTurn:2,details:{magicPower:90}}],1);
assert.equal(projected.disasterFields[0].gravityPower,90);
const disasters=JSON.parse(readFileSync('data/source/export/json/災害.json','utf8'));
const coldRule=disasters.find(row=>row.表示名==='大寒波');
assert.equal(coldRule.ダメージ属性,'氷');
assert.equal(coldRule.ダメージ威力,40);
const {resolveV39BaseMoveApCost}=await bundledModule('frontend/src/lib/v39-gameplay-balance.js');
assert.ok(resolveV39BaseMoveApCost(0)>resolveV39BaseMoveApCost(10));
console.log('storm-effects: OK');
