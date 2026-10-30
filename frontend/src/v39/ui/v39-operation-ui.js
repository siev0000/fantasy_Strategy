import { renderV39UnitAbility, renderV39DetailTabs } from "../unit/v39-unit-detail.js";
import { V39_TEST_GAME_STATE } from "../dev/v39-test-data.js";
import './v39-operation-layout.css';
import {V39_LAND_TABS,getV39LandFieldTab} from './v39-land-tabs.js';

(function initializeOperationUi() {
  "use strict";

  const EMPTY_LAND_ITEMS = Object.freeze([
    { label:"地形", value:"-", valueId:"landTerrain" },
    { label:"領土", value:"-", valueId:"landOwner" },
    { label:"危険度", value:"-" },
    { label:"環境効果", value:"マスを選択", valueId:"v39-land-environment-effects" },
    { label:"天候", value:"-", valueId:"v39-land-weather" },
    { label:"高度", value:"-", valueId:"landHeight" },
    { label:"浄化", value:"-", valueId:"v39-land-purification" },
    { label:"施設", value:"-" },
    { label:"結界 / 壁", value:"なし", valueId:"v39-land-defense" },
    { label:"ユニット", value:"-", valueId:"landUnits" },
    { label:"町状態", value:"-" },
    { label:"領土状態", value:"-" },
    { label:"回復補正", value:"-" },
    { label:"移動停止", value:"-" },
    { label:"川 / 滝", value:"-" },
    { label:"火山 / 溶岩", value:"-" },
    { label:"敵", value:"-", valueId:"landEnemies" }
  ]);

  const data = Object.freeze({
    tabs: [
      { key: "squad", label: "部隊", icon: "👥" },
      { key: "tile", label: "土地", icon: "⬢" },
      { key: "settlement", label: "拠点", icon: "⌂" },
      { key: "interaction", label: "交流", icon: "◇" },
      { key: "logistics", label: "物流", icon: "⇄" },
      { key: "test", label: "テスト", icon: "試" },
      { key: "manage", label: "管理", icon: "⚙" }
    ],
    landItems: EMPTY_LAND_ITEMS,
    manageItems: [
      { icon: "⚒", label: "装備", open: "equipment" },
      { icon: "⇄", labelHtml: '資源表示: <em id="resourceModeLabel">詳細</em>', id: "resourceModeToggle", title: "資源表示を詳細/簡易で切替", tip: "資源表示切替" },
      { icon: "☷", label: "ログ", open: "rulerLog" },
      { icon: "🏳", label: "国家・外交", id: "v39-manage-nation" },
      { icon: "⚙", label: "ゲーム設定", open: "settings" },
      { icon: "目", label: "表示設定", id: "v39-manage-display-settings" },
      { icon: "⬢", label: "ゲーム開始設定", id: "v39-manage-field-settings" },
      { icon: "📝", label: "設計書", id: "v39-manage-design-docs" }
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
      .footer-tab.footer-text-tab{
        display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;
        gap:1px!important;min-height:48px!important;padding:4px 3px!important;line-height:1!important
      }
      .footer-tab.footer-text-tab .tab-icon{
        display:block!important;order:1!important;font-size:var(--font-size-22)!important;line-height:1!important
      }
      .footer-tab.footer-text-tab .tab-text{
        display:block!important;order:2!important;font-size:var(--font-body)!important;font-weight:700!important;line-height:1.15!important
      }
      #footSquad .v39-squad-toolbar{display:flex;align-items:center;gap:6px;min-width:0;overflow:visible}
      #footSquad .v39-squad-shortcuts{display:flex;gap:5px;flex:0 0 auto;overflow:visible}
      #v39-cave-party-order[hidden]{display:none}
      .v39-footer-shortcut{min-height:30px;border:1px solid #4d747d;border-radius:7px;background:#173039;color:#e7f2f0;padding:4px 8px;font:inherit;font-size:var(--font-compact);font-weight:800;white-space:nowrap;cursor:pointer}
      .v39-footer-shortcut:hover{background:#1d424b;border-color:#77d8e7}
      .v39-footer-shortcut:focus-visible{outline:2px solid #9de4ef;outline-offset:1px}
      .v39-footer-icon-shortcut{position:relative;width:32px;min-width:32px;height:30px;padding:0;font-size:var(--font-size-17);line-height:1}
      .v39-footer-icon-shortcut::after{content:attr(data-tooltip);position:absolute;z-index:80;top:calc(100% + 6px);left:0;min-width:max-content;padding:5px 7px;border:1px solid #70bcc8;border-radius:5px;background:#0a171b;color:#efffff;font-size:var(--font-compact);font-weight:800;line-height:1.1;pointer-events:none;opacity:0;transform:translateY(-2px);transition:opacity .12s ease,transform .12s ease}
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
        display:grid!important;grid-template-rows:auto auto minmax(0,1fr)!important;
        gap:0!important;padding:3px 2px 3px 4px!important;overflow:hidden!important
      }
      #footSquad .squad-detail-pane>*+*{margin-top:0!important}
      #footSquad .squad-detail-tab-panel[hidden],#footSquad .system-action-card[hidden]{display:none!important}
      #footSquad .v39-cave-conquest-choice{display:grid!important;gap:4px;padding:5px;border:1px solid #d7bf73;border-radius:6px;
        background:#18272b;font-size:var(--font-body);color:#eef5f4}
      #footSquad .v39-cave-conquest-choice button{font:inherit;min-height:28px;border:1px solid #60757b;border-radius:4px;background:#243a40;color:inherit}
      .v39-move-confirm{position:sticky;top:0;z-index:5;display:grid;gap:4px;padding:4px;margin-bottom:4px;
        border:1px solid #69bdcc;border-radius:5px;background:#102127;color:#eaf4f2;font-size:var(--font-body)}
      .v39-move-confirm[hidden]{display:none}
      .v39-move-confirm p{margin:0;overflow-wrap:anywhere}
      .v39-move-confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:4px}
      .v39-move-confirm-actions button{min-width:0;min-height:32px;padding:3px;border:1px solid #4d6067;
        border-radius:5px;background:#172329;color:inherit;font:inherit;font-weight:700}
      .v39-move-confirm-actions .primary{border-color:#69bdcc;background:#234750}
      .v39-move-confirm-actions button:disabled{opacity:.45;cursor:not-allowed}
      #footSquad .equipment-list{display:grid;gap:2px}
      #footSquad .equipment-card{
        width:100%;min-width:0;border:1px solid #34484f;border-radius:5px;background:#121e23;color:#e8efec;
        padding:0;text-align:left;cursor:pointer;overflow:hidden
      }
      #footSquad .equipment-summary{
        min-height:32px;display:grid;grid-template-columns:24px minmax(0,1fr) auto auto;align-items:center;
        gap:5px;padding:4px 6px
      }
      #footSquad .equipment-icon{font-size:var(--font-size-19);line-height:1;text-align:center}
      #footSquad .equipment-name{min-width:0;font-size:var(--font-compact);white-space:normal;overflow-wrap:anywhere}
      #footSquad .equipment-slot,#footSquad .equipment-quality{font-size:var(--font-size-10);color:#98aaae;white-space:nowrap}
      #footSquad .equipment-detail{display:none;border-top:1px solid #31434a;padding:5px 7px;background:#0d171b}
      #footSquad .equipment-card.is-expanded .equipment-detail{display:grid;gap:4px}
      #footSquad .equipment-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}
      #footSquad .equipment-detail-grid span{min-width:0;padding:3px 5px;border-radius:4px;background:#16252a;font-size:var(--font-size-10);color:#c8d4d6}
      #footSquad .equipment-detail-grid b{color:#edf5f2;font-size:var(--font-size-11)}
      #footSquad .equipment-detail-line{font-size:var(--font-size-10);line-height:1.5;color:#c4d0d2}
      #footSquad .equipment-detail-line b{color:#e8f0ed}
      #footSquad .equipment-empty{padding:6px;color:#aebec1;font-size:var(--font-size-11)}
      #footSquad #detailTechniqueRows{display:contents!important}
      #footSquad .system-action-card .technique-icon-system-move{
        border-color:#a98b45!important;background:linear-gradient(135deg,#4a3a18 0%,#75601f 100%)!important
      }
      #footSquad .system-action-card .technique-icon-system-wait{
        border-color:#8c8061!important;background:linear-gradient(135deg,#3f3827 0%,#6c6040 100%)!important
      }
      #footSquad .system-action-card.active{
        border-color:#e7c466!important;background:linear-gradient(180deg,#2b291c,#1b1a14)!important;
        box-shadow:0 0 0 1px rgba(231,196,102,.18)
      }
      #footSquad .technique-card.action-technique.active{
        border-color:#e7c466!important;background:linear-gradient(180deg,#2b291c,#1b1a14)!important;
        box-shadow:0 0 0 1px rgba(231,196,102,.18)
      }
      #footSquad .technique-card.action-technique.unavailable{opacity:.38;filter:saturate(.4);cursor:not-allowed!important}
      #footSquad .system-action-card.unavailable{opacity:.38;filter:saturate(.4);cursor:not-allowed!important}
      .footer-body{min-height:0!important;overflow:hidden!important}
      html:not(.v39-test-mode) [data-foot="test"]{display:none!important}
      html:not(.v39-test-mode) #footTest{display:none!important}
      #footTest{min-width:0;min-height:0;height:100%;max-height:100%;overflow:hidden;display:flex;flex:1 1 0;flex-direction:column}
      @media(max-width:600px){
        #footSquad .v39-squad-toolbar{gap:4px}
        #footSquad .v39-squad-shortcuts{gap:4px}
        .v39-footer-shortcut{min-height:30px;padding:4px 6px;font-size:var(--font-size-11)}
        .v39-footer-icon-shortcut{width:30px;min-width:30px;padding:0;font-size:var(--font-size-16)}
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
        <section id="footPlacement" hidden aria-hidden="true"></section>
        <section id="footSquad" class="mobile-squad-panel v39-footer-panel-active" aria-hidden="false">
          <div class="v39-squad-toolbar" id="v39-squad-main">
            <div class="v39-squad-shortcuts">
              <button type="button" class="v39-footer-shortcut v39-footer-icon-shortcut" data-open="character" data-tooltip="ユニット一覧" aria-label="ユニット一覧" title="ユニット一覧">♟</button>
            </div>
            <div class="squad-selector" id="squadSelector"></div>
          </div>
          <div class="squad-content-split" id="v39-squad-content">
            <div class="squad-list-pane" id="squadMemberList"></div>
            <section class="squad-detail-pane" id="squadDetailPane">
              <div class="squad-detail-minihead"><div id="detailUnitHeading" style="width:100%;min-width:0"></div></div>
              ${renderV39DetailTabs([["status","能力"],["basic","基本"],["action","スキル"]], "status", "data-squad-detail-tab")}
              <div class="squad-detail-tab-content" id="detailTechniqueList">
                <section class="squad-detail-tab-panel" data-squad-detail-panel="status" role="tabpanel" aria-hidden="false">
                  <div id="detailAbilitySections">${renderV39UnitAbility(null, {fieldIds:true})}</div>
                  <details class="squad-detail-section" open><summary class="squad-detail-section-title">装備</summary><div class="squad-detail-section-body"><div class="equipment-list" id="detailEquipmentList"></div></div></details>
                </section>
                <section class="squad-detail-tab-panel" data-squad-detail-panel="basic" role="tabpanel" hidden aria-hidden="true">
                  <button type="button" id="v39-basic-action-heading" class="v39-basic-action-heading" disabled aria-controls="detailBasicList"><span id="v39-basic-action-label">行動を選択</span></button>
                  <div class="v39-move-confirm" id="moveConfirm" hidden role="region" aria-label="移動確認">
                    <p id="moveInstruction" aria-live="polite"></p>
                    <p id="moveText" hidden></p>
                    <div class="v39-move-confirm-actions">
                      <button type="button" id="moveCancel">取消</button>
                      <button type="button" class="primary" id="moveOk" disabled>移動確定</button>
                    </div>
                  </div>
                  <div class="technique-list" id="detailBasicList">
                    <div id="detailUnitCargoStatus" class="v39-unit-cargo-status" role="status" aria-label="手持ち物資" hidden></div>
                    <details id="detailCarriedFood" class="v39-carried-food" hidden>
                      <summary>携帯食料・補給</summary>
                      <div class="v39-food-stock"><div id="carriedFoodStock"></div><div id="carriedFoodDemand"></div></div>
                      <label class="v39-food-target">補給目標 <span><input id="carriedFoodTurns" type="number" min="1" step="1" aria-label="補給する食料のターン数"> T分</span></label>
                      <div id="carriedFoodReason" role="status"></div>
                      <div class="v39-carried-food-buttons">
                        <button type="button" id="carriedFoodTake" class="v39-food-primary">補給する</button>
                        <button type="button" id="carriedFoodCraft" hidden disabled>保存食を作る</button>
                        <button type="button" id="carriedFoodGive">拠点に預ける</button>
                        <button type="button" id="carriedFoodField" hidden>現地で採取</button>
                      </div>
                      <details class="v39-food-help"><summary>加工・容量の詳細</summary><div id="carriedFoodCraftPreview"></div><div id="carriedFoodCapacity"></div></details>
                    </details>
                    <div id="v39-teleport-gate-actions"></div>
                    <div id="v39-rubble-actions"></div>
                    <div id="v39-basic-coordination" data-squad-coordination-host></div>
                    <button type="button" class="technique-card technique-select-card system-action-card" id="mobileBattleMove" data-v39-technique-name="__system_move__" aria-expanded="false">
                      <span class="technique-summary">
                        <span class="technique-icon technique-icon-system-move"><span class="technique-icon-glyph" aria-hidden="true">➜</span></span>
                        <b class="technique-name">移動</b>
                        <small class="technique-ap" id="mobileMoveAp" hidden></small>
                        <span class="technique-power" id="mobileMoveMeta" hidden></span>
                        <span class="technique-range" id="mobileMoveRemain" hidden></span>
                      </span>
                      <span class="technique-detail">
                        <span class="technique-detail-head"><b>説明</b></span>
                        <span class="technique-detail-description">移動先を選択して移動します。1マスの基礎消費APは移動力で決まり、地形・高低差・飛行で補正されます。</span>
                      </span>
                    </button>
                    <div role="button" tabindex="0" class="technique-card technique-select-card system-action-card" id="mobileBattleWait" data-v39-technique-name="__system_wait__" aria-expanded="false">
                      <span class="technique-summary">
                        <span class="technique-icon technique-icon-system-wait"><span class="technique-icon-glyph" aria-hidden="true">◷</span></span>
                        <b class="technique-name">待機</b>
                        <small class="technique-ap">AP保持</small>
                        <span class="technique-power">行動終了</span>
                      </span>
                      <span class="technique-detail">
                        <span class="technique-detail-head"><b>説明</b><button type="button" id="mobileBattleWaitUse" data-v39-system-use>使用</button></span>
                        <span class="technique-detail-description">APを消費せず、このターンの行動を終了します。次のターンに再び行動できます。</span>
                      </span>
                    </div>
                    <div role="button" tabindex="0" class="technique-card technique-select-card system-action-card" id="mobileBattleRecoveryWait" data-v39-technique-name="__system_recovery_wait__" aria-expanded="false">
                      <span class="technique-summary">
                        <span class="technique-icon technique-icon-system-wait"><span class="technique-icon-glyph" aria-hidden="true">◷</span></span>
                        <b class="technique-name">回復まで待機</b>
                        <small class="technique-ap">AP保持</small>
                        <span class="technique-power" id="mobileRecoveryWaitTarget"></span>
                      </span>
                      <span class="technique-detail">
                        <span class="technique-detail-head"><b>説明</b><button type="button" id="mobileBattleRecoveryWaitUse" data-v39-system-use>開始</button></span>
                        <span class="technique-detail-description">目標HPまで毎ターン自動で待機します。途中解除可。目標は管理のゲーム設定で変更できます。回復速度は通常のままです。</span>
                      </span>
                    </div>
                    <div role="button" tabindex="0" class="technique-card technique-select-card system-action-card" id="mobileBattleSurvey" data-v39-technique-name="__system_survey__" aria-expanded="false">
                      <span class="technique-summary">
                        <span class="technique-icon"><span class="technique-icon-glyph" aria-hidden="true">⌕</span></span>
                        <b class="technique-name">調査</b>
                        <small class="technique-ap" id="mobileSurveyAp">必要APのみ消費</small>
                        <span class="technique-power" id="mobileSurveyProgress">未調査</span>
                      </span>
                      <span class="technique-detail"><span class="technique-detail-head"><b>説明</b><button type="button" id="mobileBattleSurveyUse" data-v39-system-use>使用</button></span>
                        <span class="technique-detail-description">このキャラの索敵範囲全体を調査します。残りAPの分だけ進み、不足分は次ターン以降に継続できます。必要APに達するとターン終了時に特産品・鉱脈・残留品などが判明します。</span>
                      </span>
                    </div>
                    <div role="button" tabindex="0" class="technique-card technique-select-card system-action-card" id="mobileBattleGather" data-v39-technique-name="__system_gather__" aria-expanded="false">
                      <span class="technique-summary">
                        <span class="technique-icon"><span class="technique-icon-glyph" aria-hidden="true">⛏</span></span>
                        <b class="technique-name">採取</b><small class="technique-ap" id="mobileGatherAp"></small>
                        <span class="technique-power" id="mobileGatherYield"></span>
                      </span>
                      <span class="technique-detail"><span class="technique-detail-head"><b>説明</b><button type="button" id="mobileBattleGatherUse" data-v39-system-use>使用</button></span>
                        <span class="technique-detail-description">残りAPと積載余力に応じて採取します。地上は現在地の森・洞窟、洞窟内は周囲1マスの鉱石・宝石を選択します。鉱石・宝石は累計APで1個取得し、途中の進捗も残ります。荷物として運び、拠点へ戻って搬入します。</span>
                        <span class="technique-detail-description" id="mobileGatherCargo"></span>
                      </span>
                    </div>
                    <div role="button" tabindex="0" class="technique-card technique-select-card system-action-card" id="mobileSoulRecovery" data-v39-technique-name="__system_soul_recovery__" aria-expanded="false" hidden>
                      <span class="technique-summary"><span class="technique-icon"><span class="technique-icon-glyph" aria-hidden="true">◇</span></span><b class="technique-name">魂を回収</b><small class="technique-ap" id="mobileSoulRecoveryAp"></small><span class="technique-power" id="mobileSoulRecoveryHint"></span></span>
                      <span class="technique-detail"><span class="technique-detail-head"><b>周囲1マスの魂回収</b><button type="button" id="mobileSoulRecoveryUse" data-v39-system-use>マスを選択</button><button type="button" id="mobileSoulRecoveryCancel" data-v39-system-use hidden>取消</button></span><span class="technique-detail-description" id="mobileSoulRecoveryReason" role="status" style="white-space:normal;overflow:visible;overflow-wrap:anywhere"></span><span class="technique-detail-description">マスをタップして複数選択・解除。選択マス内の対象死体をまとめて回収します。魂は手持ちに積載し、拠点で搬入。死体と装備は残ります。</span></span>
                    </div>
                    <div id="detailBasicRows"></div>
                  </div>
                </section>
                <section class="squad-detail-tab-panel" data-squad-detail-panel="action" role="tabpanel" hidden aria-hidden="true">
                  <div class="technique-list" id="detailTechniqueRows"></div>
                </section>
              </div>
            </section>
          </div>
        </section>
        <section id="footTile" class="land-panel" hidden aria-hidden="true">
          <header class="v39-land-head"><strong id="v39-land-heading">マスを選択</strong><small id="v39-land-heading-owner"></small></header>
          <nav class="v39-land-tabs" role="tablist" aria-label="土地の表示内容">${V39_LAND_TABS.map((tab,index)=>`<button type="button" role="tab" id="v39-land-tab-${tab.id}" data-land-tab="${tab.id}" aria-controls="v39-land-page-${tab.id}" aria-selected="${index===0}" tabindex="${index===0?0:-1}">${tab.label}</button>`).join('')}</nav>
          <div id="v39-land-scroll">
          ${V39_LAND_TABS.map((tab,index)=>`<section id="v39-land-page-${tab.id}" data-land-page="${tab.id}" role="tabpanel" aria-labelledby="v39-land-tab-${tab.id}"${index?' hidden':''}>
            ${data.landItems.filter(item=>getV39LandFieldTab(item.label)===tab.id).map(item => `<div class="land-item"><span>${item.label}</span><b${item.valueId ? ` id="${item.valueId}"` : ""}>${item.value}</b></div>`).join('')}
            ${tab.id==='production'?'<div id="v39-land-production"></div>':''}
            ${tab.id==='facilities'?`
          <div class="v39-land-shortcuts">
            <button type="button" class="v39-footer-shortcut" data-land-construction-open>⌂ 建築</button>
            <button type="button" class="v39-footer-shortcut" id="v39-land-settlement-convert" disabled>居住化</button>
            <span id="v39-land-settlement-convert-status" aria-live="polite">マスを選択</span>
          </div>
            `:''}
          </section>`).join('')}
          </div>
        </section>
        <section id="footSettlement" class="settlement-panel" hidden aria-hidden="true"></section>
        <section id="footInteraction" class="v39-interaction-panel" hidden aria-hidden="true"><header><strong>交流</strong><span>相手の領土・隣接ユニットを選択</span></header><p data-interaction-empty>村・勢力の領土に隣接するユニット、または相手のマスを選択してください。</p><div id="v39-interaction-actions"></div></section>
        <section id="footLogistics" hidden aria-hidden="true"></section>
        <section id="footTest" class="v39-test-footer-panel" hidden aria-hidden="true"></section>
        <section id="footManage" class="mobile-manage-panel" hidden aria-hidden="true">
          <div id="v39-manage-menu" class="manage-menu-grid">${data.manageItems.map(item => `<button class="manage-tile" ${attributes(item)}><b>${item.icon}</b><span>${item.labelHtml || item.label}</span></button>`).join("")}</div>
          <section id="v39-display-settings-panel" class="display-settings-panel" hidden aria-hidden="true">
            <header class="display-settings-head"><button type="button" id="v39-display-settings-back" class="display-settings-back">← 管理</button><strong>表示設定</strong></header>
            <div class="display-settings-grid">
              <section class="display-setting"><strong>プレイヤーの色</strong><div id="v39-player-colors"></div><small>領土・ユニット・物流の所属色。このブラウザの表示設定として保存します。</small></section>
              <label class="display-setting"><span class="display-setting-title">文字の大きさ <output id="v39-font-size-value">100%</output></span><input type="range" id="v39-font-size" min="80" max="140" step="5" value="100"><small>下部UIを含む画面内文字の倍率です。</small></label>
              <label class="display-setting"><span class="display-setting-title">高低差がある境界だけ表示 <input type="checkbox" id="v39-height-outline-only" checked></span><small>同じ高さ同士の黒いマス目線を隠します。</small></label>
              <label class="display-setting"><span class="display-setting-title">高度による色の濃淡 <input type="checkbox" id="v39-height-shading" checked></span><small>低地を明るく、高地と深い海を暗くします。</small></label>
              <label class="display-setting"><span class="display-setting-title">地図の拡大縮小ボタン <input type="checkbox" id="v39-show-zoom-controls" checked></span><small>地図左下の＋−ボタンを表示します。</small></label>
              <label class="display-setting"><span class="display-setting-title">画面の動きを減らす <input type="checkbox" id="v39-reduce-motion"></span><small>点滅や画面切替アニメーションを抑えます。</small></label>
              <label class="display-setting"><span class="display-setting-title">ターン終了時に未行動キャラを確認 <input type="checkbox" id="v39-focus-unacted-units" checked></span><small>未行動キャラを選択して地図を合わせます。待機済みは対象外。OFFならそのまま終了します。</small></label>
              <button type="button" id="v39-display-settings-reset" class="display-setting display-setting-reset"><span class="display-setting-title">表示設定を初期値へ戻す</span><small>文字100%、高度濃淡ON、高低差境界のみONへ戻します。</small></button>
            </div>
          </section>
        </section>
      </div>`;
    footer.dataset.v39Rendered = "true";
  }

  function activateSquadDetailTab(tabKey) {
    const normalized = ['basic','action'].includes(tabKey) ? tabKey : "status";
    document.querySelectorAll("[data-squad-detail-tab]").forEach(button => {
      const active = button.dataset.squadDetailTab === normalized;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-squad-detail-panel]").forEach(panel => {
      const active = panel.dataset.squadDetailPanel === normalized;
      panel.hidden = !active;
      panel.setAttribute("aria-hidden", String(!active));
    });
  }

  function activateFooterTab(tabKey) {
    // 初期配置が終わるまで、通常タブで配置確認・決定ボタンを隠さない。
    const placementActive = window.getV39ActiveFactionState?.()?.villagePlacementMode === true;
    const testEnabled = window.isV39TestMode?.() === true || window.getV39DisplaySettings?.().testMode === true;
    const requested = placementActive ? "placement" : tabKey === "test" && !testEnabled ? "squad" : tabKey;
    const normalized = requested === "placement" || data.tabs.some(tab => tab.key === requested) ? requested : data.tabs[0].key;
    document.querySelectorAll("[data-foot]").forEach(button => button.classList.toggle("active", button.dataset.foot === normalized));
    [...data.tabs, { key:"placement" }].forEach(tab => {
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
  window.addEventListener("v39:display-settings-changed", event => {
    const enabled = event?.detail?.testMode === true
      || window.isV39TestMode?.() === true
      || window.getV39DisplaySettings?.().testMode === true;
    const activeTest = document.querySelector('[data-foot="test"]')?.classList.contains("active");
    if (!enabled && activeTest) activateFooterTab("squad");
  });

  footer.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const detailTab = target?.closest("[data-squad-detail-tab]");
    if (detailTab) {
      activateSquadDetailTab(detailTab.dataset.squadDetailTab || "status");
      return;
    }
    const button = target?.closest("[data-foot]");
    if (!button) return;
    activateFooterTab(button.dataset.foot || "squad");
  });

  window.V39_OPERATION_UI_DATA = data;
  window.V39_TEST_GAME_STATE = V39_TEST_GAME_STATE;
  window.activateV39FooterTab = activateFooterTab;
  window.dispatchEvent(new Event("v39:operation-ui-ready"));
})();
