import { showV39Feedback } from "../ui/v39-feedback.js";
import { isV39UnitInWorld } from "../../lib/v39-cave-spatial-rules.js";
import {isV39UnitRecoveryWaiting,normalizeV39RecoveryWaitPercent} from '../../lib/v39-recovery-wait.js';

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function showMessage(message) {
  showV39Feedback(message, { banner:true });
}

export function waitV39SelectedUnit(options = {}) {
  if(window.isV39MapInputLocked?.())return {ok:false,reason:"input-locked"};
  const state = window.getV39GameState?.({includeWorlds:false});
  const player = state?.players?.find(row => row.id === state.activePlayerId);
  const faction = player?.factionState;
  const unit = faction?.units?.find(row => text(row?.id) === text(faction?.selectedUnitId));
  if (!state || !player || !unit) {
    showMessage("待機するキャラクターを選択してください");
    return { ok:false, reason:"unit-not-selected" };
  }
  if(state.timeline.phase!=="player")return {ok:false,reason:"not-player-turn"};
  if (text(unit?.state) === "死亡" || number(unit?.hp, unit?.currentHp) <= 0) {
    showMessage("死亡したキャラクターは待機できません");
    return { ok:false, reason:"unit-dead" };
  }
  if(!isV39UnitInWorld(unit,state.activeWorldId)){
    showMessage("このキャラクターは別のマップにいます");return {ok:false,reason:"unit-other-world"};
  }
  const recovery = options.recovery === true, cancel = options.cancelRecovery === true;
  if(cancel && !(Number(unit.recoveryWaitTargetPercent)>0))return {ok:false,reason:'not-recovery-waiting'};
  const target = normalizeV39RecoveryWaitPercent(state.gameSettings?.recoveryWaitHpPercent);
  if (recovery && !isV39UnitRecoveryWaiting({...unit,recoveryWaitTargetPercent:target})) {
    showMessage(`HPは目標の${target}%以上です`);return {ok:false,reason:'recovery-target-reached'};
  }
  const instructor = [faction.recruitInstructorByTile,faction.recruitInstructorTransfers]
    .some(rows=>Object.values(rows||{}).some(row=>row?.unitId===unit.id));
  if (recovery && (unit.transportAssignment?.enabled || unit.tradeAssignment?.automatic || unit.caveDuty || instructor || unit.surveyTask)) {
    showMessage('自動任務・調査を解除してから回復待機してください');return {ok:false,reason:'automatic-duty'};
  }
  const apCost = 0;
  const turnNumber = Math.max(1, number(state.timeline?.turnNumber, 1));
  window.cancelV39SelectedUnitMove?.("wait-command");
  window.cancelV39SelectedUnitAttack?.("wait-command");
  const players = state.players.map(row => row.id !== player.id ? row : ({
    ...row,
    factionState:{
      ...row.factionState,
      units:row.factionState.units.map(member => member.id !== unit.id ? member : ({
        ...member,
        recoveryWaitTargetPercent:recovery?target:0,
        waitTurnNumber:cancel?0:turnNumber,
        lastActionTurn:cancel?0:turnNumber,
        lastAction:cancel?'回復待機解除':recovery?'回復待機':"待機"
      }))
    }
  }));
  window.setV39GameState?.({ players }, { reason:"unit-wait" });
  const summary = `${text(unit.name) || "キャラクター"}：${cancel?'回復待機を解除':recovery?`HP${target}%まで回復待機`:'待機 / このターンの行動終了（AP保持）'}`;
  window.dispatchEvent(new CustomEvent("v39:combat-log", {
    detail:{ summary, attackerId:text(unit.id), skillName:"待機", combatActivity:false, apCost, entries:[] }
  }));
  showMessage(summary);
  return { ok:true, unitId:text(unit.id), apCost };
}

function updateRecoveryWaitControl() {
  const faction=window.getV39ActiveFactionState?.();
  const unit=faction?.units?.find(unit=>unit.id===faction.selectedUnitId);
  const active=Number(unit?.recoveryWaitTargetPercent)>0;
  const target=normalizeV39RecoveryWaitPercent(window.getV39GameSettings?.()?.recoveryWaitHpPercent);
  const label=document.getElementById('mobileRecoveryWaitTarget');
  if(label)label.textContent=active?`HP${unit.recoveryWaitTargetPercent}%まで待機中`:`HP${target}%まで`;
  const button=document.getElementById('mobileBattleRecoveryWaitUse');
  if(button){
    button.textContent=active?'解除':'開始';
    button.disabled=!unit||number(unit.hp??unit.currentHp)<=0||(!active&&!isV39UnitRecoveryWaiting({...unit,recoveryWaitTargetPercent:target}));
  }
}

function install() {
  const button = document.getElementById("mobileBattleWaitUse");
  if (!(button instanceof HTMLButtonElement)) {
    window.setTimeout(install, 50);
    return;
  }
  if (button.dataset.v39WaitBound === "1") return;
  button.dataset.v39WaitBound = "1";
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    waitV39SelectedUnit();
  }, true);
  document.getElementById('mobileBattleRecoveryWaitUse')?.addEventListener('click',event=>{
    event.preventDefault();event.stopImmediatePropagation();
    const faction=window.getV39ActiveFactionState?.();
    const unit=faction?.units?.find(unit=>unit.id===faction.selectedUnitId);
    waitV39SelectedUnit(Number(unit?.recoveryWaitTargetPercent)>0?{cancelRecovery:true}:{recovery:true});
    updateRecoveryWaitControl();
  },true);
  window.addEventListener('v39:squad-detail-rendered',updateRecoveryWaitControl);
  updateRecoveryWaitControl();
  window.waitV39SelectedUnit = waitV39SelectedUnit;
}

install();
