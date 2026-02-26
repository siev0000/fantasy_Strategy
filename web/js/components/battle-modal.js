(function registerBattleModal() {
  window.FSComponents = window.FSComponents || {};

  window.FSComponents.BattleModal = {
    name: "BattleModal",
    components: {
      BaseModal: window.FSComponents.BaseModal
    },
    props: {
      show: { type: Boolean, default: false },
      currentState: {
        type: Object,
        default: () => ({
          allies: [],
          enemies: [],
          log: [],
          statusText: "",
          statusClass: ""
        })
      },
      actionDisabled: { type: Boolean, default: false },
      nextDisabled: { type: Boolean, default: false },
      resetDisabled: { type: Boolean, default: false }
    },
    emits: ["close", "action"],
    methods: {
      unitHpRatio(unit) {
        return Math.round((unit.hp / unit.maxHp) * 100);
      }
    },
    template: `
      <base-modal :show="show" title="戦闘画面" :wide="true" @close="$emit('close')">
        <div class="battle-layout">
          <section class="panel">
            <div class="status" :class="currentState.statusClass || ''">
              {{ currentState.statusText }}
            </div>
            <h2>味方</h2>
            <div class="field">
              <article
                v-for="unit in currentState.allies"
                :key="unit.id"
                class="unit ally"
                :class="{ dead: !unit.alive }"
              >
                <h3>{{ unit.name }}</h3>
                <div class="small">種族: {{ unit.race }}</div>
                <div class="small">ATK: {{ unit.atk }} / HP: {{ unit.hp }}/{{ unit.maxHp }}</div>
                <div class="hp-wrap">
                  <div class="hp" :style="{ width: unitHpRatio(unit) + '%' }"></div>
                </div>
              </article>
            </div>

            <h2>敵</h2>
            <div class="field">
              <article
                v-for="unit in currentState.enemies"
                :key="unit.id"
                class="unit enemy"
                :class="{ dead: !unit.alive }"
              >
                <h3>{{ unit.name }}</h3>
                <div class="small">種族: {{ unit.race }}</div>
                <div class="small">ATK: {{ unit.atk }} / HP: {{ unit.hp }}/{{ unit.maxHp }}</div>
                <div class="hp-wrap">
                  <div class="hp" :style="{ width: unitHpRatio(unit) + '%' }"></div>
                </div>
              </article>
            </div>
          </section>

          <aside class="panel controls">
            <button @click="$emit('action', 'attack')" :disabled="actionDisabled">通常攻撃</button>
            <button class="secondary" @click="$emit('action', 'skill')" :disabled="actionDisabled">種族スキル</button>
            <button @click="$emit('action', 'next')" :disabled="nextDisabled">ターン終了</button>
            <button class="secondary" @click="$emit('action', 'reset')" :disabled="resetDisabled">リセット</button>
            <div id="log">
              <div v-for="(entry, idx) in currentState.log" :key="idx">
                <b v-if="entry.strong">{{ entry.text }}</b>
                <span v-else>{{ entry.text }}</span>
              </div>
            </div>
          </aside>
        </div>
      </base-modal>
    `
  };
})();
