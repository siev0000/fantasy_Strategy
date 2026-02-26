(function registerBaseModal() {
  window.FSComponents = window.FSComponents || {};

  window.FSComponents.BaseModal = {
    name: "BaseModal",
    props: {
      show: { type: Boolean, default: false },
      title: { type: String, default: "" },
      wide: { type: Boolean, default: false }
    },
    emits: ["close"],
    template: `
      <div v-if="show" class="modal-backdrop" @click.self="$emit('close')">
        <section class="modal-card panel" :class="{ 'modal-card-wide': wide }">
          <div class="modal-head">
            <h2>{{ title }}</h2>
            <button class="modal-close" type="button" @click="$emit('close')">×</button>
          </div>
          <slot></slot>
        </section>
      </div>
    `
  };
})();
