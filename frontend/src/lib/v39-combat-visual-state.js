export function createV39CombatVisualHp(onReleased) {
  const heldHp = new Map();

  function hold(entries = []) {
    for (const entry of entries) {
      if (!entry?.targetId || !Number.isFinite(Number(entry.beforeHp)) || !Number.isFinite(Number(entry.afterHp))) continue;
      if (Number(entry.beforeHp) === Number(entry.afterHp)) continue;
      const id=String(entry.targetId);
      const existing=heldHp.get(id)||[];
      if(!existing.includes(entry))heldHp.set(id,[...existing,entry]);
    }
  }

  function release(entries = []) {
    for (const entry of entries) {
      const id=String(entry?.targetId ?? '');
      const queue=heldHp.get(id);
      if(!queue)continue;
      const remaining=queue.filter(row=>row!==entry);
      if(remaining.length)heldHp.set(id,remaining);
      else heldHp.delete(id);
    }
    onReleased?.();
  }

  function visualUnit(unit) {
    const hp=heldHp.get(String(unit?.id ?? ''))?.[0]?.beforeHp;
    return hp===undefined?unit:{...unit,hp,currentHp:hp,...(hp>0&&unit?.state==='死亡'?{state:'生存'}:{})};
  }

  return {hold,release,visualUnit};
}

const fieldHp=createV39CombatVisualHp(notifyHpReleased);
let refreshDeferrals = 0;
let refreshPending = false;

function notifyHpReleased() {
  if (refreshDeferrals > 0) {
    refreshPending = true;
    return;
  }
  refreshPending = false;
  window.dispatchEvent(new CustomEvent('v39:combat-visual-hp-released'));
}

export function deferV39CombatVisualHpRefresh() {
  refreshDeferrals += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    refreshDeferrals -= 1;
    if (refreshDeferrals === 0 && refreshPending) notifyHpReleased();
  };
}

export const holdV39CombatVisualHp=fieldHp.hold;
export const releaseV39CombatVisualHp=fieldHp.release;
export const visualV39CombatUnit=fieldHp.visualUnit;
