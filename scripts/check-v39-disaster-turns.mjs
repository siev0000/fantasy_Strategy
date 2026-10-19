import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/disasters';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  const initial=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);
    const result=window.startV39DisasterTest();await window.waitForV39MapRenderSettled();
    window.activateV39FooterTab('squad');
    return {result,build:document.querySelector('#uiBuildLabel')?.textContent,hp:window.getV39ActiveFactionState().units[0].hp};
  });
  assert(initial.result.ok);
  await page.waitForFunction(()=>!window.isV39MapInputLocked());
  const turns=await page.evaluate(async()=>{
    const results=[];
    for(let i=0;i<2;i++){
      const ok=await window.advanceV39Turn({skipUnactedFocus:true}),state=window.getV39GameState();
      results.push({ok,turn:state.timeline.turnNumber,events:state.worldEnvironment.activeDisasters.map(e=>e.name),
        hp:window.getV39ActiveFactionState().units[0].hp});
    }
    return results;
  });
  assert(turns.every(t=>t.ok));assert(turns[0].events.includes('山火事'));
  assert(!turns[1].events.includes('山火事'));assert(turns[1].events.includes('干ばつ'));
  // Recovery runs at turn end; compare damage-then-recovery with recovery-only.
  assert(turns[0].hp<initial.hp);assert(turns[1].hp>turns[0].hp);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/native-turns-390.png`});
  writeFileSync(`${out}/native-turns.json`,JSON.stringify({initial,turns},null,2));
  console.log('Native terrain/world/economy/recovery turn stages preserve disasters through their configured expiry');
}finally{await browser.close();}
