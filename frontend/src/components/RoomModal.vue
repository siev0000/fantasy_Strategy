<script setup>
import BaseModal from "./BaseModal.vue";

defineProps({
  show: { type: Boolean, default: false },
  socketReady: { type: Boolean, default: false },
  activeRoomId: { type: String, default: "" },
  roomIdInput: { type: String, default: "" },
  playerNameInput: { type: String, default: "" },
  sessionStatusText: { type: String, default: "" },
  sessionStatusClass: { type: String, default: "" },
  playersLabel: { type: String, default: "-" },
  chatLog: { type: Array, default: () => [] },
  chatMessageInput: { type: String, default: "" }
});

defineEmits([
  "close",
  "update:room-id-input",
  "update:player-name-input",
  "update:chat-message-input",
  "create-room",
  "join-room",
  "leave-room",
  "send-chat"
]);
</script>

<template>
  <base-modal :show="show" title="ルーム管理" @close="$emit('close')">
    <section class="multiplayer">
      <label class="mp-label">ルームID
        <input
          type="text"
          maxlength="20"
          :value="roomIdInput"
          @input="$emit('update:room-id-input', $event.target.value)"
        />
      </label>
      <label class="mp-label">プレイヤー名
        <input
          type="text"
          maxlength="20"
          :value="playerNameInput"
          @input="$emit('update:player-name-input', $event.target.value)"
        />
      </label>
      <div class="mp-actions">
        <button class="secondary" type="button" @click="$emit('create-room')" :disabled="!socketReady">ルーム作成</button>
        <button class="secondary" type="button" @click="$emit('join-room')" :disabled="!socketReady">ルーム参加</button>
        <button type="button" @click="$emit('leave-room')" :disabled="!activeRoomId">退出</button>
      </div>
      <div class="session-status" :class="sessionStatusClass">{{ sessionStatusText }}</div>
      <div class="small">参加者: {{ playersLabel }}</div>
      <div class="chat-panel">
        <div class="small">ルームチャット</div>
        <div class="chat-log">
          <div v-if="!chatLog.length" class="chat-empty small">まだメッセージはありません。</div>
          <div v-for="item in chatLog" :key="item.id" class="chat-item">
            <span class="chat-sender">{{ item.sender }}:</span>
            <span class="chat-message">{{ item.message }}</span>
          </div>
        </div>
        <div class="chat-input-row">
          <input
            type="text"
            maxlength="240"
            :value="chatMessageInput"
            :disabled="!activeRoomId || !socketReady"
            placeholder="チャットを入力"
            @input="$emit('update:chat-message-input', $event.target.value)"
            @keydown.enter.prevent="$emit('send-chat')"
          />
          <button
            type="button"
            class="secondary"
            :disabled="!activeRoomId || !socketReady || !String(chatMessageInput || '').trim()"
            @click="$emit('send-chat')"
          >送信</button>
        </div>
      </div>
    </section>
  </base-modal>
</template>

<style scoped>
.multiplayer {
  display: grid;
  gap: 10px;
}

.chat-panel {
  display: grid;
  gap: 6px;
}

.chat-log {
  max-height: 220px;
  overflow: auto;
  border: 1px solid rgba(220, 188, 133, 0.35);
  border-radius: 8px;
  padding: 8px;
  background: rgba(12, 9, 6, 0.35);
  display: grid;
  gap: 4px;
}

.chat-item {
  display: flex;
  gap: 6px;
  align-items: baseline;
  line-height: 1.35;
}

.chat-sender {
  font-weight: 700;
  color: #f4d490;
}

.chat-message {
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-empty {
  opacity: 0.8;
}

.chat-input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}

.chat-input-row input {
  width: 100%;
}
</style>
