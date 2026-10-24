import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/compact-unit-cards';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
async function inspect(card){
  return card.evaluate(el=>{
    const visible=selector=>getComputedStyle(el.querySelector(selector)).display!=='none';
    const rect=el.getBoundingClientRect();
    return {height:rect.height,track:el.querySelector('.v39-card-vital-track').getBoundingClientRect().height,
      level:visible('.v39-card-portrait-level,.squad-level-number'),
      label:visible('.v39-card-vital-label'),value:visible('.v39-card-vital-value'),position:visible('.squad-pos'),
      name:getComputedStyle(el.querySelector('.squad-name')).fontSize,
      overflow:el.scrollWidth>el.clientWidth+1};
  });
}
async function checkList(page,selector,screen){
  const cards=page.locator(selector);
  assert(await cards.count()>1);
  const first=cards.nth(0),second=cards.nth(1);
  await first.click();
  const expanded=await inspect(first),compact=await inspect(second);
  assert(expanded.label&&expanded.value&&expanded.position);
  assert(expanded.level&&compact.level,'level remains visible in selected and collapsed cards');
  assert(expanded.track>=15);
  assert.equal(compact.track,3);assert(!compact.label&&!compact.value&&!compact.position);
  assert(compact.height<expanded.height);
  assert(!compact.overflow&&!expanded.overflow);
  await second.click();
  assert.equal((await inspect(first)).track,3);
  assert((await inspect(first)).level,'deselecting must not hide the level');
  assert((await inspect(second)).value);
  const placement=await first.evaluate(card=>{
    const name=card.querySelector('.squad-name'),original=name.textContent;
    const measure=()=>{
      const box=card.getBoundingClientRect(),icon=card.querySelector('.v39-card-portrait,.squad-exp-ring').getBoundingClientRect();
      const bars=card.querySelector('.squad-bars').getBoundingClientRect(),label=name.getBoundingClientRect();
      return {height:box.height,iconHeight:icon.height,iconRight:icon.right-box.left,
        left:bars.left-box.left,bottom:box.bottom-bars.bottom,top:bars.top-box.top,nameBottom:label.bottom-box.top};
    };
    name.textContent='短名';const short=measure();
    name.textContent='二行になる長いユニットの名前';const long=measure();
    name.textContent=original;
    return {short,long};
  });
  assert.equal(placement.short.top,placement.long.top,'gauge position must not follow the name length');
  assert.equal(placement.short.height,placement.long.height,'name length must not change compact card height');
  assert(placement.long.left>placement.long.iconRight,'gauges must be beside the icon, not below it');
  assert(placement.long.bottom<=6,'gauges must be anchored to the card bottom');
  assert(placement.long.top>=placement.long.nameBottom,'two-line name must not overlap gauges');
  assert(placement.long.height<=placement.long.iconHeight+11,'icon should determine compact card height');
  const overflow=await cards.evaluateAll(cards=>cards.flatMap(card=>{
    const bounds=card.getBoundingClientRect();
    return [...card.querySelectorAll('.squad-card-top,.squad-bars,.v39-card-vital-track')].filter(node=>{
      const rect=node.getBoundingClientRect();return rect.top<bounds.top-1||rect.bottom>bounds.bottom+1;
    }).map(node=>({card:card.title,child:node.className}));
  }));
  assert.deepEqual(overflow,[],'card contents must stay inside their own row');
  const overlap=await cards.evaluateAll(cards=>cards.slice(1).some((card,index)=>card.getBoundingClientRect().top<cards[index].getBoundingClientRect().bottom-1));
  assert.equal(overlap,false,'adjacent card rows must not overlap');
  await page.screenshot({path:`${out}/${screen}.png`});
}
try{
  for(const [width,height] of [[320,900],[390,600],[390,900],[1100,900]]){
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();window.activateV39FooterTab('squad');await window.waitForV39MapRenderSettled();});
    await checkList(page,'#squadMemberList [data-v39-unit-id]',`squad-${width}`);
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator('[data-v39-character-tab="character"]').click();
    await checkList(page,'#characterModal [data-v39-character-row]',`units-${width}`);
    await page.locator('#characterModal [data-close]').click();
    await page.evaluate(()=>{window.startV39CallTest();window.activateV39FooterTab('squad');});
    await checkList(page,'#squadMemberList [data-v39-unit-id]',`many-units-${width}-${height}`);
    const last=page.locator('#squadMemberList [data-v39-unit-id]').last();
    await last.click();
    assert(await last.evaluate(el=>el.classList.contains('selected')),'last row remains reachable by scrolling');
    await page.evaluate(async()=>{await window.startV39RitualTest(3);});
    await checkList(page,'#v39-summon-modal [data-summon-card]',`summon-${width}`);
    assert.deepEqual(errors,[]);
    console.log(`${width}x${height}: shared cards collapse/expand; many-unit rows and contents stay separate; last row reachable`);
    await page.close();
  }
}finally{await browser.close();}
