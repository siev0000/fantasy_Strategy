import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => (
    typeof window.startV39LocalSession === "function"
    && typeof window.addV39TestFaction === "function"
    && typeof window.runV39FactionAiTurn === "function"
    && typeof window.setV39GameState === "function"
  ));
  const report = await page.evaluate(async () => {
    window.closeV39PlayModeSelection();
    window.startV39LocalSession(1, { playMode:"single-test" });
    const session = window.getV39GameState();
    const sessionPlayer = session.players.find(player => player.isPlayer !== false);
    const sovereignId = sessionPlayer?.factionState?.units?.[0]?.id;
    if (!sessionPlayer || !sovereignId) throw new Error("初期編成ユニットがありません");
    window.setV39GameState({
      players:session.players.map(player => player.id !== sessionPlayer.id ? player : ({
        ...player,
        factionState:{
          ...player.factionState,
          units:player.factionState.units.map(unit => unit.id === sovereignId ? { ...unit, isSovereign:true } : unit)
        }
      }))
    }, { reason:"faction-ai-exploration-sovereign" });
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "faction-ai-exploration-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const human = window.getV39GameState().players.find(player => player.isPlayer !== false);
    const humanPlacement = window.autoPlaceV39InitialBases(human?.id);
    if (!humanPlacement?.ok) throw new Error(`プレイヤー初期配置に失敗: ${humanPlacement?.reason || "不明"}`);

    const added = window.addV39TestFaction("npc");
    if (!added?.ok) throw new Error(`NPC勢力追加に失敗: ${added?.reason || "不明"}`);
    const npcPlacement = window.autoPlaceV39InitialBases(added.player.id);
    if (!npcPlacement?.ok) throw new Error(`NPC初期配置に失敗: ${npcPlacement?.reason || "不明"}`);
    const source = window.getV39GameState();
    const initial = {...source,players:source.players.map(player=>player.id!==added.player.id?player:{...player,
      factionState:{...player.factionState,aiState:{...player.factionState.aiState,behaviorPatternId:'standard'}}})};
    const npc = initial.players.find(player => player.id === added.player.id);
    if (!npc?.factionState?.units?.length) throw new Error("NPC探索ユニットがありません");

    const first = window.runV39FactionAiTurn(initial, 1, window.__v39FieldRuntime?.mapData);
    const startedTasks = first.state.players.find(player => player.id === npc.id)?.factionState?.units
      ?.filter(unit => unit?.surveyTask) || [];
    if (startedTasks.length || first.reports[0]?.commands?.some(command => command.startsWith("調査:"))) {
      throw new Error("通常探索で隠れた資源の調査を開始してしまいます");
    }
    if (!first.reports[0]?.commands?.some(command => command.startsWith('探索移動:') && command.includes('→'))) throw new Error('通常探索が移動を優先しません');
    const fullySurveyed = structuredClone(initial);
    const map = window.__v39FieldRuntime.mapData;
    fullySurveyed.players.find(player=>player.id===npc.id).factionState.exploration.surveyedTileKeys = Array.from({length:map.w*map.h},(_,i)=>`${i%map.w},${Math.floor(i/map.w)}`);
    const covered = window.runV39FactionAiTurn(fullySurveyed, 1, map);
    const path = result => result.reports[0]?.commands?.find(command=>command.startsWith('探索移動:'));
    if (path(first) !== path(covered)) throw new Error('マスの調査済み情報で移動探索が変わります');

    window.setV39GameState({ players:first.state.players }, { reason:"faction-ai-exploration-check" });
    const surveyed = window.getV39GameState();
    surveyed.players = surveyed.players.map(player => player.id !== npc.id ? player : ({ ...player,
      factionState:{ ...player.factionState, units:player.factionState.units.map(unit => ({ ...unit, ap:unit.maxAp, currentAp:unit.maxAp, actionPoint:unit.maxAp })) }
    }));
    const beforeMove = surveyed.players.find(player => player.id === npc.id)?.factionState?.units || [];
    const positionsBefore = new Map(beforeMove.map(unit => [unit.id, `${unit.x},${unit.y}`]));
    const second = window.runV39FactionAiTurn(surveyed, 2, window.__v39FieldRuntime?.mapData);
    const afterMove = second.state.players.find(player => player.id === npc.id)?.factionState?.units || [];
    const moved = afterMove.some(unit => positionsBefore.get(unit.id) !== `${unit.x},${unit.y}`);
    const moveCommands = second.reports[0]?.commands?.filter(command => command.startsWith("探索移動:")) || [];
    if (!moved || !moveCommands.length) throw new Error(`NPCが未踏の視界へ向けて移動を継続しません: ${JSON.stringify({ first:first.reports[0]?.commands, second:second.reports[0]?.commands })}`);
    if (second.reports[0]?.commands?.some(command => command.startsWith('調査:')) || afterMove.some(unit => unit.surveyTask)) throw new Error('次ターンに探索と調査が混ざります');

    const movedUnit = afterMove.find(unit => positionsBefore.get(unit.id) !== `${unit.x},${unit.y}`);
    if (!(Number(movedUnit?.ap) < Number(movedUnit?.maxAp))) throw new Error("NPC移動で共通APが消費されません");
    const current = window.getV39GameState(), humanPlayer = current.players.find(player=>player.isPlayer!==false);
    const actor = humanPlayer.factionState.units.find(unit=>Number(unit.hp??unit.currentHp)>0);
    window.setV39GameState({activePlayerId:humanPlayer.id,timeline:{...current.timeline,phase:'player',activeTurnPlayerId:humanPlayer.id},
      players:current.players.map(player=>player.id!==humanPlayer.id?player:{...player,factionState:{...player.factionState,
        selectedUnitId:actor.id,exploration:{...player.factionState.exploration,surveyedTileKeys:[]},units:player.factionState.units.map(unit=>unit.id!==actor.id?unit:{...unit,ap:100,currentAp:100,actionPoint:100,surveyTask:null,waitTurnNumber:null})}})});
    const explicit = window.startV39Survey({x:actor.x,y:actor.y});
    if(!explicit?.ok) throw new Error(`独立した調査コマンドが実行できません: ${explicit?.reason}`);
    document.getElementById("playModeSelectModal")?.classList.remove("open");
    return { firstCommands:first.reports[0].commands, secondCommands:second.reports[0].commands, movedUnit:{ id:movedUnit.id, ap:movedUnit.ap, maxAp:movedUnit.maxAp },explicitSurvey:explicit.ok };
  });
  await page.screenshot({ path:"output/web-game/v39-faction-ai-exploration.png", fullPage:false });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
