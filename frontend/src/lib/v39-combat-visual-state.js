const heldHp = new Map();

export function holdV39CombatVisualHp(entries = []) {
  for (const entry of entries) {
    if (!entry?.targetId || !Number.isFinite(Number(entry.beforeHp)) || !Number.isFinite(Number(entry.afterHp))) continue;
    if (Number(entry.beforeHp) === Number(entry.afterHp)) continue;
    const id=String(entry.targetId);
    heldHp.set(id,[...(heldHp.get(id)||[]),entry]);
  }
}

export function releaseV39CombatVisualHp(entries = []) {
  for (const entry of entries) {
    const id=String(entry?.targetId ?? '');
    const queue=heldHp.get(id);
    if(!queue)continue;
    const remaining=queue.filter(row=>row!==entry);
    if(remaining.length)heldHp.set(id,remaining);
    else heldHp.delete(id);
  }
  window.dispatchEvent(new CustomEvent('v39:combat-visual-hp-released'));
}

export function visualV39CombatUnit(unit) {
  const hp=heldHp.get(String(unit?.id ?? ''))?.[0]?.beforeHp;
  return hp===undefined?unit:{...unit,hp,currentHp:hp,...(hp>0&&unit?.state==='死亡'?{state:'生存'}:{})};
}
