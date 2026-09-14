let toastTimer = 0;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function showMessage(message) {
  window.showV39TurnBanner?.(message);
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

export function waitV39SelectedUnit() {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => row.id === state.activePlayerId);
  const faction = player?.factionState;
  const unit = faction?.units?.find(row => text(row?.id) === text(faction?.selectedUnitId));
  if (!state || !player || !unit) {
    showMessage("待機するキャラクターを選択してください");
    return { ok:false, reason:"unit-not-selected" };
  }
  if (text(unit?.state) === "死亡" || number(unit?.hp, unit?.currentHp) <= 0) {
    showMessage("死亡したキャラクターは待機できません");
    return { ok:false, reason:"unit-dead" };
  }
  const apCost = Math.max(0, number(unit?.ap, unit?.currentAp));
  window.cancelV39SelectedUnitMove?.("wait-command");
  window.cancelV39SelectedUnitAttack?.("wait-command");
  const players = state.players.map(row => row.id !== player.id ? row : ({
    ...row,
    factionState:{
      ...row.factionState,
      units:row.factionState.units.map(member => member.id !== unit.id ? member : ({
        ...member,
        ap:0,
        currentAp:0,
        actionPoint:0,
        lastAction:"待機"
      }))
    }
  }));
  window.setV39GameState?.({ players }, { reason:"unit-wait" });
  const summary = `${text(unit.name) || "キャラクター"}：待機 / AP-${apCost}`;
  window.dispatchEvent(new CustomEvent("v39:combat-log", {
    detail:{ summary, attackerId:text(unit.id), skillName:"待機", apCost, entries:[] }
  }));
  showMessage(summary);
  return { ok:true, unitId:text(unit.id), apCost };
}

function install() {
  const button = document.getElementById("mobileBattleWait");
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
  window.waitV39SelectedUnit = waitV39SelectedUnit;
}

install();
