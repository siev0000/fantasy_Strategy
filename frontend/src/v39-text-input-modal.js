const MODAL_ID = "v39-text-input-modal";
let activeResolve = null;
let activeCancelHandler = null;
let activeConfirmHandler = null;

function installStyles() {
  if (document.getElementById("v39-text-input-modal-style")) return;
  const style = document.createElement("style");
  style.id = "v39-text-input-modal-style";
  style.textContent = `
#${MODAL_ID}{
  position:fixed;
  inset:0;
  z-index:12000;
  display:none;
  align-items:flex-start;
  justify-content:center;
  padding:max(14px,calc(var(--safe-t,0px) + 8px)) max(10px,var(--safe-r,0px)) max(14px,var(--safe-b,0px)) max(10px,var(--safe-l,0px));
  background:rgba(1,5,8,.80);
  backdrop-filter:blur(3px);
}
#${MODAL_ID}.open{display:flex}
#${MODAL_ID} .v39-text-input-dialog{
  width:min(560px,100%);
  margin-top:min(10svh,72px);
  border:1px solid #4d5e65;
  border-radius:10px;
  background:linear-gradient(180deg,#142126,#0b1418);
  box-shadow:0 18px 50px rgba(0,0,0,.62);
  overflow:hidden;
}
#${MODAL_ID} .v39-text-input-head{
  display:flex;
  align-items:center;
  gap:8px;
  min-height:44px;
  padding:8px 10px;
  border-bottom:1px solid #34444a;
  background:#101b20;
}
#${MODAL_ID} .v39-text-input-head h2{
  margin:0;
  font-size:14px;
  color:#e8efec;
}
#${MODAL_ID} .v39-text-input-body{
  display:grid;
  gap:10px;
  padding:12px;
}
#${MODAL_ID} .v39-text-input-help{
  min-height:0;
  color:#92a2a6;
  font-size:10px;
  line-height:1.5;
}
#${MODAL_ID} input,
#${MODAL_ID} textarea{
  width:100%;
  min-height:44px;
  padding:10px 11px;
  border:1px solid #52646b;
  border-radius:8px;
  outline:none;
  background:#081115;
  color:#f2f6f5;
  font-size:16px;
  line-height:1.45;
  caret-color:#79d6e6;
}
#${MODAL_ID} textarea{
  min-height:112px;
  max-height:34dvh;
  resize:vertical;
}
#${MODAL_ID} input:focus,
#${MODAL_ID} textarea:focus{
  border-color:#79d6e6;
  box-shadow:0 0 0 2px rgba(121,214,230,.13);
}
#${MODAL_ID} .v39-text-input-actions{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}
#${MODAL_ID} .v39-text-input-actions button{
  min-height:42px;
  border:1px solid #4a5b62;
  border-radius:8px;
  background:#172429;
  color:#e8efec;
  font-weight:800;
  cursor:pointer;
}
#${MODAL_ID} .v39-text-input-actions [data-role="confirm"]{
  border-color:#5ca9b8;
  background:#174653;
}
@media(max-width:700px){
  #${MODAL_ID}{padding-left:max(6px,var(--safe-l,0px));padding-right:max(6px,var(--safe-r,0px))}
  #${MODAL_ID} .v39-text-input-dialog{margin-top:6px;border-radius:8px}
  #${MODAL_ID} .v39-text-input-body{padding:10px}
}
`;
  document.head.appendChild(style);
}

function ensureModal() {
  let modal = document.getElementById(MODAL_ID);
  if (modal instanceof HTMLElement) return modal;

  modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <section class="v39-text-input-dialog" aria-labelledby="v39-text-input-title">
      <header class="v39-text-input-head">
        <h2 id="v39-text-input-title">文字入力</h2>
      </header>
      <div class="v39-text-input-body">
        <div id="v39-text-input-help" class="v39-text-input-help" hidden></div>
        <div id="v39-text-input-field-wrap"></div>
        <div class="v39-text-input-actions">
          <button type="button" id="v39-text-input-cancel" data-role="cancel">キャンセル</button>
          <button type="button" id="v39-text-input-confirm" data-role="confirm">決定</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("pointerdown", event => {
    if (event.target === modal) closeTextInputModal(null, true);
  });
  modal.querySelector("#v39-text-input-cancel")?.addEventListener("click", () => closeTextInputModal(null, true));
  modal.querySelector("#v39-text-input-confirm")?.addEventListener("click", () => confirmTextInputModal());

  return modal;
}

