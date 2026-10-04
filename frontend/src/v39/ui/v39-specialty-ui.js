import { getV39SpecialtyEntries, summarizeV39Specialties, isV39HarvestResource, resolveV39SpecialResourceHarvestRule } from "../../lib/v39-specialty-rules.js";
import { resolveV39ResourceIconGlyph } from "../../lib/resource-icon-glyphs.js";
import { getSelectedSettlement } from "../../lib/settlement-state.js";

let opened = false;
let ownerId = "";
let selectedTab = "stock";
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

function renderPanel() {
  let panel = document.getElementById("v39-specialty-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "v39-specialty-panel";
    panel.setAttribute("aria-label", "特殊資源");
    document.querySelector(".playfield")?.appendChild(panel);
    panel.addEventListener("click", event => {
      const tab = event.target.closest("[data-specialty-tab]");
      if (tab) { selectedTab = tab.dataset.specialtyTab; renderPanel(); }
      if (event.target.closest("[data-specialty-close]")) {
        opened = false; renderPanel();
        document.getElementById("v39-specialty-header")?.setAttribute("aria-expanded", "false");
      }
    });
  }
  panel.hidden = !opened;
  if (!opened) return;
  const state = window.getV39GameState?.();
  const owned = getV39SpecialtyEntries(state, state?.activePlayerId, { ownedOnly:true });
  const found = summarizeV39Specialties(owned);
  const faction = state?.players?.find(player => player.id === state.activePlayerId)?.factionState;
  const settlement = getSelectedSettlement(faction);
  const resourceSites = getV39SpecialtyEntries(state, state?.activePlayerId, { settlementId:settlement?.settlementId || settlement?.id, ownedOnly:true }).filter(isV39HarvestResource);
  const research = faction?.research;
  const stock = window.getV39ResourceSnapshot?.()?.special?.items || [];
  const harvestNote = row => {
    const sites = resourceSites.filter(site => site.name === row.name);
    if (!sites.length) return "";
    const rule = resolveV39SpecialResourceHarvestRule(sites[0], research);
    const remaining = Math.min(...sites.map(site => {
      const saved = settlement?.specialResourceHarvestByTile?.[site.key];
      const progress = saved?.name === site.name ? Number(saved.progress) || 0 : 0;
      return Math.max(1, Math.ceil((rule.turns - progress - 1e-9) / rule.speed));
    }));
    const description = `${sites.length}マス・次の採取まで${remaining}ターン`;
    return `<small class="v39-harvest-note" title="${description}" aria-label="${description}">×${sites.length} ⌛${remaining}</small>`;
  };
  panel.innerHTML = `<div class="v39-specialty-head"><b>特殊資源</b><button type="button" data-specialty-close aria-label="閉じる">×</button></div>
    <div class="v39-specialty-tabs" role="tablist">${[["stock","在庫"],["specialties","特産品"]].map(([key,label]) => `<button type="button" role="tab" aria-selected="${selectedTab === key}" data-specialty-tab="${key}">${label}</button>`).join("")}</div>
    <div class="v39-specialty-list">${selectedTab === "stock" ? stock.map(row => `<div class="v39-specialty-row"><span style="color:${escape(row.iconColor || "inherit")}">${escape(row.icon)}</span><b>${escape(row.name)}</b><span>${Number(row.value).toLocaleString("ja-JP")}</span><small>${Math.round(row.delta) > 0 ? "+" : ""}${Math.round(row.delta) || 0}</small>${harvestNote(row)}</div>`).join("") : found.length ? found.map(row => `<div class="v39-specialty-row"><span style="color:${escape(row.color || "inherit")}">${escape(row.glyph)}</span><b>${escape(row.name)}</b><span>${row.count}マス</span></div>`).join("") : "発見済みの特産品マスを領土にすると表示されます。"}</div>`;
}

export function renderV39SpecialtyHeader(parent) {
  const state = window.getV39GameState?.();
  if (ownerId !== state?.activePlayerId) { opened = false; ownerId = state?.activePlayerId; }
  const button = document.createElement("button");
  button.id = "v39-specialty-header";
  button.className = "res-chip ore-group tappable resource-group-btn";
  button.dataset.group = "special";
  button.title = "特殊資源の在庫・発見済みの特産品";
  button.setAttribute("aria-expanded", String(opened));
  const stock = window.getV39ResourceSnapshot?.()?.special?.items || [];
  const total = stock.reduce((sum,row) => sum + row.value, 0);
  const delta = Math.round(stock.reduce((sum,row) => sum + row.delta, 0));
  button.setAttribute("aria-label", "特殊資源");
  button.innerHTML = `<span class="ico">${resolveV39ResourceIconGlyph("特産品")}</span><span><span class="resource-label">特殊資源</span><b class="value-main">${total.toLocaleString("ja-JP")}</b><small class="value-delta">${delta > 0 ? "+" : ""}${delta || 0}</small></span>`;
  button.addEventListener("click", event => {
    event.stopPropagation(); opened = !opened;
    document.getElementById("resourceDrawer")?.classList.remove("show");
    button.setAttribute("aria-expanded", String(opened)); renderPanel();
  });
  parent.appendChild(button);
  renderPanel();
}

document.addEventListener("pointerdown", event => {
  if (!opened || event.target.closest?.("#v39-specialty-panel,#v39-specialty-header")) return;
  opened = false; renderPanel();
  document.getElementById("v39-specialty-header")?.setAttribute("aria-expanded", "false");
});

const style = document.createElement("style");
style.textContent = `#v39-specialty-panel{position:absolute;z-index:55;top:6px;right:6px;width:min(350px,calc(100% - 12px));max-height:calc(100% - 12px);overflow:auto;background:#122126;border:1px solid #526f74;border-radius:8px;padding:8px;color:#e3eeed;font-size:var(--font-body)}#v39-specialty-panel[hidden]{display:none}.v39-specialty-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.v39-specialty-head button{font-size:var(--font-body);padding:4px 10px;background:#1b3036;color:#e3eeed;border:1px solid #526f74;border-radius:5px}.v39-specialty-list{display:grid;gap:6px;margin-top:6px}.v39-specialty-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto auto;align-items:center;gap:6px;padding:6px;background:#1a3035;border-radius:5px}.v39-specialty-row small{font-size:var(--font-secondary);color:#a8c4b4}.v39-harvest-note{grid-column:2/-1}.v39-specialty-tabs{display:flex;gap:6px;margin-top:6px}.v39-specialty-tabs button{font-size:var(--font-body);padding:5px 10px;color:#e3eeed;background:#1b3036;border:1px solid #526f74;border-radius:5px}.v39-specialty-tabs button[aria-selected="true"]{background:#24535c;border-color:#75dcec}`;
document.head.appendChild(style);
