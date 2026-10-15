import { resolveV39UnitExpDisplay } from "../../lib/v39-unit-experience.js";
import { getRaceIconSrc } from "../../lib/race-icon-library.js";

const escapeHtml = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const ratio = (current,max) => max > 0 ? Math.max(0,Math.min(100,current/max*100)) : 0;
const count = value => Math.max(0,Number(value)||0);

function automaticOperationIcon(unit) {
  if (count(unit.hp ?? unit.currentHp) <= 0 || unit.state === "死亡") return "";
  const duty = unit.caveDuty;
  const route = unit.tradeAssignment?{...unit.tradeAssignment,enabled:unit.tradeAssignment.automatic,status:unit.tradeAssignment.automatic?'取引・自動往復':'取引中断'}:unit.transportAssignment;
  if (!duty && !route) return "";
  const stopped = duty ? /停止|塞がれ/.test(duty.status || "")
    : route.enabled !== true || ["blocked","paused","awaiting-route"].includes(route.status);
  const operation = duty?.duty === "guard" ? "入口警備" : "自動輸送";
  const icon = stopped ? "⚠" : duty?.duty === "guard" ? "🛡" : "🔁";
  const description = `${operation} / ${duty?.status || route?.reason || (stopped ? "停止・経路未設定" : "自動往復中")}`;
  return ` <span class="v39-auto-operation-icon" title="${escapeHtml(description)}" aria-label="${escapeHtml(description)}">${icon}</span>`;
}

function raceValue(unit, options = {}) {
  return options.race
    ?? unit?.race
    ?? unit?.raceName
    ?? unit?.種族
    ?? unit?.raceKey
    ?? "";
}

function levelBadgeIconMarkup(unit, options = {}) {
  const src = getRaceIconSrc(raceValue(unit, options));
  if (src) {
    return `<img class="squad-race-icon" src="${escapeHtml(src)}" alt="" aria-hidden="true">`;
  }
  return escapeHtml(options.icon ?? unit.icon ?? unit.glyph ?? unit.symbol ?? "◆");
}

// 部隊一覧と自キャラ画面が同じカードを描く。クリック先だけ呼出し側で指定する。
export function renderV39UnitCard(unit, options={}) {
  const id = options.id ?? unit.id;
  const name = options.name ?? unit.name ?? id;
  const exp = resolveV39UnitExpDisplay(unit);
  const hp = options.hp ?? {current:count(unit.hp ?? unit.currentHp),max:count(unit.maxHp ?? unit.status?.HP)};
  const ap = options.ap ?? {current:count(unit.ap ?? unit.currentAp),max:count(unit.maxAp ?? unit.apMax ?? 100)};
  const defenses = options.defenses ?? [["shield","盾"],["barrier","障壁"]].flatMap(([kind,label]) => {
    const value = unit[kind];
    return value?.maximum > 0 && (kind !== "barrier" || value.remaining > 0)
      ? [{kind,label,remaining:count(value.remaining),percent:ratio(count(value.remaining),value.maximum)}] : [];
  });
  const gauge = (kind,label,values,overlays=[]) => `<div class="v39-card-vital ${kind}"><span class="v39-card-vital-label">${label}</span><span class="v39-card-vital-track"><i class="v39-card-vital-fill" style="width:${ratio(values.current,values.max).toFixed(2)}%"></i>${overlays.map(value=>`<i class="v39-card-defense-fill ${value.kind}" style="width:${value.percent.toFixed(2)}%" aria-hidden="true"></i>`).join("")}<b class="v39-card-vital-value">${values.current}/${values.max}</b></span></div>`;
  const position = options.position ?? `(${unit.x ?? "-"},${unit.y ?? "-"})`;
  const positionLabel = escapeHtml(position) + automaticOperationIcon(unit);
  const expTitle = exp.atLimit ? `Lv${exp.level} 成長上限` : `Lv${exp.level} EXP ${exp.exp}/${exp.need}`;
  const attribute = options.attribute || (options.character ? "data-v39-character-row" : "data-v39-unit-id");
  const badgeIcon = levelBadgeIconMarkup(unit, options);
  return `<button class="squad-card${options.selected ? " selected" : ""}${options.character ? " v39-char-unit-row" : ""}${options.dead ? " dead" : ""}" ${attribute}="${escapeHtml(id)}" title="${escapeHtml(name)} Lv${exp.level}"><div class="squad-card-top"><div class="squad-main"><span class="squad-exp-ring" style="--v39-exp-progress:${exp.percent.toFixed(2)}%" title="${escapeHtml(expTitle)}" aria-label="${escapeHtml(expTitle)}"><span class="squad-icon">${badgeIcon}</span><span class="squad-level-number" aria-hidden="true">${exp.level}</span></span><div class="squad-name-wrap"><b class="squad-name" title="${escapeHtml(name)}">${escapeHtml(name)}</b><small class="squad-pos">${positionLabel}${unit.movementHold ? " ⏸" : ""}${defenses.map(value=>` <span class="v39-defense-value ${value.kind}">${value.label}${value.remaining}</span>`).join("")}</small></div></div></div><div class="squad-bars" data-v39-gauge="1">${gauge("hp","HP",hp,defenses)}${gauge("ap","AP",ap)}</div></button>`;
}
