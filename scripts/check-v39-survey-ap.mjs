import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:900, height:760 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.startV39Survey === "function");
  const report = await page.evaluate(async () => {
    const pause = () => new Promise(resolve => setTimeout(resolve,100));
    window.startV39LocalSession(1, { playMode:"single-test" });
    window.generateV39TestFieldWithSeed({ w:36,h:36,patternId:"realistic" }, "survey-ap-check");
    await pause();
    const initial = window.getV39GameState();
    const player = initial.players.find(row => row.id === initial.activePlayerId);
    const unitId = player.factionState.units[0].id;
    window.setV39GameState({ players:initial.players.map(row => row.id !== player.id ? row : ({ ...row,
      factionState:{ ...row.factionState, selectedUnitId:unitId,
        units:row.factionState.units.map(unit => unit.id !== unitId ? unit : ({ ...unit,x:5,y:5,hp:100,currentHp:100,state:"生存",ap:40,currentAp:40,actionPoint:40 })),
        exploration:{ discoveredFeaturesByTile:{},surveyedTileKeys:[],history:[],lastProcessedTurn:0 }
      }
    })), enemies:[], enemyNests:[], neutralVillages:[] });
    const getPlayer = () => window.getV39GameState().players.find(row => row.id === player.id);
    const getUnit = () => getPlayer().factionState.units.find(unit => unit.id === unitId);
    const button = document.getElementById("mobileBattleSurvey");
    window.dispatchEvent(new CustomEvent("v39:tile-selected",{ detail:{ x:8,y:8 } }));
    const landHasSurveyButton = [...document.querySelectorAll("#footTile button")].some(button => !button.hidden && button.textContent.includes("調査"));
    button.click();
    const first = structuredClone(getUnit());
    const blocked = window.startV39Survey({ x:5,y:5 });
    window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:2 } }));
    const partial = { task:getUnit().surveyTask, surveyed:getPlayer().factionState.exploration.surveyedTileKeys.includes("5,5") };
    const current = window.getV39GameState();
    window.setV39GameState({ players:current.players.map(row => row.id !== player.id ? row : ({ ...row,
      factionState:{ ...row.factionState,units:row.factionState.units.map(unit => unit.id !== unitId ? unit : ({ ...unit,ap:70,currentAp:70,actionPoint:70 })) }
    })) });
    button.click();
    const continued = structuredClone(getUnit());
    window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:3 } }));
    const complete = { task:getUnit().surveyTask || null, surveyed:getPlayer().factionState.exploration.surveyedTileKeys.includes("5,5"), ap:getUnit().ap };
    const final = window.getV39GameState();
    window.setV39GameState({ players:final.players.map(row => row.id !== player.id ? row : ({ ...row,
      factionState:{ ...row.factionState, units:row.factionState.units.map(unit => unit.id !== unitId ? unit : ({ ...unit,x:6,y:5,ap:100,currentAp:100 })) }
    })) });
    button.click();
    const full = structuredClone(getUnit());
    return { landHasSurveyButton, first:{ ap:first.ap,currentAp:first.currentAp,actionPoint:first.actionPoint,task:first.surveyTask },
      blocked:blocked.ok,partial,continued:{ ap:continued.ap,task:continued.surveyTask },complete,full:{ap:full.ap,task:full.surveyTask},buttonText:button.textContent };
  });
  assert.equal(report.landHasSurveyButton,false);
  assert.equal(report.first.ap,0);
  assert.equal(report.first.currentAp,0);
  assert.equal(report.first.actionPoint,0);
  assert.equal(report.first.task.key,"5,5");
  assert.equal(report.first.task.progressPercent,40);
  assert.equal(report.blocked,false);
  assert.equal(report.partial.surveyed,false);
  assert.equal(report.partial.task.progressAp,40);
  assert.equal(report.continued.ap,0);
  assert.equal(report.continued.task.progressPercent,100);
  assert.equal(report.complete.task,null);
  assert.equal(report.complete.surveyed,true);
  assert.equal(report.full.ap,0);
  assert.equal(report.full.task.progressPercent,100);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(report,null,2));
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.evaluate(() => document.querySelector('[data-squad-detail-tab="action"]')?.click());
  await page.screenshot({ path:"output/web-game/v39-survey-ap.png" });
} finally { await browser.close(); }
