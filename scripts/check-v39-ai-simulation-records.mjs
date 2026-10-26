import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  const {compareSimulationActors:compare,simulationActors}=await import('/src/v39/dev/v39-ai-simulation-records.js');
  const {describeV39ResourceDelta}=await import('/src/lib/v39-resource-delta-view.js');
  const {describeV39NpcObjective}=await import('/src/lib/v39-npc-objective-label.js');
  const actor={id:'a',kind:'勢力',name:'検査',units:[{id:'u',x:1,y:1,hp:100,ap:100,worldId:'surface'}],stocks:{穀物:10},
    pending:[],training:[],buildings:[],goal:'探索',population:10,reasons:[],commands:['以前の建設コマンド'],processedTurn:1};
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const history=Array.from({length:4},(_,i)=>({turn:i+1,actors:[structuredClone(actor)]}));
  const idle=compare([actor],[actor],history);ok(idle.issues.some(row=>row.severity==='要確認'),'stagnation missed');
  ok(!idle.changes.some(row=>row.message==='以前の建設コマンド'),'stale commands repeated');
  const progress={...actor,pending:[{name:'農場',remainingTurns:2}]};
  ok(!compare([actor],[progress],history).issues.length,'construction progress flagged');
  const duplicate={...actor,units:[...actor.units,...actor.units]};
  ok(compare([actor],[duplicate]).issues.some(row=>row.severity==='異常'),'duplicate not fatal');
  ok(compare([actor],[{...actor,stocks:{穀物:NaN}}]).issues.some(row=>row.severity==='異常'),'NaN not fatal');
  ok(compare([actor],[{...actor,stocks:{穀物:-1}}]).issues.every(row=>row.severity==='要確認'),'negative stock misclassified');
  const moved={...actor,units:actor.units.map(unit=>({...unit,x:2}))};
  const alternating=[actor,moved,actor,moved].map((row,index)=>({turn:index+1,actors:[row]}));
  ok(compare([moved],[actor],alternating).issues.some(row=>row.message.includes('交互')),'oscillation missed');
  ok(compare([actor],[{...actor,units:[]}]).changes.some(row=>row.message.includes('移籍')),'departure asserted as death');
  ok(describeV39NpcObjective(null).includes('未設定'),'null objective rejected');
  const bases=Array.from({length:2},()=>({placed:true,foodStockByType:{肉:20,魚:0},materialStockByType:{木材:10,鉄:0},lastEconomyDelta:{food:{肉:-8.5},material:{木材:5,鉄:0}}}));
  const sample={players:[{id:'test',isPlayer:false,factionState:{units:[],settlements:bases}}]},original=JSON.stringify(sample);
  const snapshot=simulationActors(sample,{})[0];
  ok(snapshot.stocks.木材===20&&snapshot.stockDeltas.木材===10&&snapshot.stockDeltas.肉===-17,'multi-base delta aggregation');
  ok(snapshot.stockDeltas.鉄===0&&snapshot.stockDeltas.魚===null,'zero and unknown merged');
  ok(JSON.stringify(sample)===original,'snapshot mutated economy');
  delete bases[1].lastEconomyDelta.material.木材;
  ok(simulationActors(sample,{})[0].stockDeltas.木材===null&&snapshot.stockDeltas.木材===10,'partial data or historical delta corrupted');
  ok(describeV39ResourceDelta(5).text==='(+5)'&&describeV39ResourceDelta(-8.5).text==='(-8.5)'&&describeV39ResourceDelta(null).text==='(未集計)','shared delta format');
  return {idle:idle.issues,checks:14};
 });
 assert.equal(result.checks,14);console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
