const finite=value=>typeof value==='number'&&Number.isFinite(value);
const format=value=>Math.abs(value).toLocaleString('ja-JP',{maximumFractionDigits:1});
const signed=value=>value>0?`＋${format(value)}`:value<0?`−${format(value)}`:'±0';
const tone=value=>value>0?'positive':value<0?'negative':'neutral';

export function inspectV39PopulationTrend(settlement,race) {
  const growth=settlement?.populationGrowthByRace?.[race]||{};
  const population=finite(growth.lastPopulationDelta)?growth.lastPopulationDelta:settlement?.lastEconomyDelta?.populationByRace?.[race];
  const gauge=growth.lastGaugeChange;
  const turn=settlement?.lastEconomyDelta?.turn;
  return {population:finite(population)?population:null,gauge:finite(gauge)?gauge:null,turn:finite(turn)?turn:null};
}

export function renderV39PopulationTrend(settlement,race) {
  const trend=inspectV39PopulationTrend(settlement,race);
  if(trend.population===null&&trend.gauge===null)return '<span class="settlement-population-trend neutral">増減は未記録</span>';
  const prefix=trend.turn!==null?`前回 T${trend.turn}`:'前回';
  const population=trend.population===null?'人口増減は未記録':`人口 ${signed(trend.population)}人`;
  const growth=trend.gauge===null?'成長増減は未記録':`成長 ${signed(trend.gauge)}（${trend.gauge>0?'成長中':trend.gauge<0?'減少中':'停滞'}）`;
  return `<span class="settlement-population-trend ${tone(trend.population)}">${prefix}：${population}</span><span class="settlement-population-trend ${tone(trend.gauge)}" title="前回ターンの成長資源の投入・維持不足によるゲージ変化。人口増加時に消費したゲージは減少扱いにしません。">${growth}</span>`;
}
