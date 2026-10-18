import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch();
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  const results=await page.evaluate(async()=>{
    const {resolveV39UnitMovementStepCost:cost}=await import('/src/lib/v39-terrain-traversal.js');
    const {planNextEnemyAction}=await import('/src/lib/v39-enemy-ai-planner.js');
    const unit=flight=>({id:'flight-test',x:0,y:0,hp:100,maxHp:100,ap:1000,neverFlee:true,status:{移動:10},skillLevels:{飛行:flight}});
    const map=(height,terrain='平地',structures=[])=>({w:2,h:1,worldWrapEnabled:false,grid:[['平地',terrain]],heightLevelMap:[[0,height]],defenseStructures:structures});
    const wall=barrierAttached=>({kind:'壁',hp:100,height:2,barrierAttached,tiles:[{x:1,y:0}]});
    const cases=[
      ['ground-block',0,2,Infinity],['minimal-flight',1,2,150],
      ['half',50,2,138],['one',100,2,125],['full',200,2,100],['excess',1000,2,100],
      ['fraction',50.5,2,138],['downhill',100,-2,100],['flat',1000,0,100],
      ['forest',1000,2,150,'森'],['forest-uphill',50,2,188,'森']
    ];
    const result=cases.map(([name,flight,height,expected,terrain])=>{
      const m=map(height,terrain),u=unit(flight),actual=cost(m,0,0,1,0,u);
      const state={enemies:[u],players:[],neutralVillages:[],settlements:[],enemyNests:[],enemyCombatRuntime:{}};
      const plan=planNextEnemyAction(state,m,1);
      return {name,expected:Number.isFinite(expected)?expected:'blocked',actual:Number.isFinite(actual)?actual:'blocked',ai:plan.type==='move'?plan.cost:'blocked'};
    });
    result.push({name:'normal-wall',expected:125,actual:cost(map(0,'平地',[wall(false)]),0,0,1,0,unit(100))});
    const barrier=map(0,'平地',[wall(true)]);
    result.push({name:'barrier-wall',expected:'blocked',actual:Number.isFinite(cost(barrier,0,0,1,0,unit(1000)))?'pass':'blocked',
      ai:planNextEnemyAction({enemies:[unit(1000)],players:[],neutralVillages:[],settlements:[],enemyNests:[],enemyCombatRuntime:{}},barrier,1).type==='move'?'pass':'blocked'});
    const legacy={...unit(0),status:{移動:10,飛行:null},飛行:'',skillLevels:{飛行:100}};
    result.push({name:'empty-legacy-fields',expected:125,actual:cost(map(2),0,0,1,0,legacy)});
    return result;
  });
  for(const row of results) {
    assert.equal(row.actual,row.expected,JSON.stringify(row));
    if('ai' in row)assert.equal(row.ai,row.expected,JSON.stringify(row));
  }
  assert.deepEqual(errors,[]);
  console.log('flight: 14 boundary/terrain/wall cases and enemy movement parity passed');
} finally {await browser.close();}
