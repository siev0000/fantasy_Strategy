window.addEventListener('DOMContentLoaded', () => {
  if (window.App?.initBattle) window.App.initBattle();
  if (window.App?.initSimulator) window.App.initSimulator();
  if (window.App?.initMapGenerator) window.App.initMapGenerator();
});
