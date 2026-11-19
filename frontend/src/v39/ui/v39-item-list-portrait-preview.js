const holdDelay = 500;
const movementTolerance = 10;
const candidateIcon = ".v39-item-list-screen-1 .list-pane [data-v39-item-list-action='candidate']";

function imageAt(target) {
  const icon = target?.closest?.(".v39-card-portrait, .squad-exp-ring");
  if (!icon?.closest(candidateIcon)) return null;
  const portrait = icon.querySelector(".v39-card-portrait-image");
  if (portrait?.style.backgroundImage) return portrait;
  return icon.querySelector("img.squad-race-icon");
}

export function installV39ItemListPortraitPreview(doc = document) {
  let press;
  let preview;
  let suppressClick = false;

  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
  }

  function openPreview(source) {
    if (!source.isConnected) return;
    const returnFocus = doc.activeElement;
    const dialog = doc.createElement("dialog");
    dialog.className = "v39-item-list-portrait-preview";
    dialog.setAttribute("aria-label", "候補画像の拡大表示");
    const artwork = doc.createElement(source.tagName === "IMG" ? "img" : "div");
    artwork.className = "v39-item-list-portrait-enlarged";
    if (source.tagName === "IMG") {
      artwork.src = source.currentSrc || source.src;
      artwork.alt = "";
      artwork.draggable = false;
    } else {
      artwork.style.backgroundImage = source.style.backgroundImage;
      artwork.style.backgroundSize = source.style.backgroundSize;
      artwork.style.backgroundPosition = source.style.backgroundPosition;
    }
    dialog.append(artwork);
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      preview = null;
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    }, {once:true});
    doc.body.append(dialog);
    dialog.showModal();
    preview = dialog;
    suppressClick = true;
  }

  doc.addEventListener("pointerdown", event => {
    cancelPress();
    suppressClick = false;
    if (preview || !event.isPrimary || event.button !== 0) return;
    const source = imageAt(event.target);
    if (!source) return;
    const timer = setTimeout(() => {
      press = null;
      openPreview(source);
    }, holdDelay);
    press = {id:event.pointerId,x:event.clientX,y:event.clientY,timer};
  }, true);
  doc.addEventListener("pointermove", event => {
    if (press?.id === event.pointerId
      && Math.hypot(event.clientX - press.x, event.clientY - press.y) > movementTolerance) cancelPress();
  }, true);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    doc.addEventListener(type, event => {
      if (press?.id === event.pointerId) cancelPress();
    }, true);
  }
  doc.addEventListener("scroll", cancelPress, true);
  doc.defaultView?.addEventListener("blur", cancelPress);
  doc.addEventListener("contextmenu", event => {
    if (imageAt(event.target)) event.preventDefault();
  }, true);
  doc.addEventListener("click", event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  doc.addEventListener("keydown", event => {
    if (!preview || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    preview.close();
  }, true);
}
