import { V39_TEST_GAME_STATE, V39_TEST_OPERATION_DATA } from "./v39-test-data.js";

(function initializeOperationUi() {
  "use strict";

  const data = Object.freeze({
    tabs: [
      { key: "squad", label: "部隊", icon: "👥" },
      { key: "tile", label: "土地", icon: "⬢" },
      { key: "settlement", label: "拠点", icon: "⌂" },
      { key: "manage", label: "管理", icon: "☰" }
    ],
    landItems: V39_TEST_OPERATION_DATA.landItems,
    actionButtons: [
      { label: "移動", className: "move", id: "mobileBattleMove" },
      { label: "攻撃", className: "attack", id: "mobileBattleAttack" },
      { label: "待機", className: "", id: "mobileBattleWait" }
    ],
    manageItems: [
      { icon: "⚒", label: "装備", open: "equipment" },
      { icon: "⇄", labelHtml: '資源表示: <em id="resourceModeLabel">詳細</em>', id: "resourceModeToggle", title: "資源表示を詳細/簡易で切替", tip: "資源表示切替" },
      { icon: "☷", label: "ログ", open: "rulerLog" },
      { icon: "旗", label: "国家・外交", id: "v39-manage-nation" },
      { icon: "⚙", label: "ゲーム設定", open: "settings" },
      { icon: "目", label: "表示設定", id: "v39-manage-display-settings" },
      { icon: "試", label: "テスト操作", id: "v39-manage-test-tools" },
      { icon: "⬢", label: "フィールド設定", id: "v39-manage-field-settings" },
      { icon: "書", label: "設計書", id: "v39-manage-design-docs" }
    ]
  });

  const attributes = item => [
    item.id ? `id="${item.id}"` : "",
    item.open ? `data-open="${item.open}"` : "",
    item.title ? `title="${item.title}"` : "",
    item.tip ? `data-tip="${item.tip}"` : ""
    ].filter(Boolean).join(" ");

  function installOperationStyles() {
    if (document.getElementById("v39-operation-ui-style")) return;
    const style = document.createElement("style");
    style.id = "v39-operation-ui-style";
    style.textContent = `
      #footSquad .v39-squad-toolbar{display:flex;align-items:center;gap:6px;min-width:0;overflow:visible}
      #footSquad .v39-squad-shortcuts{display:flex;gap:5px;flex:0 0 auto;overflow:visible}
      .v39-footer-shortcut{min-height:30px;border:1px solid #4d747d;border-radius:7px;background:#173039;color:#e7f2f0;padding:4px 8px;font:inherit;font-size:12px;font-weight:800;white-space:nowrap;cursor:pointer}
      .v39-footer-shortcut:hover{background:#1d424b;border-color:#77d8e7}
      .v39-footer-shortcut:focus-visible{outline:2px solid #9de4ef;outline-offset:1px}
      .v39-footer-icon-shortcut{position:relative;width:32px;min-width:32px;height:30px;padding:0;font-size:17px;line-height:1}
      .v39-footer-icon-shortcut::after{content:attr(data-tooltip);position:absolute;z-index:80;top:calc(100% + 6px);left:0;min-width:max-content;padding:5px 7px;border:1px solid #70bcc8;border-radius:5px;background:#0a171b;color:#efffff;font-size:12px;font-weight:800;line-height:1.1;pointer-events:none;opacity:0;transform:translateY(-2px);transition:opacity .12s ease,transform .12s ease}
      .v39-footer-icon-shortcut:hover::after,.v39-footer-icon-shortcut:focus-visible::after,.v39-footer-icon-shortcut:active::after{opacity:1;transform:translateY(0)}
      #footSquad .squad-selector{flex:1;min-width:0}
      .squad-content-split{
        grid-template-columns:minmax(0,2fr) minmax(0,3fr)!important;
        gap:0!important
      }
      #footSquad .squad-list-pane{
        gap:2px!important;padding:0!important
      }
      #footSquad .squad-detail-pane{
        padding:4px 2px 4px 4px!important
      }
      #footSquad .squad-detail-pane>*+*{margin-top:2px!important}
      #footSquad .squad-detail-minihead{gap:2px!important}
      #footSquad .squad-detail-chip{min-height:20px!important;padding:2px 5px!important}
      #footSquad .squad-detail-section{gap:0!important}
      #footSquad .squad-detail-collapsible{display:block!important;min-width:0}
      #footSquad .squad-detail-toggle{
        list-style:none;display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;
      }
      #footSquad .squad-detail-toggle::-webkit-details-marker{display:none}
      #footSquad .squad-detail-toggle::before{
        content:"▷";display:inline-block;flex:0 0 auto;width:12px;color:#85d7e4;font-size:10px;line-height:1
      }
      #footSquad .squad-detail-collapsible[open]>.squad-detail-toggle::before{content:"▽"}
      #footSquad .squad-detail-section-body{min-width:0;margin-top:1px}
      #footSquad .squad-detail-stats{gap:2px!important}
      #footSquad .detail-stat{min-height:42px!important;padding:4px 3px!important;gap:1px!important}
      #footSquad .proficiency-grid{gap:2px!important}
      #footSquad .proficiency-item{min-height:30px!important;padding:3px 4px!important;gap:2px!important}
      #footSquad .technique-list{gap:2px!important}
      #footSquad #footAction.mobile-battle-panel{
        display:grid!important;grid-template-rows:auto!important;gap:0!important;
        height:auto!important;min-height:0!important;margin:0 0 2px!important
      }
      #footSquad #footAction .battle-primary-actions{
        display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:2px!important
      }
      #footSquad #footAction .battle-main{
        min-width:0;min-height:34px;border:1px solid #45565d;border-radius:7px;background:#172329;
        color:#e8efec;font:inherit;font-size:11px;font-weight:800
      }
      #footSquad #footAction .battle-main.move{border-color:#579ec3}
      #footSquad #footAction .battle-main.attack{border-color:#a65f50}
      #footSquad #footAction .battle-main.active{background:#34251f}
      #footSquad .technique-card.technique-select-card{
        width:100%!important;min-width:0!important;display:block!important;appearance:none;-webkit-appearance:none;
        padding:0!important;border:1px solid #46565d!important;border-radius:8px!important;
        background:linear-gradient(180deg,#162126,#10181c)!important;color:inherit!important;
        font:inherit!important;text-align:left!important;cursor:pointer!important;overflow:hidden!important
      }
      #footSquad .technique-summary{
        display:grid!important;grid-template-columns:28px minmax(0,1fr) auto!important;
        grid-template-areas:"icon name ap" "icon power range"!important;
        align-items:center!important;gap:1px 4px!important;padding:4px 5px!important
      }
      #footSquad .technique-icon{
        grid-area:icon!important;width:28px!important;height:28px!important;display:grid!important;place-items:center!important;
        border:1px solid #40545a!important;border-radius:7px!important;background:#1b2a30!important;
        font-size:16px!important;line-height:1!important;overflow:hidden!important
      }
      #footSquad .technique-icon-image{
        width:20px!important;height:20px!important;display:block!important;object-fit:contain!important;
        filter:drop-shadow(0 1px 1px rgba(0,0,0,.55))
      }
      #footSquad .technique-icon-glyph{display:block!important;font-size:14px!important;line-height:1!important;color:#d5e0df!important}
      #footSquad .technique-icon.technique-icon-power{
        border-color:#d27245!important;
        background:linear-gradient(135deg,#8f2f24 0%,#d86d2d 100%)!important
      }
      #footSquad .technique-icon.technique-icon-guard{
        border-color:#5b9fd2!important;
        background:linear-gradient(135deg,#17476d 0%,#2388bd 100%)!important
      }
      #footSquad .technique-icon.technique-icon-heal{
        border-color:#58b978!important;
        background:linear-gradient(135deg,#1f6c3b 0%,#35a85f 100%)!important
      }
      #footSquad .technique-icon.technique-icon-mixed{
        border-color:#9d8b79!important;
        background:linear-gradient(90deg,#bc4b29 0%,#d66b2f 45%,#277cac 55%,#18547c 100%)!important
      }
      #footSquad .technique-icon.technique-icon-neutral{
        border-color:#40545a!important;background:#1b2a30!important
      }
      #footSquad .technique-name{
        grid-area:name!important;min-width:0!important;margin:0!important;font-size:10px!important;line-height:1.15!important;
        white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important
      }
      #footSquad .technique-ap{
        grid-area:ap!important;margin:0!important;color:#d8c17f!important;font-size:8px!important;line-height:1!important;white-space:nowrap!important
      }
      #footSquad .technique-power{
        grid-area:power!important;margin:0!important;color:#aebfc2!important;font-size:8px!important;line-height:1.1!important;white-space:nowrap!important
      }
      #footSquad .technique-range{
        grid-area:range!important;margin:0!important;color:#aebfc2!important;font-size:8px!important;line-height:1.1!important;white-space:nowrap!important
      }
      #footSquad .technique-detail{
        display:none!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:2px!important;
        padding:3px 4px!important;border-top:1px solid #35464d!important;background:#0e171b!important
      }
      #footSquad .technique-card.is-expanded .technique-detail{display:grid!important}
      #footSquad .technique-detail-row{
        min-width:0!important;display:flex!important;align-items:center!important;justify-content:space-between!important;
        gap:3px!important;padding:2px 3px!important;border:1px solid #314148!important;border-radius:4px!important;background:#121d21!important
      }
      #footSquad .technique-detail-row em{
        min-width:0!important;color:#8fa1a5!important;font-size:8px!important;font-style:normal!important;white-space:nowrap!important
      }
      #footSquad .technique-detail-row b{
        min-width:0!important;color:#eef4f2!important;font-size:8px!important;font-weight:700!important;text-align:right!important;
        white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important
      }
      #footSquad .technique-detail-description{
        grid-column:1 / -1!important;display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;
        align-items:start!important;justify-content:stretch!important
      }
      #footSquad .technique-detail-description b{
        text-align:left!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;
        overflow-wrap:anywhere!important;word-break:break-word!important;line-height:1.35!important
      }
      #footSquad .technique-detail-empty{
        grid-column:1 / -1!important;color:#829397!important;font-size:8px!important;padding:3px 0!important
      }
      #footSquad .technique-card.action-technique.active{
        border-color:#e7c466!important;background:linear-gradient(180deg,#2b291c,#1b1a14)!important;
        box-shadow:0 0 0 1px rgba(231,196,102,.18)
      }
      #footSquad .technique-card.action-technique.unavailable{opacity:.38;filter:saturate(.4);cursor:not-allowed!important}
      #footTile .v39-land-shortcuts{grid-column:1 / -1;display:flex;gap:6px}
      #footTile .v39-land-shortcuts .v39-footer-shortcut{min-height:34px;min-width:92px}
      #footSquad.mobile-squad-panel.is-unit-create-open{display:grid!important;grid-template-rows:minmax(0,1fr)!important;gap:0!important}
      #footSquad.is-unit-create-open>#v39-squad-main,#footSquad.is-unit-create-open>#v39-squad-content{display:none!important}
      #footSquad.is-unit-create-open>.v39-unit-create-panel{display:grid;height:100%;min-height:0}
      @media(max-width:600px){
        #footSquad .v39-squad-toolbar{gap:4px}
        #footSquad .v39-squad-shortcuts{gap:4px}
        .v39-footer-shortcut{min-height:30px;padding:4px 6px;font-size:11px}
        .v39-footer-icon-shortcut{width:30px;min-width:30px;padding:0;font-size:16px}
      }
    `;
    document.head.appendChild(style);
  }

  function renderFooter(footer) {
    footer.innerHTML = `
      <div class="footer-tabs">
        ${data.tabs.map((tab, index) => `<button class="footer-tab tappable footer-text-tab${index === 0 ? " active" : ""}" data-foot="${tab.key}"><span class="tab-text">${tab.label}</span><span class="tab-icon">${tab.icon}</span></button>`).join("")}
      </div>
      <div class="footer-body">
        <section id="footSquad" class="mobile-squad-panel v39-footer-panel-active" aria-hidden="false">
          <div class="v39-squad-toolbar" id="v39-squad-main">
            <div class="v39-squad-shortcuts">
              <button type="button" class="v39-footer-shortcut v39-footer-icon-shortcut" data-open="character" data-tooltip="自キャラ" aria-label="自キャラ" title="自キャラ">♟</button>
              <button type="button" class="v39-footer-shortcut v39-footer-icon-shortcut" id="v39-squad-unit-create" data-tooltip="ユニット作成" aria-label="ユニット作成" title="ユニット作成">✚</button>
            </div>
            <div class="squad-selector" id="squadSelector"></div>
          </div>
          <div class="squad-content-split" id="v39-squad-content">
            <div class="squad-list-pane" id="squadMemberList"></div>
            <section class="squad-detail-pane" id="squadDetailPane">
              <div class="squad-detail-minihead"><span class="squad-detail-chip" id="detailRole"></span><span class="squad-detail-chip" id="detailLevel"></span><span class="squad-detail-chip" id="detailGuard" hidden></span></div>
              <details class="squad-detail-section squad-detail-collapsible" open><summary class="squad-detail-section-title squad-detail-toggle">各種ステータス</summary><div class="squad-detail-section-body"><div class="squad-detail-stats">
                ${[["攻撃","detailAtk"],["防御","detailDef"],["魔攻","detailMatk"],["魔防","detailMdef"],["速さ","detailSpd"],["命中","detailHit"],["SIZ","detailSiz"],["移動","detailMov"]].map(([label,id]) => `<div class="detail-stat"><span>${label}</span><b id="${id}"></b></div>`).join("")}
              </div></div></details>
              <details class="squad-detail-section squad-detail-collapsible" open><summary class="squad-detail-section-title squad-detail-toggle">技能</summary><div class="squad-detail-section-body"><div class="proficiency-grid" id="detailProficiencyList"></div></div></details>
              <details class="squad-detail-section squad-detail-collapsible" open><summary class="squad-detail-section-title squad-detail-toggle">技</summary><div class="squad-detail-section-body">
                <section id="footAction" class="mobile-battle-panel v39-detail-action-panel" aria-label="選択キャラクターの行動">
                  <div class="battle-primary-actions">${data.actionButtons.map(item => `<button class="battle-main ${item.className}" id="${item.id}">${item.label}</button>`).join("")}</div>
                </section>
                <div class="technique-list" id="detailTechniqueList"></div>
              </div></details>
            </section>
          </div>
        </section>
        <section id="footTile" class="land-panel" hidden aria-hidden="true">
          <div class="v39-land-shortcuts"><button type="button" class="v39-footer-shortcut" data-open="build">⌂ 建設</button></div>
          ${data.landItems.map(item => `<div class="land-item"><span>${item.label}</span><b${item.valueId ? ` id="${item.valueId}"` : ""}>${item.value}</b></div>`).join("")}
        </section>
        <section id="footSettlement" class="settlement-panel" hidden aria-hidden="true"></section>
        <section id="footManage" class="mobile-manage-panel" hidden aria-hidden="true">
          <div id="v39-manage-menu" class="manage-menu-grid">${data.manageItems.map(item => `<button class="manage-tile" ${attributes(item)}><b>${item.icon}</b><span>${item.labelHtml || item.label}</span></button>`).join("")}</div>
          <section id="v39-display-settings-panel" class="display-settings-panel" hidden aria-hidden="true">
            <header class="display-settings-head"><button type="button" id="v39-display-settings-back" class="display-settings-back">← 管理</button><strong>表示設定</strong></header>
            <div class="display-settings-grid">
              <label class="display-setting"><span class="display-setting-title">文字の大きさ <output id="v39-font-size-value">100%</output></span><input type="range" id="v39-font-size" min="80" max="140" step="5" value="100"><small>下部UIを含む画面内文字の倍率です。</small></label>
              <label class="display-setting"><span class="display-setting-title">高低差がある境界だけ表示 <input type="checkbox" id="v39-height-outline-only" checked></span><small>同じ高さ同士の黒いマス目線を隠します。</small></label>
              <label class="display-setting"><span class="display-setting-title">高度による色の濃淡 <input type="checkbox" id="v39-height-shading" checked></span><small>低地を明るく、高地と深い海を暗くします。</small></label>
              <label class="display-setting"><span class="display-setting-title">地図の拡大縮小ボタン <input type="checkbox" id="v39-show-zoom-controls" checked></span><small>地図左下の＋−ボタンを表示します。</small></label>
              <label class="display-setting"><span class="display-setting-title">画面の動きを減らす <input type="checkbox" id="v39-reduce-motion"></span><small>点滅や画面切替アニメーションを抑えます。</small></label>
              <button type="button" id="v39-display-settings-reset" class="display-setting display-setting-reset"><span class="display-setting-title">表示設定を初期値へ戻す</span><small>文字100%、高度濃淡ON、高低差境界のみONへ戻します。</small></button>
            </div>
          </section>
        </section>
      </div>`;
    footer.dataset.v39Rendered = "true";
  }

  function activateFooterTab(tabKey) {
    const normalized = data.tabs.some(tab => tab.key === tabKey) ? tabKey : data.tabs[0].key;
    document.querySelectorAll("[data-foot]").forEach(button => button.classList.toggle("active", button.dataset.foot === normalized));
    data.tabs.forEach(tab => {
      const panel = document.getElementById(`foot${tab.key[0].toUpperCase()}${tab.key.slice(1)}`);
      if (!panel) return;
      const active = tab.key === normalized;
      panel.hidden = !active;
      panel.setAttribute("aria-hidden", String(!active));
      panel.classList.toggle("v39-footer-panel-active", active);
    });
    window.dispatchEvent(new CustomEvent("v39:footer-tab-changed", { detail: { tab: normalized } }));
  }

  const footer = document.querySelector(".footer");
  if (!(footer instanceof HTMLElement)) throw new Error("operation UI mount point is missing");
  installOperationStyles();
  renderFooter(footer);
  footer.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("[data-foot]") : null;
    if (!button) return;
    activateFooterTab(button.dataset.foot || "squad");
  });

  window.V39_OPERATION_UI_DATA = data;
  window.V39_INITIAL_GAME_STATE = V39_TEST_GAME_STATE;
  window.activateV39FooterTab = activateFooterTab;
  window.dispatchEvent(new Event("v39:operation-ui-ready"));
})();
