function waitForManagePanel() {
  return new Promise(resolve => {
    const poll = () => {
      const panel = document.getElementById("footManage");
      if (panel instanceof HTMLElement) {
        resolve(panel);
        return;
      }
      window.setTimeout(poll, 30);
    };
    poll();
  });
}

function installFooterTabFallback() {
  const sections = {
    squad: "footSquad",
    battle: "footBattle",
    tile: "footTile",
    tileData: "footTileData",
    manage: "footManage"
  };

  const activate = tabKey => {
    const normalized = Object.prototype.hasOwnProperty.call(sections, tabKey) ? tabKey : "squad";
    document.querySelectorAll("[data-foot]").forEach(button => {
      button.classList.toggle("active", button.dataset.foot === normalized);
    });
    Object.entries(sections).forEach(([key, id]) => {
      const section = document.getElementById(id);
      if (!(section instanceof HTMLElement)) return;
      section.style.display = key === normalized ? "grid" : "none";
    });
  };

  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("[data-foot]") : null;
    if (!(button instanceof HTMLElement)) return;
    const tabKey = String(button.dataset.foot || "");
    if (!Object.prototype.hasOwnProperty.call(sections, tabKey)) return;
    event.preventDefault();
    event.stopPropagation();
    activate(tabKey);
  }, true);

  window.setTimeout(() => {
    const active = document.querySelector("[data-foot].active");
    activate(active?.dataset?.foot || "squad");
  }, 0);
}

function removeWrongEntry() {
  document.getElementById("v39-open-field-settings")?.remove();
  document.getElementById("v39-field-settings-placeholder")?.remove();
}

function createPlaceholderModal() {
  const overlay = document.createElement("div");
  overlay.id = "v39-field-settings-placeholder";
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "10000",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px",
    background: "rgba(1, 5, 8, 0.78)",
    backdropFilter: "blur(3px)"
  });

  const dialog = document.createElement("section");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "v39-field-settings-title");
  Object.assign(dialog.style, {
    width: "min(680px, 100%)",
    maxHeight: "min(760px, calc(100dvh - 28px))",
    overflow: "auto",
    border: "1px solid #45565d",
    borderRadius: "10px",
    background: "linear-gradient(180deg, rgba(20,31,36,.99), rgba(7,14,18,.99))",
    boxShadow: "0 20px 60px rgba(0,0,0,.55)",
    color: "#e8efec"
  });

  dialog.innerHTML = `
    <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #34444a;position:sticky;top:0;background:#111c21;z-index:1">
      <div>
        <div id="v39-field-settings-title" style="font-weight:800;font-size:16px">フィールド設定</div>
        <div style="margin-top:2px;font-size:11px;color:#92a2a6">カスタムフィールド生成（仮画面）</div>
      </div>
      <button type="button" id="v39-close-field-settings" style="border:1px solid #526269;border-radius:7px;background:#19262b;color:#e8efec;padding:7px 11px;cursor:pointer">閉じる</button>
    </header>
    <div style="padding:14px;display:grid;gap:12px">
      <div style="padding:12px;border:1px solid #34444a;border-radius:8px;background:rgba(255,255,255,.025)">
        <div style="font-size:13px;font-weight:700;margin-bottom:5px">現在は仮画面です</div>
        <div style="font-size:12px;line-height:1.7;color:#b8c5c8">ここへ以前の画面で使用していたフィールドカスタム設定を移植します。設定後に「生成」を押して初めてフィールドを作成する流れにします。</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">マップサイズ（未接続）</div>
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">島構成（未接続）</div>
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">山岳設定（未接続）</div>
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">河川設定（未接続）</div>
      </div>
      <button type="button" disabled style="width:100%;padding:11px;border:1px solid #45565d;border-radius:8px;background:#233137;color:#718085;font-weight:800">生成（未接続）</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  };
  const open = () => {
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
  };

  dialog.querySelector("#v39-close-field-settings")?.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay.style.display !== "none") close();
  });

  return { open, close };
}

async function bootFieldSettingsEntry() {
  installFooterTabFallback();
  const managePanel = await waitForManagePanel();
  removeWrongEntry();
  if (document.getElementById("v39-manage-field-settings")) return;

  const modal = createPlaceholderModal();

  const button = document.createElement("button");
  button.type = "button";
  button.id = "v39-manage-field-settings";
  button.className = "manage-tile";
  button.innerHTML = "<b>⬢</b><span>フィールド設定</span>";
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    modal.open();
  });

  managePanel.appendChild(button);
}

bootFieldSettingsEntry().catch(error => {
  console.error("[v39-field-settings-entry] boot failed", error);
});
