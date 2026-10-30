import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const results=await page.evaluate(async()=>{
  const {resolveV39UnitMovementStepCost:cost}=await import('/src/lib/v39-terrain-traversal.js');
  const {planNextEnemyAction,inspectEnemyAiState}=await import('/src/lib/v39-enemy-ai-planner.js');
  const results=[];
  for(const underground of [false,true]){
   const map={w:3,h:3,isUnderground:underground,worldWrapEnabled:false,grid:Array.from({length:3},()=>Array(3).fill(underground?'洞窟':'平地')),heightLevelMap:Array.from({length:3},()=>Array(3).fill(0))};
   const unit={id:'movement-test-enemy',name:'test',x:0,y:0,hp:100,maxHp:100,ap:100,status:{移動:50},movement:50,aggressive:true,neverFlee:true,skillLevels:{索敵:1000}};
   const state={players:[],enemies:[unit],enemyNests:[],neutralVillages:[],settlements:[],enemyCombatRuntime:{},timeline:{turnNumber:1},activeWorldId:underground?'cave:test:1':'surface'};
   const plan=planNextEnemyAction(state,map,1);
   if(plan?.type!=='move')throw Error(`AI did not move: ${JSON.stringify(plan)}`);
   const expected=underground?10:20;
   if(plan.cost!==expected)throw Error(`AI cost ${plan.cost} != ${expected}`);
   if(inspectEnemyAiState(state,unit.id,1,map).pursuitLimit!==(underground?11:6))throw Error('AI pursuit limit mismatch');
   if(cost(map,0,0,1,0,{...unit,cargoSpeedMultiplier:0.5})!==expected*2)throw Error('Cargo penalty lost');
   if(cost(map,0,0,1,0,{...unit,cargoSpeedMultiplier:0})!==Infinity)throw Error('Overload should block movement');
   map.heightLevelMap[0][1]=1;
   if(cost(map,0,0,1,0,unit)!==Math.ceil(expected*1.25))throw Error('Height penalty lost');
   if(cost(map,0,0,1,0,{...unit,skillLevels:{飛行:100}})!==expected)throw Error('Flight correction lost');
   map.grid[0][1]='岩壁';
   if(underground&&cost(map,0,0,1,0,unit)!==Infinity)throw Error('Cave walls became passable');
   results.push({underground,cost:plan.cost,pursuit:inspectEnemyAiState(state,unit.id,1,map).pursuitLimit});
  }
  return results;
 });
 assert.deepEqual(errors,[]);console.log('Cave/surface AI movement parity, pursuit, cargo, height, flight and wall rules passed',results);
}finally{await browser.close();}
