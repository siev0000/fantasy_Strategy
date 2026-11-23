const holdDelay = 500;
const movementTolerance = 10;
const holdTarget = [
  "#characterModal [data-v39-character-row]",
  "#characterModal [data-v39-squad-member]",
  "#characterModal [data-v39-character-equip-open]:not(:disabled)",
  "#detailEquipmentHeading[data-v39-equip-hold-unit]",
  "#detailEquipmentList[data-v39-equip-hold-unit]",
  "#detailEquipmentList [data-v39-equip-hold-slot]"
].join(",");

export function installV39EquipmentHold(openUnit, openSlot) {
  let press;
  let suppressClick = false;

  function cancel() {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
  }

  document.addEventListener("pointerdown", event => {
    if (!event.isPrimary) return;
    cancel();
    suppressClick = false;
    if (event.button !== 0) return;
    const target = event.target.closest?.(holdTarget);
    if (!target) return;
    const timer = setTimeout(() => {
      press = null;
      if (!target.isConnected || !target.getClientRects().length) return;
      const {v39CharacterRow, v39SquadMember, v39CharacterEquipOpen, v39EquipHoldSlot, v39EquipHoldUnit} = target.dataset;
      const slot = v39CharacterEquipOpen || v39EquipHoldSlot;
      suppressClick = slot ? openSlot(v39EquipHoldUnit, slot) : openUnit(v39CharacterRow || v39SquadMember || v39EquipHoldUnit);
    }, holdDelay);
    press = {id:event.pointerId, x:event.clientX, y:event.clientY, timer};
  }, true);
  document.addEventListener("pointermove", event => {
    if (press?.id === event.pointerId
      && Math.hypot(event.clientX - press.x, event.clientY - press.y) > movementTolerance) cancel();
  }, true);
  for (const type of ["pointerup","pointercancel","lostpointercapture"]) {
    document.addEventListener(type, event => {
      if (press?.id === event.pointerId) cancel();
    }, true);
  }
  document.addEventListener("scroll", cancel, true);
  window.addEventListener("blur", cancel);
  document.addEventListener("contextmenu", event => {
    if (event.target.closest?.(holdTarget)) event.preventDefault();
  }, true);
  document.addEventListener("click", event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
