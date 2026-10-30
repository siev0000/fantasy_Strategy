import {resolveV39ResourceIcon} from '../../lib/resource-icon-glyphs.js';
import './v39-settlement-resource-flow.css';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const n=value=>Number(value)||0,format=value=>n(value).toLocaleString('ja-JP',{maximumFractionDigits:1});
export function renderV39SettlementResourceFlow(base,flow,mode='forecast',{metrics,facilityEffects=[]}={}){
  const stock={...base.foodStockByType,...base.materialStockByType};
  const keys=[...new Set([...Object.keys(stock),...Object.keys(flow?.productionByType||{})])]
    .filter(key=>[stock[key],flow?.productionByType?.[key],flow?.consumptionByType?.[key],flow?.deltaByType?.[key]].some(value=>n(value)!==0));
  const rows=keys.map(key=>{
    const icon=resolveV39ResourceIcon(key),delta=n(flow?.deltaByType?.[key]);
    const title=`維持 ${format(flow?.maintenanceByType?.[key])} / 人口増加等 ${format(flow?.growthConsumptionByType?.[key])} / 取引用積立 ${format(flow?.tradeReservedByType?.[key])}`;
    return `<tr><th scope="row"><span aria-hidden="true" style="color:${escape(icon.color||'inherit')}">${escape(icon.glyph)}</span> ${escape(key)}</th><td>${format(stock[key])}</td><td>+${format(flow?.productionByType?.[key])}</td><td title="${escape(title)}">−${format(flow?.consumptionByType?.[key])}</td><td class="${delta<0?'negative':delta>0?'positive':''}">${delta>=0?'+':''}${format(delta)}</td></tr>`;
  }).join('');
  const available=!!flow?.productionByType;
  const fixed=Object.entries(flow?.specialtyFoodFixedIncome||{}).filter(([,amount])=>n(amount)>0)
    .map(([name,amount])=>`${escape(name)} +${format(amount)}`).join(' / ');
  const facilityFixed=Object.entries(flow?.facilityFixedIncome||{}).filter(([,amount])=>n(amount)>0)
    .map(([name,amount])=>`${escape(name)} +${format(amount)}`).join(' / ');
  const modifiers=metrics?`<details><summary>現在の生産補正・施設</summary><p>稼働率 ${format(metrics.employmentRate*100)}%（人口による補正）</p><p>住民技能: ${Object.entries(metrics.productionMultipliers||{}).map(([name,value])=>`${escape(name)} ${format(value*100)}%`).join(' / ')}</p>${facilityEffects.map(row=>`<p>${escape(row.names.join('・'))} (${escape(row.key)})<br>このマスの施設補正: ${Object.entries(row.bonuses).map(([name,value])=>`${escape(name)} ${value>=0?'+':''}${format(value)}%`).join(' / ')}</p>`).join('')||'<p>生産補正のある設置施設なし</p>'}<p>住民技能の倍率と施設補正は別々に掛けます。農場を建てても住民技能の表示自体は上がりません。</p></details>`:'';
  return `<section class="settlement-resource-flow" data-settlement-page="production"><header><strong>1ターンの収支</strong><select data-resource-flow-mode aria-label="収支の表示内容"><option value="forecast"${mode==='forecast'?' selected':''}>現在の予測</option><option value="recorded"${mode==='recorded'?' selected':''}>前回実績</option></select><button type="button" data-resource-flow-refresh aria-label="収支を再計算" title="収支を再計算">🔄</button></header>
    ${available?`<small>${mode==='recorded'?`T${format(flow.turn)}の実績（在庫は現在値）`:'現在の人口・領土・施設による1T予測'}</small><table><thead><tr><th>資源</th><th>在庫</th><th>生産</th><th>消費</th><th>差引</th></tr></thead><tbody>${rows||'<tr><td colspan="5">産出・在庫なし</td></tr>'}</tbody></table>${n(flow.shortage)>0?'<p class="negative">食料不足あり。消費は実際に支払える量です。</p>':''}`:'<p>前回実績は未記録です。「現在の予測」で確認できます。</p>'}
    ${fixed?`<small>特産品の固定収入: ${fixed} / T（生産に含む）</small>`:''}
    ${facilityFixed?`<small>施設の固定収入: ${facilityFixed} / T（生産に含む・稼働率や技能倍率の対象外）</small>`:''}
    ${modifiers}
    <details><summary>収支の見方</summary><p>特産品の基礎取得量加算は、そのマスの通常生産補正を受けます。固定収入は別枠です。農場などの単体マス施設も、設置マスだけを増産します。生産が増えても人口増加等の消費で差引が変わらない場合があります。</p><p>生産は幸福度・都市特化・特殊資源の定期採取を含みます。消費は維持・人口増加・取引用積立。建設などの操作費用、別処理の輸送・維持費・災害被害は含みません。予測は工事完成や次の環境変化では変わります。</p></details></section>`;
}
