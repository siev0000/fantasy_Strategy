import { V39_TEST_GAME_STATE, V39_TEST_OPERATION_DATA } from "./v39-test-data.js";

(function initializeOperationUi() {
  "use strict";

  const data = Object.freeze({
    tabs: [
      { key: "squad", label: "部隊", icon: "👥" },
      { key: "action", label: "行動", icon: "⚔" },
      { key: "tile", label: "土地", icon: "⬢" },
      { key: "settlement", label: "拠点", icon: "⌂" },
      { key: "manage", label: "管理", icon: "☰" }
    ],
    landItems: V39_TEST_OPERATION_DATA.landItems,
    actionButtons: [
      { label: "移動", className: "move", id: "mobileBattleMove" },
      { label: "攻撃", className: "attack active", id: "mobileBattleAttack" },
      { label: "待機", className: "", id: "mobileBattleWait" }
    ],
    actionSkills: V39_TEST_OPERATION_DATA.actionSkills,
    manageItems: [
      { icon: "♟", label: "自キャラ", open: "character" },
      { icon: "⌂", label: "都市・建設", open: "build" },
      { icon: "⚒", label: "装備", open: "equipment" },
      { icon: "⇄", labelHtml: '資源表示: <em id="resourceModeLabel">詳細</em>', id: "resourceModeToggle", title: "資源表示を詳細/簡易で切替", tip: "資源表示切替" },
      { icon: "✚", label: "ユニット作成", open: "unitCreate" },
      { icon: "☷", label: "ログ", open: "rulerLog" },
      { icon: "旗", label: "国家・外交", id: "v39-manage-nation" },
      { icon: "⚙", label: "ゲーム設定", open: "settings" },
      { icon: "目", label: "表示設定", id: "v39-manage-display-settings" },
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

  function renderFooter(footer) {
    const selectedSkill = data.actionSkills[0];
    footer.innerHTML = `
      <div class="footer-tabs">
        ${data.tabs.map((tab, index) => `<button class="footer-tab tappable footer-text-tab${index === 0 ? " active" : ""}" data-foot="${tab.key}"><span class="tab-text">${tab.label}</span><span class="tab-icon">${tab.icon}</span></button>`).join("")}
      </div>
      <div class="footer-body">
        <section id="footSquad" class="mobile-squad-panel v39-footer-panel-active" aria-hidden="false">
          <div class="squad-selector" id="squadSelector"></div>
          <div class="squad-content-split">
            <div class="squad-list-pane" id="squadMemberList"></div>
            <section class="squad-detail-pane" id="squadDetailPane">
              <div class="squad-detail-minihead"><span class="squad-detail-chip" id="detailRole"></span><span class="squad-detail-chip" id="detailLevel"></span><span class="squad-detail-chip" id="detailGuard" hidden></span></div>
              <div class="squad-detail-section"><div class="squad-detail-section-title">各種ステータス</div><div class="squad-detail-stats">
                ${[["攻撃","detailAtk"],["防御","detailDef"],["魔攻","detailMatk"],["魔防","detailMdef"],["速さ","detailSpd"],["命中","detailHit"],["SIZ","detailSiz"],["移動","detailMov"]].map(([label,id]) => `<div class="detail-stat"><span>${label}</span><b id="${id}"></b></div>`).join("")}
              </div></div>
              <div class="squad-detail-section"><div class="squad-detail-section-title">技能</div><div class="proficiency-grid" id="detailProficiencyList"></div></div>
              <div class="squad-detail-section"><div class="squad-detail-section-title">技</div><div class="technique-list" id="detailTechniqueList"></div></div>
            </section>
          </div>
        </section>
        <section id="footAction" class="mobile-battle-panel" hidden aria-hidden="true">
          <div class="battle-primary-actions">${data.actionButtons.map(item => `<button class="battle-main ${item.className}" id="${item.id}">${item.label}</button>`).join("")}</div>
          <div class="battle-skill-strip">${data.actionSkills.map((skill, index) => `<button class="battle-skill${index === 0 ? " active" : ""}" data-mobile-skill="${skill.key}"><b>${skill.icon} ${skill.name}</b><small>AP${skill.ap} / 威${skill.power} / ${skill.meta}</small></button>`).join("")}</div>
          <div class="battle-selection-summary"><span>選択: <b id="mobileSelectedSkill">${selectedSkill.name}</b></span><span>AP <b id="mobileBattleAp">100 / 100</b></span><button class="primary" id="mobileSkillUse">使用</button></div>
        </section>
        <section id="footTile" class="land-panel" hidden aria-hidden="true">
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
