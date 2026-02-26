(function registerRoomModal() {
  window.FSComponents = window.FSComponents || {};

  window.FSComponents.RoomModal = {
    name: "RoomModal",
    components: {
      BaseModal: window.FSComponents.BaseModal
    },
    props: {
      show: { type: Boolean, default: false },
      socketReady: { type: Boolean, default: false },
      activeRoomId: { type: String, default: "" },
      roomIdInput: { type: String, default: "" },
      playerNameInput: { type: String, default: "" },
      sessionStatusText: { type: String, default: "" },
      sessionStatusClass: { type: String, default: "" },
      playersLabel: { type: String, default: "-" }
    },
    emits: [
      "close",
      "update:roomIdInput",
      "update:playerNameInput",
      "create-room",
      "join-room",
      "leave-room"
    ],
    template: `
      <base-modal :show="show" title="ルーム管理" @close="$emit('close')">
        <section class="multiplayer">
          <label class="mp-label">ルームID
            <input
              type="text"
              maxlength="20"
              :value="roomIdInput"
              @input="$emit('update:roomIdInput', $event.target.value)"
            />
          </label>
          <label class="mp-label">プレイヤー名
            <input
              type="text"
              maxlength="20"
              :value="playerNameInput"
              @input="$emit('update:playerNameInput', $event.target.value)"
            />
          </label>
          <div class="mp-actions">
            <button class="secondary" type="button" @click="$emit('create-room')" :disabled="!socketReady">ルーム作成</button>
            <button class="secondary" type="button" @click="$emit('join-room')" :disabled="!socketReady">ルーム参加</button>
            <button type="button" @click="$emit('leave-room')" :disabled="!activeRoomId">退出</button>
          </div>
          <div class="session-status" :class="sessionStatusClass">{{ sessionStatusText }}</div>
          <div class="small">参加者: {{ playersLabel }}</div>
        </section>
      </base-modal>
    `
  };
})();
