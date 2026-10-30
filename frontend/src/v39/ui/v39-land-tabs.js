export const V39_LAND_TABS = Object.freeze([
  {id:'overview', label:'概要'},
  {id:'production', label:'生産'},
  {id:'environment', label:'環境'},
  {id:'facilities', label:'建築・設備'}
]);

const fieldTabs = {
  生産:'production', 特産資源:'production',
  危険度:'environment', 環境効果:'environment', 天候:'environment', 浄化:'environment',
  回復補正:'environment', 移動停止:'environment', '川 / 滝':'environment',
  '火山 / 溶岩':'environment', 地形補正:'environment', 地形破壊:'environment',
  '結界 / 壁':'facilities', 開拓難易度:'facilities'
};

export function getV39LandFieldTab(label) { return fieldTabs[label] || 'overview'; }

export function selectV39LandTab(panel, requested) {
  const id = V39_LAND_TABS.some(tab => tab.id === requested) ? requested : 'overview';
  panel.dataset.landTab = id;
  for (const button of panel.querySelectorAll('[data-land-tab]')) {
    const active = button.dataset.landTab === id;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  for (const section of panel.querySelectorAll('[data-land-page]')) section.hidden = section.dataset.landPage !== id;
  const body = panel.querySelector('#v39-land-scroll');
  if (body) body.scrollTop = 0;
  return id;
}
