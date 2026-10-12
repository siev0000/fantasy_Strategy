import assert from "node:assert/strict";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const browser=await chromium.launch();
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
  const report=await page.evaluate(async()=>{
    const route=await import('/src/lib/v39-transport-rules.js');
    const teacher=await import('/src/lib/v39-recruit-instructor.js');
    const mine=await import('/src/lib/v39-cave-operations.js');
    const map={w:7,h:3,worldWrapEnabled:false,grid:[Array(7).fill('海'),Array(7).fill('平地'),Array(7).fill('海')],
      heightLevelMap:Array.from({length:3},()=>Array(7).fill(0))};
    const actor={id:'actor',className:'ファイター',race:'只人',x:0,y:1,hp:100,maxHp:100,ap:100,currentAp:100,maxAp:100,status:{移動:30},移動:30,unitType:'軍隊',isNamed:false};
    const friend={...actor,id:'friend',x:6};
    const base={id:'base',settlementId:'base',placed:true,ownerPlayerId:'p',x:0,y:1,tileFacilityMap:{'6,1':['兵舎']}};
    const state={players:[{id:'p',race:'只人',factionState:{units:[actor,friend],settlements:[base],squads:[{id:'solo',unitIds:['actor']}],
      recruitInstructorByTile:{},recruitInstructorTransfers:{'6,1':{unitId:'actor',className:'ファイター',settlementId:'base',lastProcessedTurn:0}}}}],
      enemies:[],neutralVillages:[],territoryOwnerByTile:Object.fromEntries(Array.from({length:7},(_,x)=>[`${x},1`,'p']))};
    const goal={x:6,y:1};
    const path=route.resolveV39AutomaticRoute(state,map,'p',actor,goal,false);
    const check=(condition,label)=>{if(!condition)throw new Error(label);};
    check(path?.length===5&&path.at(-1).x===5&&path.waitingForFriendlyUnitId==='friend','goal prefix');
    const middle=structuredClone(state);middle.players[0].factionState.units[1].x=3;
    const partial=route.resolveV39AutomaticRoute(middle,map,'p',actor,goal,false);
    check(partial?.length===6&&partial.at(-1).x===6&&partial[2].friendlyUnitId==='friend','corridor pass-through');
    const short=route.resolveV39AutomaticMovementSteps(partial,partial.slice(0,3).reduce((sum,step)=>sum+step.stepCost,0));
    check(short.length===2&&short.at(-1).x===2,'AP shortage stops before friend');
    const crossing=route.resolveV39AutomaticMovementSteps(partial,partial.slice(0,4).reduce((sum,step)=>sum+step.stepCost,0));
    check(crossing.length===4&&crossing.at(-1).x===4,'enough AP crosses friend');
    const chain=structuredClone(middle);chain.players[0].factionState.units.push({...friend,id:'friend2',x:4});
    const chainPath=route.resolveV39AutomaticRoute(chain,map,'p',actor,goal,false);
    check(route.resolveV39AutomaticMovementSteps(chainPath,chainPath.slice(0,4).reduce((sum,step)=>sum+step.stepCost,0)).at(-1).x===2,'chain does not overlap');
    check(route.resolveV39AutomaticMovementSteps(chainPath,chainPath.slice(0,5).reduce((sum,step)=>sum+step.stepCost,0)).at(-1).x===5,'chain crosses to free endpoint');
    const hostile=structuredClone(state);hostile.players[0].factionState.units=[actor];hostile.enemies=[{...friend,isEnemy:true}];
    check(route.resolveV39AutomaticRoute(hostile,map,'p',actor,goal,false)===null,'enemy not bypassed');
    const wall=structuredClone(map);wall.isUnderground=true;wall.grid[1][4]='岩壁';
    check(route.resolveV39AutomaticRoute(state,wall,'p',actor,goal,false)===null,'walls not bypassed');
    const bypass=structuredClone(map);bypass.grid[0]=Array(7).fill('平地');
    const detour=route.resolveV39AutomaticRoute(middle,bypass,'p',actor,goal,false);
    check(detour&& !detour.waitingForFriendlyUnitId&& !detour.some(step=>step.x===3&&step.y===1),'free detour preferred');
    let teaching=structuredClone(state);
    for(let turn=1;turn<=4;turn++){
      teaching.players[0].factionState.units=teaching.players[0].factionState.units.map(unit=>({...unit,ap:100,currentAp:100}));
      teaching=teacher.advanceV39RecruitInstructorMovement(teaching,'p',map,turn).state;
    }
    check(teaching.players[0].factionState.units[0].x===5,'teacher approaches');
    check(teaching.players[0].factionState.recruitInstructorTransfers['6,1'].status==='waiting-unit','teacher wait reason');
    teaching.players[0].factionState.units[1].worldId='other';
    teaching=teacher.advanceV39RecruitInstructorMovement(teaching,'p',map,5).state;
    check(teaching.players[0].factionState.units[0].x===6&&!teaching.players[0].factionState.recruitInstructorTransfers['6,1'],'teacher resumes');
    const cavern={...structuredClone(map),isUnderground:true,parentWorldId:'surface',parentExit:goal,entrances:[{x:0,y:1,surfaceEntrance:goal}],caveMine:{ownerPlayerId:'p',stockByResource:{鉱石:5}}};
    let duties={...structuredClone(state),explorationWorlds:{surface:{map,spatial:{enemies:[]}},cave:{map:cavern,spatial:{enemies:[]}}}};
    duties.players[0].factionState.units[0].caveDuty={mineWorldId:'cave',duty:'guard',cargo:{}};
    for(let turn=1;turn<=4;turn++){
      duties.players[0].factionState.units=duties.players[0].factionState.units.map(unit=>({...unit,ap:100,currentAp:100}));
      duties=mine.advanceV39MineDuties(duties,'p',turn);
    }
    check(duties.players[0].factionState.units[0].x===5&&duties.players[0].factionState.units[0].caveDuty.status==='味方ユニットの移動待ち','mine guard approaches');
    duties.players[0].factionState.units[1].worldId='other';
    duties=mine.advanceV39MineDuties(duties,'p',5);
    check(duties.players[0].factionState.units[0].x===6&&duties.players[0].factionState.units[0].caveDuty.status==='入口警備中','mine guard resumes');
    let delivery=structuredClone(state);
    delivery.players[0].factionState.settlements.push({...base,id:'dest',settlementId:'dest',x:6,tileFacilityMap:{},materialStockByType:{木材:0}});
    delivery.players[0].factionState.units[0].transportAssignment={enabled:true,originSettlementId:'base',destinationSettlementId:'dest',resource:'木材',leg:'outbound'};
    delivery.players[0].factionState.squads[0].cargoByUnitId={actor:{resourcesByType:{木材:2},equipmentInventory:[]}};
    for(let turn=1;turn<=4;turn++){
      delivery.players[0].factionState.units=delivery.players[0].factionState.units.map(unit=>({...unit,ap:100,currentAp:100}));
      delivery=route.advanceV39AutomaticTransport(delivery,'p',map,turn,false).state;
    }
    check(delivery.players[0].factionState.units[0].x===5&&delivery.players[0].factionState.units[0].transportAssignment.status==='waiting-unit','delivery approaches');
    check(delivery.players[0].factionState.settlements.find(row=>row.id==='dest').materialStockByType.木材===0,'not delivered prematurely');
    delivery.players[0].factionState.units[1].worldId='other';
    delivery=route.advanceV39AutomaticTransport(delivery,'p',map,5,false).state;
    check(delivery.players[0].factionState.units[0].x===6&&delivery.players[0].factionState.settlements.find(row=>row.id==='dest').materialStockByType.木材===2,'delivery resumes');
    for (const mode of ['teacher','mine','delivery']) {
      let passing=structuredClone(mode==='teacher'?middle:mode==='mine'?duties:delivery);
      const faction=passing.players[0].factionState;
      faction.units[0]={...faction.units[0],x:2,y:1,ap:100,currentAp:100};
      faction.units[1]={...faction.units[1],x:3,y:1,worldId:'surface'};
      if(mode==='teacher') faction.recruitInstructorTransfers['6,1'].lastProcessedTurn=0;
      if(mode==='mine') faction.units[0].caveDuty.lastProcessedTurn=0;
      if(mode==='delivery') Object.assign(faction.units[0].transportAssignment,{leg:'outbound',lastProcessedTurn:0});
      passing=mode==='teacher'?teacher.advanceV39RecruitInstructorMovement(passing,'p',map,10).state:
        mode==='mine'?mine.advanceV39MineDuties(passing,'p',10):route.advanceV39AutomaticTransport(passing,'p',map,10,false).state;
      const moved=passing.players[0].factionState.units[0];
      check(moved.x>3&&moved.ap<100,`${mode} crosses with paid AP`);
      check(passing.players[0].factionState.units[1].x===3,`${mode} does not displace friend`);
    }
    let crowded=structuredClone(middle);
    crowded.players[0].factionState.units=[{...actor,x:4}, {...friend,x:5}, {...friend,id:'incumbent',x:6}];
    crowded.players[0].factionState.recruitInstructorByTile={'6,1':{unitId:'incumbent',className:'ファイター',settlementId:'base'}};
    crowded=teacher.advanceV39RecruitInstructorMovement(crowded,'p',map,10).state;
    check(crowded.players[0].factionState.units.map(unit=>unit.x).join(',')==='4,5,6','swap cannot displace incumbent onto friend');
    check(crowded.players[0].factionState.recruitInstructorTransfers['6,1'].reason.includes('交代先'),'crowded swap waiting reason');
    return {prefix:true,middle:true,hostile:true,wall:true,detour:true,teacher:true,mine:true,delivery:true};
  });
  assert.deepEqual(errors,[]);console.log(report);
}finally{await browser.close();}
