import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const output='output/web-game/summon-portraits';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch();
async function checkPortrait(card){
  assert.equal(await card.locator('.v39-card-portrait-image').count(),1);
  assert.equal(await card.locator('.squad-exp-ring').count(),0);
  assert.match(await card.locator('.v39-card-portrait-level').innerText(),/^\d+$/);
  assert(await card.locator('.v39-card-portrait-image').evaluate(async element=>{
    const source=getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if(!source)return false;
    const image=new Image();image.src=source;
    try{await image.decode();return image.naturalWidth>0;}catch{return false;}
  }),'portrait asset loads');
}
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39RitualTest(3);});
    const facility=page.locator('[data-summon-option="フレイムエレメンタル"]');
    await checkPortrait(facility);await facility.locator('.v39-card-portrait-image').click();
    assert(await facility.locator('.squad-card').evaluate(el=>el.classList.contains('selected')));
    const art=await facility.locator('.v39-card-portrait-image').getAttribute('data-v39-portrait-file');
    const frame=await facility.locator('.v39-card-portrait-image').getAttribute('data-v39-portrait-slot');
    await page.screenshot({path:`${output}/facility-${width}.png`});
    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.activateV39FooterTab('squad'));
    await page.locator('[data-v39-summon-open="expedition-test-king"]').click();
    const skill=page.locator('[data-summon-option="TEST_表召喚エレメンタル / フレイムエレメンタル"]');
    await checkPortrait(skill);
    assert.equal(await skill.locator('.v39-card-portrait-image').getAttribute('data-v39-portrait-file'),art);
    assert.equal(await skill.locator('.v39-card-portrait-image').getAttribute('data-v39-portrait-slot'),frame);
    await skill.click();await page.locator('[data-summon-tab="skills"]').click();
    await page.locator('[data-summon-tab="ability"]').click();await checkPortrait(skill);
    await page.screenshot({path:`${output}/skill-${width}.png`});
    await page.keyboard.press('Escape');
    await page.locator('[data-v39-call-open="expedition-test-king"]').click();
    const wolf=page.locator('[data-call-option="call-test-wolf"]');
    await checkPortrait(wolf);await wolf.locator('.v39-card-portrait-image').click();
    assert(await wolf.locator('.squad-card').evaluate(el=>el.classList.contains('selected')));
    await page.screenshot({path:`${output}/call-${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`${width}: facility/skill/call portraits, loaded assets, consistent frames, level badges and image selection passed`);
    await page.close();
  }
}finally{await browser.close();}