function getField(modal = document.getElementById(MODAL_ID)) {
  return modal?.querySelector?.("#v39-text-input-field");
}

function finish(value, cancelled) {
  const resolve = activeResolve;
  const onCancel = activeCancelHandler;
  const onConfirm = activeConfirmHandler;
  activeResolve = null;
  activeCancelHandler = null;
  activeConfirmHandler = null;

  if (cancelled) {
    if (typeof onCancel === "function") onCancel();
    resolve?.(null);
  } else {
    if (typeof onConfirm === "function") onConfirm(value);
    resolve?.(value);
  }
}

function closeTextInputModal(value = null, cancelled = true) {
  const modal = document.getElementById(MODAL_ID);
  if (!(modal instanceof HTMLElement) || !modal.classList.contains("open")) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  finish(value, cancelled);
}

function confirmTextInputModal() {
  const field = getField();
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) return;
  const value = field.value;
  if (field.required && !value.trim()) {
    field.focus({ preventScroll:true });
    field.setCustomValidity("入力してください。");
    field.reportValidity();
    return;
  }
  field.setCustomValidity("");
  closeTextInputModal(value, false);
}

function openTextInputModal(options = {}) {
  installStyles();
  const modal = ensureModal();

  if (modal.classList.contains("open")) {
    closeTextInputModal(null, true);
  }

  const title = modal.querySelector("#v39-text-input-title");
  const help = modal.querySelector("#v39-text-input-help");
  const wrap = modal.querySelector("#v39-text-input-field-wrap");
  const cancel = modal.querySelector("#v39-text-input-cancel");
  const confirm = modal.querySelector("#v39-text-input-confirm");

  if (title) title.textContent = String(options.title || "文字入力");
  if (help) {
    const text = String(options.help || "").trim();
    help.textContent = text;
    help.hidden = !text;
  }
  if (cancel) cancel.textContent = String(options.cancelLabel || "キャンセル");
  if (confirm) confirm.textContent = String(options.confirmLabel || "決定");

  const multiline = options.multiline === true;
  const field = document.createElement(multiline ? "textarea" : "input");
  field.id = "v39-text-input-field";
  if (!multiline) field.type = String(options.type || "text");
  field.value = String(options.value ?? "");
  field.placeholder = String(options.placeholder || "");
  field.autocomplete = String(options.autocomplete || "off");
  field.enterKeyHint = String(options.enterKeyHint || (multiline ? "enter" : "done"));
  field.required = options.required === true;
  if (Number.isFinite(Number(options.maxLength)) && Number(options.maxLength) > 0) {
    field.maxLength = Math.floor(Number(options.maxLength));
  }
  if (Number.isFinite(Number(options.minLength)) && Number(options.minLength) >= 0) {
    field.minLength = Math.floor(Number(options.minLength));
  }

  wrap?.replaceChildren(field);

  activeCancelHandler = typeof options.onCancel === "function" ? options.onCancel : null;
  activeConfirmHandler = typeof options.onConfirm === "function" ? options.onConfirm : null;

  const promise = new Promise(resolve => {
    activeResolve = resolve;
  });

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");

  field.addEventListener("input", () => field.setCustomValidity(""));
  field.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTextInputModal(null, true);
      return;
    }
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      confirmTextInputModal();
      return;
    }
    if (multiline && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      confirmTextInputModal();
    }
  });

  window.setTimeout(() => {
    field.focus({ preventScroll:true });
    if (options.selectAll !== false && typeof field.select === "function") field.select();
  }, 30);

  return promise;
}

window.addEventListener("keydown", event => {
  if (event.key === "Escape" && document.getElementById(MODAL_ID)?.classList.contains("open")) {
    event.preventDefault();
    event.stopPropagation();
    closeTextInputModal(null, true);
  }
}, true);

installStyles();
window.openTextInputModal = openTextInputModal;
window.closeTextInputModal = () => closeTextInputModal(null, true);
window.confirmTextInputModal = confirmTextInputModal;
