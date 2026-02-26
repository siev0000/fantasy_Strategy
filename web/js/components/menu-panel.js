(function registerMenuPanel() {
  window.FSComponents = window.FSComponents || {};

  window.FSComponents.MenuPanel = {
    name: "MenuPanel",
    emits: ["open-modal"],
    template: `
      <section class="panel menu-panel">
        <h2>画面メニュー</h2>
        <div class="menu-buttons">
          <button class="secondary" type="button" @click="$emit('open-modal', 'room')">ルーム管理を開く</button>
          <button type="button" @click="$emit('open-modal', 'battle')">戦闘画面を開く</button>
          <button class="secondary" type="button" @click="$emit('open-modal', 'sim')">シミュレーターを開く</button>
        </div>
        <div class="small">地形は上で生成し、各画面はモーダルで操作します。</div>
      </section>
    `
  };
})();
