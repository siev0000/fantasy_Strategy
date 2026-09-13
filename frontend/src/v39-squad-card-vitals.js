const STYLE_ID = "v39-squad-card-vitals-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .squad-card.selected .squad-bars{
      display:grid!important;
      grid-template-columns:1fr!important;
      gap:0!important;
      min-width:0!important;
    }
    .squad-card.selected .v39-card-vital{
      min-width:0!important;
      display:grid!important;
      grid-template-columns:18px minmax(0,1fr) max-content!important;
      align-items:center!important;
      gap:4px!important;
      padding:1px 0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      line-height:1!important;
    }
    .squad-card.selected .v39-card-vital + .v39-card-vital{
      margin-top:0!important;
    }
    .squad-card.selected .v39-card-vital-label{
      font-size:8px!important;
      font-weight:800!important;
      color:#a7b5b8!important;
      white-space:nowrap!important;
    }
    .squad-card.selected .v39-card-vital-track{
      min-width:0!important;
      height:7px!important;
      border-radius:999px!important;
      overflow:hidden!important;
      background:#263136!important;
      box-shadow:inset 0 0 0 1px rgba(0,0,0,.28)!important;
    }
    .squad-card.selected .v39-card-vital-fill{
      display:block!important;
      height:100%!important;
      min-width:0!important;
      border-radius:inherit!important;
    }
    .squad-card.selected .v39-card-vital.hp .v39-card-vital-fill{
      background:linear-gradient(90deg,#3caa5b,#89df8e)!important;
    }
    .squad-card.selected .v39-card-vital.ap .v39-card-vital-fill{
      background:linear-gradient(90deg,#247dc2,#72caff)!important;
    }
    .squad-card.selected .v39-card-vital-value{
      font-size:8px!important;
      font-weight:700!important;
      color:#dbe5e2!important;
      white-space:nowrap!important;
      text-align:right!important;
    }
    .squad-card.selected{
      min-height:0!important;
      gap:4px!important;
    }
    @media(max-width:430px) and (orientation:portrait){
      .squad-card.selected .v39-card-vital{
        grid-template-columns:17px minmax(0,1fr) max-content!important;
        gap:3px!important;
      }
      .squad-card.selected .v39-card-vital-label,
      .squad-card.selected .v39-card-vital-value{
        font-size:7px!important;
      }
      .squad-card.selected .v39-card-vital-track{
        height:6px!important;
      }
    }
  `;
  document.head.appendChild(style);
}

function parseVital(raw) {
  const match = String(raw || "").match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const current = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(max)) return null;
  const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return { current, max, percent };
}

function compactSelectedCard(card) {
  if (!(card instanceof HTMLElement) || !card.classList.contains("selected")) return;
  const bars = card.querySelector(".squad-bars");
  if (!(bars instanceof HTMLElement)) return;
  if (bars.dataset.v39Gauge === "1") return;

  const hpRaw = bars.querySelector(".squad-stat.hp b")?.textContent || "";
  const apRaw = bars.querySelector(".squad-stat.ap b")?.textContent || "";
  const hp = parseVital(hpRaw);
  const ap = parseVital(apRaw);
  if (!hp || !ap) return;

  const vitalRow = (kind, label, value) => `
    <div class="v39-card-vital ${kind}">
      <span class="v39-card-vital-label">${label}</span>
      <span class="v39-card-vital-track" aria-hidden="true">
        <i class="v39-card-vital-fill" style="width:${value.percent.toFixed(2)}%"></i>
      </span>
      <b class="v39-card-vital-value">${value.current}/${value.max}</b>
    </div>`;

  bars.innerHTML = vitalRow("hp", "HP", hp) + vitalRow("ap", "AP", ap);
  bars.dataset.v39Gauge = "1";
}

function refresh() {
  document.querySelectorAll(".squad-card.selected").forEach(compactSelectedCard);
}

function install() {
  installStyles();
  const attach = () => {
    const list = document.getElementById("squadMemberList");
    if (!(list instanceof HTMLElement)) {
      window.setTimeout(attach, 50);
      return;
    }

    const observer = new MutationObserver(() => queueMicrotask(refresh));
    observer.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    refresh();
    window.refreshV39SquadCardVitals = refresh;
  };
  attach();
}

install();
