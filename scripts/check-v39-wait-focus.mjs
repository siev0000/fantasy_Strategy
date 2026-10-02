import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280,height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.advanceV39Turn === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    window.generateV39TestFieldWithSeed({ w:36,h:36,patternId:"realistic" }, "wait-focus-check");
    await new Promise(resolve => setTimeout(resolve,100));
    const initial = window.getV39GameState();
    const player = initial.players.find(row => row.id === initial.activePlayerId);
    const source = player.factionState.units[0];
    const ids = [source.id,"focus-second"];
    const units = ids.map((id,index) => ({ ...source,id,name:index ? "確認対象2" : "確認対象1",x:5+index*6,y:5,
      hp:100,currentHp:100,maxHp:100,ap:100,currentAp:100,actionPoint:100,maxAp:100,waitTurnNumber:0,lastActionTurn:0 }));
    units.push({ ...units[0],id:"dead",hp:0,currentHp:0,state:"死亡" });
    window.setV39GameState({ players:initial.players.map(row => row.id !== player.id ? row : ({ ...row,
      factionState:{ ...row.factionState,units,selectedUnitId:ids[1],settlements:[],village:null,
        squads:[{ id:"solo",label:"単独",unitIds:ids }],exploration:{discoveredFeaturesByTile:{},surveyedTileKeys:[],history:[]}}
    })),settlements:[],enemies:[],neutralVillages:[],enemyNests:[] });
    const getFaction = () => window.getV39GameState().players.find(row => row.id === player.id).factionState;
    const firstEnd = await window.advanceV39Turn();
    const firstFocus = getFaction().selectedUnitId;
    const firstTurn = window.getV39GameState().timeline.turnNumber;
    const wait = window.waitV39SelectedUnit();
    const firstWaiting = getFaction().units.find(unit => unit.id === ids[0]);
    const blockedAttack = window.startV39SelectedUnitAttack();
    const blockedMove = window.startV39SelectedUnitMove();
    const blockedSurvey = window.startV39Survey({x:5,y:5});
    const secondEnd = await window.advanceV39Turn();
    const secondFocus = getFaction().selectedUnitId;
    window.waitV39SelectedUnit();
    const completed = await window.advanceV39Turn();
    const nextTurn = window.getV39GameState().timeline.turnNumber;
    const waitingCleared = getFaction().units.filter(unit => ids.includes(unit.id)).every(unit => unit.waitTurnNumber === 0);
    const nextEnd = await window.advanceV39Turn();
    const nextFocus = getFaction().selectedUnitId;
    return { ids, firstEnd,firstFocus,firstTurn,waitCost:wait.apCost,waitAp:firstWaiting.ap,waitFlag:firstWaiting.waitTurnNumber,
      blockedAttack,blockedMove,blockedSurvey:blockedSurvey.ok,secondEnd,secondFocus,completed,nextTurn,waitingCleared,nextEnd,nextFocus };
  });
  assert.equal(report.firstEnd,false);
  assert.equal(report.firstFocus,report.ids[0]);
  assert.equal(report.firstTurn,1);
  assert.equal(report.waitCost,0);
  assert.equal(report.waitAp,100);
  assert.equal(report.waitFlag,1);
  assert.equal(report.blockedAttack,false);
  assert.equal(report.blockedMove,false);
  assert.equal(report.blockedSurvey,false);
  assert.equal(report.secondEnd,false);
  assert.equal(report.secondFocus,report.ids[1]);
  assert.equal(report.completed,true);
  assert.equal(report.nextTurn,2);
  assert.equal(report.waitingCleared,true);
  assert.equal(report.nextEnd,false);
  assert.equal(report.nextFocus,report.ids[0]);
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.evaluate(() => window.activateV39FooterTab("manage"));
  await page.locator("#v39-manage-display-settings").click();
  await page.locator("#v39-focus-unacted-units").uncheck();
  const off = await page.evaluate(async () => ({ result:await window.advanceV39Turn(),turn:window.getV39GameState().timeline.turnNumber,
    saved:JSON.parse(localStorage.getItem("v39-display-settings-v1")).focusUnactedUnits }));
  assert.equal(off.result,true);
  assert.equal(off.turn,3);
  assert.equal(off.saved,false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({report,off,errors},null,2));
  await page.screenshot({path:"output/web-game/v39-wait-focus.png"});
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.evaluate(() => window.getV39DisplaySettings().focusUnactedUnits),false);
} finally { await browser.close(); }
