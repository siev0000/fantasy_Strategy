const STYLE_ID = "v39-squad-card-vitals-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .squad-card .squad-bars{
      display:grid!important;
      grid-template-columns:1fr!important;
      gap:0!important;
      min-width:0!important;
      margin:0!important;
    }
    .squad-card .v39-card-vital{
      min-width:0!important;
      display:grid!important;
      grid-template-columns:20px minmax(0,1fr)!important;
      align-items:center!important;
      gap:3px!important;
      min-height:18px!important;
      padding:0!important;
      margin:0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      line-height:1!important;
    }
    .squad-card .v39-card-vital + .v39-card-vital{
      margin-top:0!important;
    }
    .squad-card .v39-card-vital-label{
      font-size:13px!important;
      font-weight:800!important;
      color:#a7b5b8!important;
      white-space:nowrap!important;
    }
    .squad-card .v39-card-vital-track{
      position:relative!important;
      display:block!important;
      min-width:0!important;
      width:100%!important;
      height:16px!important;
      border-radius:4px!important;
      overflow:hidden!important;
      background:#263136!important;
      box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)!important;
    }
    .squad-card .v39-card-vital-fill{
      position:absolute!important;
      left:0!important;
      top:0!important;
      bottom:0!important;
      display:block!important;
      height:100%!important;
      min-width:0!important;
      border-radius:inherit!important;
      z-index:1!important;
    }
    .squad-card .v39-card-vital.hp .v39-card-vital-fill{
      background:linear-gradient(90deg,#3caa5b,#89df8e)!important;
    }
    .squad-card .v39-card-vital.ap .v39-card-vital-fill{
      background:linear-gradient(90deg,#247dc2,#72caff)!important;
    }
    .squad-card .v39-card-vital-value{
      position:absolute!important;
      inset:0!important;
      z-index:2!important;
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      padding:0 3px!important;
      margin:0!important;
      font-size:13px!important;
      font-weight:800!important;
      line-height:1!important;
      color:#f4f8f6!important;
      white-space:nowrap!important;
      text-align:center!important;
      text-shadow:0 1px 2px rgba(0,0,0,.95), 1px 0 1px rgba(0,0,0,.8)!important;
      pointer-events:none!important;
    }
    .squad-card{
      gap:2px!important;
      padding:4px!important;
    }
    .squad-card-top{
      margin:0!important;
    }
    @media(max-width:430px) and (orientation:portrait){
      .squad-card .v39-card-vital{
        grid-template-columns:20px minmax(0,1fr)!important;
        gap:2px!important;
        min-height:17px!important;
      }
      .squad-card .v39-card-vital-label{
        font-size:13px!important;
      }
      .squad-card .v39-card-vital-value{
        font-size:13px!important;
      }
      .squad-card .v39-card-vital-track{
        height:15px!important;
      }
      .squad-card{
        padding:3px!important;
        gap:1px!important;
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

function gaugeMarkup(kind, label, value) {
  return `
    <div class="v39-card-vital ${kind}">
      <span class="v39-card-vital-label">${label}</span>
      <span class="v39-card-vital-track">
        <i class="v39-card-vital-fill" style="width:${value.percent.toFixed(2)}%"></i>
        <b class="v39-card-vital-value">${value.current}/${value.max}</b>
      </span>
    </div>`;
}

function convertCard(card) {
  if (!(card instanceof HTMLElement)) return;
  const bars = card.querySelector(".squad-bars");
  if (!(bars instanceof HTMLElement)) return;
  if (bars.dataset.v39Gauge === "1" && bars.querySelectorAll(".v39-card-vital").length === 2) return;

  const hpRaw = bars.querySelector(".squad-stat.hp b")?.textContent || bars.dataset.hp || "";
  const apRaw = bars.querySelector(".squad-stat.ap b")?.textContent || bars.dataset.ap || "";
  const hp = parseVital(hpRaw);
  const ap = parseVital(apRaw);
  if (!hp || !ap) return;

  bars.dataset.hp = `${hp.current}/${hp.max}`;
  bars.dataset.ap = `${ap.current}/${ap.max}`;
  bars.innerHTML = gaugeMarkup("hp", "HP", hp) + gaugeMarkup("ap", "AP", ap);
  bars.dataset.v39Gauge = "1";
}

function refresh() {
  document.querySelectorAll("#squadMemberList .squad-card").forEach(convertCard);
}

function install() {
  installStyles();

  const attach = () => {
    const list = document.getElementById("squadMemberList");
    if (!(list instanceof HTMLElement)) {
      window.setTimeout(attach, 50);
      return;
    }

    let scheduled = false;
    const scheduleRefresh = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        refresh();
      });
    };

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(list, { childList: true, subtree: true });
    list.addEventListener("click", () => window.setTimeout(scheduleRefresh, 0), true);

    refresh();
    window.refreshV39SquadCardVitals = refresh;
  };

  attach();
}

install();
