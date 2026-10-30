import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const port=33200+Math.floor(Math.random()*300),url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',NODE_ENV:'production',SOCKET_CORS_ORIGINS:url},stdio:['ignore','pipe','pipe']});
let output='';server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
const browser=await chromium.launch(),errors=[];
try{
 const deadline=Date.now()+10000;
 while(!output.includes('Fantasy Strategy server listening')){if(Date.now()>deadline)throw Error(output);await new Promise(r=>setTimeout(r,50));}
 const host=await browser.newPage({viewport:{width:1100,height:900}}),guest=await browser.newPage({viewport:{width:390,height:900}});
 for(const page of [host,guest]){page.on('pageerror',e=>errors.push(String(e)));await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.openV39MultiplayerLobby);await page.evaluate(()=>{window.closeV39PlayModeSelection();window.openV39MultiplayerLobby();});}
 await host.locator('[data-v39-room-player-name]').fill('host');
 await host.locator('[data-v39-room-name]').fill('detection test');
 await host.locator('[data-v39-room-action=create]').click();
 const room=host.locator('.v39-room-id');await room.waitFor();const roomId=await room.textContent();
 await host.locator('[data-v39-room-action=game-settings]').click();
 await host.locator('#v39-field-detection-bonus').fill('65');
 await host.locator('#v39-field-detection-bonus').press('Tab');
 await host.locator('#v39-field-damage-multiplier').fill('2');
 await host.locator('#v39-field-damage-multiplier').press('Tab');
 await host.locator('#v39-field-map-size').selectOption('36x36');
 await host.locator('#v39-field-generate').click();
 await host.waitForFunction(()=>window.getV39GameSettings().detectionScoutBonus===65);
 await guest.locator('[data-v39-room-tab=join]').click();
 await guest.locator('[data-v39-room-player-name]').fill('guest');
 await guest.locator('[data-v39-room-id]').fill(roomId);
 await guest.locator('[data-v39-room-action=join]').click();
 await guest.waitForFunction(()=>window.getV39DetectionSettingsAccess().multiplayer&&window.getV39GameSettings().detectionScoutBonus===65);
 await guest.waitForFunction(()=>window.getV39GameSettings().combatDamageMultiplier===2);
 for(const page of [host,guest]){
  await page.evaluate(()=>{window.closeV39MultiplayerLobby();window.activateV39FooterTab('manage');});
  await page.locator('.manage-tile[data-open=settings]').click();
 }
 const hostInput=host.locator('#v39-detection-scout-bonus'),guestInput=guest.locator('#v39-detection-scout-bonus');
 assert.equal(await hostInput.isDisabled(),false);assert.equal(await guestInput.isDisabled(),true);
 assert.equal(await guest.evaluate(()=>window.setV39DetectionScoutBonus(999)),false);
 assert.equal(await guest.locator('#v39-combat-damage-multiplier').isDisabled(),true);
 assert.equal(await guest.evaluate(()=>window.setV39CombatDamageMultiplier(9)),false);
 await host.locator('#v39-combat-damage-multiplier').fill('1.5');await host.locator('#v39-combat-damage-multiplier').press('Tab');
 for(const page of [host,guest])await page.waitForFunction(()=>window.getV39GameSettings().combatDamageMultiplier===1.5&&window.getV39GameSettings().detectionScoutBonus===65);
 await hostInput.fill('80');await hostInput.press('Tab');
 for(const page of [host,guest])await page.waitForFunction(()=>window.getV39GameSettings().detectionScoutBonus===80&&document.getElementById('v39-detection-scout-bonus').value==='80');
 await guest.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0).replace('"detectionScoutBonus":80','"detectionScoutBonus":0')));
 await guest.waitForFunction(()=>window.getV39GameSettings().detectionScoutBonus===80);
 await guest.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0).replace('"combatDamageMultiplier":1.5','"combatDamageMultiplier":3')));
 await guest.waitForFunction(()=>window.getV39GameSettings().combatDamageMultiplier===1.5&&window.getV39GameSettings().detectionScoutBonus===80);
 mkdirSync('output/web-game/detection-bonus',{recursive:true});
 await guest.screenshot({path:'output/web-game/detection-bonus/multiplayer-guest.png'});
 assert.deepEqual(errors,[]);
 console.log('Multiplayer browser: detection/damage host start settings, independent runtime updates, guest read-only, stale-save correction passed');
}finally{await browser.close();server.kill();}
