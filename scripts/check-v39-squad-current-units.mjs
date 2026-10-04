import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1000,height:800}});
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3021",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.refreshV39SquadDerivedUI === "function");
  await page.evaluate(()=>{
    window.startV39LocalSession(2,{playMode:"single-test"});
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"squad-current-units");
    const state=window.getV39GameState();
    const sample=state.players[0].factionState.units[0];
    const units=[
      {...sample,id:"initial",name:"初期作成キャラ",squadId:"",level:7},
      {...sample,id:"new-army",name:"新規軍隊",squadId:"solo",level:3},
      {...sample,id:"custom-unit",name:"編成済みキャラ",squadId:"player-2-detachment-99"}
    ];
    window.setV39GameState({activePlayerId:state.players[0].id,players:state.players.map((player,index)=>({
      ...player,factionState:{...player.factionState,villagePlacementMode:false,
        units:index ? [{...sample,id:"other-player",name:"別プレイヤー",squadId:"solo"}] : units,
        selectedUnitId:index ? "other-player" : "initial",
        squads:index ? [] : [{id:"old-squad",label:"旧部隊",unitIds:["deleted-id"]},
          {id:"player-2-detachment-99",label:"現在の部隊",unitIds:["custom-unit"]}]
      }
    }))});
    window.activateV39FooterTab("squad");
    window.refreshV39SquadDerivedUI();
  });
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  assert.equal((await page.locator('#squadSelector [data-squad-select="solo"]').innerText()).replace(/\s/g,""),"単独2体");
  let list=await page.locator("#squadMemberList").innerText();
  assert.ok(list.includes("初期作成キャラ")&&list.includes("新規軍隊"));
  assert.ok(!list.includes("レオン"));
  assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().id),"initial");
  await page.screenshot({path:"output/web-game/v39-squad-current-units.png"});
  await page.locator('[data-squad-select="player-2-detachment-99"]').click();
  assert.ok((await page.locator("#squadMemberList").innerText()).includes("編成済みキャラ"));
  assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().id),"custom-unit");
  await page.evaluate(()=>{
    const state=window.getV39GameState();
    window.setV39GameState({activePlayerId:state.players[1].id});
    window.refreshV39SquadDerivedUI();
  });
  list=await page.locator("#squadMemberList").innerText();
  assert.ok(list.includes("別プレイヤー")&&!list.includes("初期作成キャラ"));
  assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().id),"other-player");
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({initialUnitsVisible:true,newUnitsVisible:true,exactSquadIds:true,playerSwitch:true,errors}));
} finally { await browser.close(); }
