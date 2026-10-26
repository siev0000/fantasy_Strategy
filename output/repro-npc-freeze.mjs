import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {mkdir} from 'node:fs/promises';
await mkdir('output/web-game/npc-freeze',{recursive:true});
const b=await chromium.launch({headless:true});
try{const p=await b.newPage();p.on('pageerror',e=>console.log('PAGEERROR',e.stack));p.on('console',m=>{if(m.type()==='error'||m.text().startsWith('TRACE'))console.log(m.type(),m.text());});
await p.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
await p.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.__v39PendingInitialSovereignProfile={playerId:'player-1',race:'只人',className:'ファイター',characterName:'検証',villageName:'検証'};window.startV39LocalSession(1,{playMode:'single-test',gameSettings:{npcFactionCount:2}});window.consumeV39PendingInitialSovereignProfile();window.generateFieldFromSettings({w:100,h:100,patternId:'realistic',neutralVillageCount:8,enemySpawnTileDivisor:30});console.log('TRACE placement '+JSON.stringify(window.autoPlaceV39InitialBases('player-1')));});
await p.evaluate(()=>{window.dispatchEvent(new CustomEvent('v39:initial-placement-complete',{detail:{mapData:window.__v39FieldRuntime.mapData}}));window.spawnV39Enemies();return window.waitForV39MapRenderSettled();});
console.log('setup',await p.evaluate(()=>{const s=window.getV39GameState();return {enemies:s.enemies.length,villages:s.neutralVillages.length,players:s.players.length};}));
for(let iteration=0;iteration<10;iteration++){console.log('ITERATION',iteration);await p.evaluate(()=>{for(const stage of ['terrain','ai','exploration','world','economy','research','diplomacy'])window.addEventListener('v39:turn-stage-'+stage,()=>console.log('TRACE stage '+stage+' '+performance.now()));const orig=window.runV39EnemyTurn;window.runV39EnemyTurn=async(...args)=>{console.log('TRACE enemy start '+performance.now());const r=await orig(...args);console.log('TRACE enemy end '+performance.now());return r;};window.__freezeDone=false;window.advanceV39Turn({skipUnactedFocus:true}).then(r=>{window.__freezeDone=true;console.log('TRACE done '+r);}).catch(e=>{window.__freezeDone=true;console.error(e.stack);});});
await p.waitForFunction(()=>window.__freezeDone,{timeout:180000});
}console.log('final',await p.evaluate(()=>({turn:window.getV39GameState().timeline,perf:window.getV39LastEnemyAiPerformance?.()})));
await p.screenshot({path:'output/web-game/npc-freeze/full-turn.png'});
}finally{await b.close();}