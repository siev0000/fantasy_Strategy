(function registerSimulatorModal() {
  window.FSComponents = window.FSComponents || {};

  window.FSComponents.SimulatorModal = {
    name: "SimulatorModal",
    components: {
      BaseModal: window.FSComponents.BaseModal
    },
    props: {
      show: { type: Boolean, default: false },
      sim: {
        type: Object,
        default: () => ({})
      },
      simResult: { type: String, default: "" }
    },
    emits: ["close", "run-turn"],
    template: `
      <base-modal :show="show" title="プレイテスト計算（仮）" :wide="true" @close="$emit('close')">
        <div class="sim-grid">
          <label>地形難易度
            <input v-model.number="sim.terrainDifficulty" type="number" min="1" max="5" />
          </label>
          <label>開拓値
            <input v-model.number="sim.developmentPower" type="number" min="1" />
          </label>
          <label>参加人数（上限4）
            <input v-model.number="sim.participants" type="number" min="1" max="4" />
          </label>
          <label>現在開拓進捗（%）
            <input v-model.number="sim.currentProgress" type="number" min="0" max="100" />
          </label>
          <label>国家体制補正（%）
            <input v-model.number="sim.govBonus" type="number" />
          </label>
          <label>施設補正（%）
            <input v-model.number="sim.facilityBonus" type="number" />
          </label>
          <label>政策補正（%）
            <input v-model.number="sim.policyBonus" type="number" />
          </label>
          <label>モンスター災害率（%）
            <input v-model.number="sim.monsterRisk" type="number" min="0" max="100" />
          </label>
          <label>食料収支
            <select v-model.number="sim.foodBalance">
              <option :value="1">黒字</option>
              <option :value="0">均衡</option>
              <option :value="-1">赤字</option>
            </select>
          </label>
          <label>現在不満度（0-100）
            <input v-model.number="sim.dissatisfaction" type="number" min="0" max="100" />
          </label>
          <label>仕事充足
            <select v-model.number="sim.jobsFilled">
              <option :value="1">充足</option>
              <option :value="0">不足</option>
            </select>
          </label>
          <label>人口超過
            <select v-model.number="sim.popOver">
              <option :value="0">なし</option>
              <option :value="1">あり</option>
            </select>
          </label>
          <label>防衛不足
            <select v-model.number="sim.defenseLow">
              <option :value="0">なし</option>
              <option :value="1">あり</option>
            </select>
          </label>
        </div>
        <div style="margin-top:8px;">
          <button class="secondary" @click="$emit('run-turn')">1ターン計算</button>
        </div>
        <div id="simResult">{{ simResult }}</div>
      </base-modal>
    `
  };
})();
