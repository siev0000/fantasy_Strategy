import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch();
try{
 await mkdir('output/web-game/npc-diagnostic-layout',{recursive:true});
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
   window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();
   const s=window.getV39GameState(),p=s.players[0],base=p.factionState.settlements[0];
   const npcs=[0,1].map(i=>({...p,id:`diagnostic-${i}`,label:`診断勢力${i+1}`,race:i?'ヴァンパイア':'悪魔',isPlayer:false,
    factionState:{...p.factionState,settlements:[{...base,id:`base-${i}`,settlementId:`base-${i}`,name:`拠点${i+1}`,population:25,
     populationByRace:{悪魔:10,エルフ:15},subjectPopulationByRace:{エルフ:12},buildings:['墓地','農場'],
     constructionQueue:[{id:`build-${i}`,facilityName:'学校',tileKey:'4,4',remainingTurns:2,totalTurns:3}],
     foodStockByType:{...base.foodStockByType,肉:34+i},materialStockByType:{...base.materialStockByType,木材:123+i},
     lastEconomyDelta:{turn:4,food:{肉:-8.5},material:{木材:5,鉄:0}}}],selectedSettlementId:`base-${i}`,
     units:p.factionState.units.map(u=>({...u,id:`${i}-${u.id}`})),aiState:{lastProcessedTurn:4,
      objective:{type:'victory-landmark',hold:!!i,targetName:`目標${i+1}`,targetTileKey:'10,10'},lastCommands:[`行動記録${i+1}`],
      resourceTeams:[{resource:'木材',missing:50,role:'運搬',status:'移動中',unitIds:['a'],objective:{targetName:'搬入拠点'}}],
      developmentPlan:{construction:{status:'building',name:'学校',remainingTurns:2,tileKey:'4,4'},
       resourceGoals:[{name:'木材',stock:0,required:50,missing:50,purpose:'建設: 墓地',settlementId:`base-${i}`}],
       reinforcement:{status:'blocked',living:4,queued:0,target:6,remaining:2,reasons:['鉄不足']},
       citySpecializations:[],resourceExpansion:[]}}}}));
   window.setV39GameState({players:[p,...npcs]});window.openV39TestTools();
  });
  await page.locator('[data-test-tab=diagnostics]').click();
  const section=page.locator('[data-test-section=npc-ai]');if(!await section.evaluate(el=>el.open))await section.locator(':scope > summary').click();
  const before=await page.evaluate(()=>JSON.stringify(window.getV39GameState().players));
  assert.equal(await section.locator('summary [data-npc-diagnostic-select]').count(),1);
  assert.equal(await section.locator('[data-npc-diagnostic-select] option').count(),2);
  assert.equal(await section.locator('[data-npc-diagnostic-select] option').first().innerText(),'N1 / 悪魔');
  const compact=await section.locator('select, [data-npc-diagnostic-view]').evaluateAll(elements=>elements.every(el=>{
   const style=getComputedStyle(el);return style.paddingTop==='2px'&&style.paddingBottom==='2px'
    &&style.paddingLeft==='3px'&&style.paddingRight==='3px'&&style.minHeight==='0px';
  }));
  assert(compact,'diagnostic controls must use shared 2px/3px padding without fixed minimum height');
  for(const narrow of [320,390]){
   await page.setViewportSize({width:narrow,height:850});
   await page.evaluate(()=>{document.documentElement.style.setProperty('--font-body','18px');document.documentElement.style.setProperty('--font-secondary','18px');});
   const aligned=await section.locator('summary').evaluate(el=>{
    const label=el.querySelector('span').getBoundingClientRect(),select=el.querySelector('select').getBoundingClientRect(),summary=el.getBoundingClientRect();
    return Math.abs((label.top+label.bottom)/2-(select.top+select.bottom)/2)<2&&select.left>=label.right&&select.right<=summary.right+1;
   });
   assert(aligned,'faction selector wrapped below title');
  }
  await page.evaluate(()=>{document.documentElement.style.removeProperty('--font-body');document.documentElement.style.removeProperty('--font-secondary');});
  await page.setViewportSize({width,height:850});
  for(const faction of ['diagnostic-0','diagnostic-1']){
   await section.locator('[data-npc-diagnostic-select]').selectOption(faction);
   assert(await section.evaluate(el=>el.open),'selector collapsed diagnosis');
   for(const view of ['resources','population','construction','research','actions']){
    await section.locator(`[data-npc-diagnostic-view=${view}]`).click();
    assert.equal(await section.locator('[data-npc-diagnostic]').count(),1);
    assert.equal(await section.locator('[data-npc-diagnostic]').getAttribute('data-npc-diagnostic'),faction);
    assert.equal(await section.locator('[data-npc-diagnostic-content]').getAttribute('data-npc-diagnostic-content'),view);
    const content=await section.locator('[data-npc-diagnostic]').innerText();
    if(view==='resources'){
     assert.match(content,/現在の在庫/);assert.match(content,/AI判断時/);
     assert.match(content,new RegExp(faction==='diagnostic-0'?'123':'124'));
     assert.match(content,/0 \/ 50/);assert.equal(await section.locator('[data-npc-current-objective]').count(),0);
     assert.equal(await section.locator('[data-npc-stock-delta="木材"]').innerText(),'(+5)');
     assert.equal(await section.locator('[data-npc-stock-delta="肉"]').innerText(),'(-8.5)');
     assert.equal(await section.locator('[data-npc-stock-delta="鉄"]').innerText(),'(+0)');
     assert.equal(await section.locator('[data-npc-stock-delta="魚"]').innerText(),'(未集計)');
    }
    if(view==='population'){assert.match(content,/奴隷 12人/);assert.match(content,/エルフ/);}
    if(view==='construction'){assert.match(content,/学校/);assert.match(content,/残り2T/);assert.match(content,/墓地・農場/);}
    if(view==='actions'){assert.match(content,/現在の目標/);assert.match(content,/資源確保の分担/);assert.match(content,/鉄不足/);}
    await section.locator('[data-npc-diagnostic-view][aria-selected=true]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/web-game/npc-diagnostic-layout/${faction}-${view}-${width}.png`});
    const fits=await section.evaluate(el=>el.scrollWidth<=el.clientWidth+1);assert(fits,'diagnosis overflows narrow screen');
   }
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39GameState().players)),before,'viewing changed game state');
  await section.locator('[data-npc-diagnostic-view=actions]').press('Home');
  assert.equal(await section.locator('[data-npc-diagnostic-content]').getAttribute('data-npc-diagnostic-content'),'resources');
  await section.locator('[data-npc-diagnostic-view=resources]').press('ArrowRight');
  assert.equal(await section.locator('[data-npc-diagnostic-content]').getAttribute('data-npc-diagnostic-content'),'population');
  await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({players:s.players.map(p=>({...p,label:p.label+'更新'}))});});
  assert.equal(await section.locator('[data-npc-diagnostic-select]').inputValue(),'diagnostic-1');
  assert.equal(await section.locator('[data-npc-diagnostic-content]').getAttribute('data-npc-diagnostic-content'),'population');
  await page.locator('[data-test-tab=turns]').click();await page.locator('[data-test-tab=diagnostics]').click();
  assert.equal(await section.locator('[data-npc-diagnostic-select]').inputValue(),'diagnostic-1');
  await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({players:s.players.filter(p=>p.id!=='diagnostic-1')});});
  assert.equal(await section.locator('[data-npc-diagnostic-select]').inputValue(),'diagnostic-0');
  await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({players:s.players.filter(p=>p.isPlayer!==false)});});
  assert(await section.locator('[data-npc-diagnostic-select]').isDisabled());assert.match(await section.innerText(),/NPC勢力は登録されていません/);
  assert.deepEqual(errors,[]);console.log(width,'faction select, four views, stocks vs plan, keyboard, persistence, deletion, zero NPC and read-only passed');
  await page.close();
 }
}finally{await browser.close();}
